/**
 * mockPipelineEdge — Playwright page.route mocks for edge-case pipeline scenarios.
 *
 * Layers on top of the happy-path mockPipelineHappy contract. Each scenario
 * overrides specific route handlers to simulate failure, quota, retry, or
 * intervention conditions.
 *
 * Supported scenarios (extensible for future issues):
 *   'low-score-retry'        — review iter 1 returns score <90, iter 2 passes
 *   'max-iterations'         — every review iter returns score <90 (exhausts budget)
 *   'hard-fail'              — review returns score below hardFailThreshold (50)
 *   'provider-quota'         — generate returns 429 PROVIDER_QUOTA_EXHAUSTED
 *   'manual-paste'           — generate returns 422 NO_PROVIDER_CONFIGURED
 *   'stage-failure-retry'    — produce fails once, succeeds on retry
 *   'malformed-json'         — generate returns 200 but body fails Zod parsing
 *   'manual-pause-resume'    — pipeline is slowed; pauses mid-flight
 *   'manual-abort'           — pipeline is slowed; aborts mid-flight
 */

import type { Page, Route } from '@playwright/test'
import { mockPipelineHappy, type HappyProjectSeed, type HappyMock } from './mockPipelineHappy'

export type EdgeScenario =
  | 'low-score-retry'
  | 'max-iterations'
  | 'hard-fail'
  | 'provider-quota'
  | 'manual-paste'
  | 'stage-failure-retry'
  | 'malformed-json'
  | 'manual-pause-resume'
  | 'manual-abort'

export interface EdgeMock extends HappyMock {
  scenario: EdgeScenario
  /** How many times the review stage was invoked */
  reviewCallCount: number
  /** Track produce/generate call counts per stage */
  callCounts: Map<string, number>
  /** Captured PATCH / POST bodies keyed by url pattern */
  patchBodies: Array<{ url: string; body: unknown }>
  /**
   * Force the review stage_run into awaiting_user(max_iterations) state without
   * a POST /review fire (used by overview-mode tests where the front-end never
   * triggers reviews — the backend autopilot owns the loop). No-op for
   * scenarios other than 'max-iterations'.
   */
  parkReviewMax: () => void
}

async function readBody(route: Route): Promise<unknown> {
  const raw = route.request().postData()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function nowIso(offsetSec = 0): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString()
}

/**
 * Build the stage-run row for a review outcome.
 * Used by the edge-scenario route handlers to return appropriate responses.
 */
function reviewRunRow(
  projectId: string,
  opts: {
    score: number
    verdict: 'approved' | 'revision_required'
    awaitingReason?: 'manual_review' | 'max_iterations' | null
    status: 'completed' | 'awaiting_user' | 'failed'
  },
) {
  return {
    id: `sr-review-e2e-${Date.now()}`,
    projectId,
    stage: 'review',
    status: opts.status,
    attemptNo: 1,
    outcomeJson: {
      score: opts.score,
      verdict: opts.verdict,
      qualityTier: opts.score >= 90 ? 'excellent' : opts.score >= 50 ? 'needs_improvement' : 'poor',
      feedbackJson: {
        summary: 'E2E edge-case feedback',
        revisionInstructions: opts.verdict === 'revision_required'
          ? 'Please improve the introduction and add more detail to section 2.'
          : null,
      },
    },
    awaitingReason: opts.awaitingReason ?? null,
    payloadRef: { kind: 'content_draft', id: 'draft-e2e-1' },
    finishedAt: nowIso(),
    createdAt: nowIso(-10),
    updatedAt: nowIso(),
  }
}

export async function mockPipelineEdge(
  page: Page,
  scenario: EdgeScenario,
  opts: { project: HappyProjectSeed },
): Promise<EdgeMock> {
  const { project } = opts

  // Start with happy-path base (registers catch-all + shared routes)
  const happy = await mockPipelineHappy(page, { project })

  let reviewCallCount = 0
  const callCounts = new Map<string, number>()
  const patchBodies: EdgeMock['patchBodies'] = []

  // ── Scenario-specific route overrides ────────────────────────────────────────
  // Routes registered AFTER happy base → run FIRST (Playwright matches in reverse
  // registration order for same-pattern routes — last registered wins first shot).

  if (scenario === 'low-score-retry') {
    // Review iter 1 → score 65 (revision_required, completed so orchestrator loops)
    // Review iter 2 → score 95 (approved, completed)
    //
    // Two endpoints must agree on the per-iteration values so the engine UI
    // matches the orchestrator snapshot:
    //   POST /api/content-drafts/:id/review — what ReviewEngine actually fires
    //     (returns the new score/verdict/iteration_count + feedback)
    //   POST /api/projects/:id/stage-runs (stage=review) — what the orchestrator
    //     would have written; some flows still POST to this from the engine host
    //   GET /api/content-drafts/:id — what ReviewEngine refetches; must reflect
    //     the latest review fields
    let lastReviewScore = 0
    let lastReviewVerdict: 'approved' | 'revision_required' | 'pending' = 'pending'
    function nextReviewIter() {
      reviewCallCount++
      const isApproved = reviewCallCount >= 2
      lastReviewScore = isApproved ? 95 : 65
      lastReviewVerdict = isApproved ? 'approved' : 'revision_required'
      return {
        callNo: reviewCallCount,
        score: lastReviewScore,
        verdict: lastReviewVerdict as 'approved' | 'revision_required',
      }
    }
    function reviewFeedbackPayload(score: number, verdict: 'approved' | 'revision_required') {
      const blogReview: Record<string, unknown> = {
        score,
        verdict: verdict === 'approved' ? 'Approved' : 'Revision Required',
        strengths: ['clear thesis', 'good keyword coverage'],
        issues: verdict === 'revision_required'
          ? {
              critical: [
                { location: 'intro', issue: 'Hook is weak', suggested_fix: 'Open with a concrete number.' },
              ],
              minor: [],
            }
          : { critical: [], minor: [] },
      }
      return {
        overall_verdict: verdict === 'approved' ? 'Approved' : 'Revision Required',
        blog_review: blogReview,
        summary: verdict === 'approved' ? 'Ready to publish.' : 'Improve the intro.',
      }
    }

    // POST /api/content-drafts/:id/review — primary review trigger fired by ReviewEngine.
    await page.route(/\/api\/content-drafts\/[^/]+\/review/, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { callNo, score, verdict } = nextReviewIter()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'draft-e2e-1',
            status: 'in_review',
            review_score: score,
            review_verdict: verdict,
            review_feedback_json: reviewFeedbackPayload(score, verdict),
            iteration_count: callNo,
          },
          error: null,
        }),
      })
    })

    // GET /api/content-drafts/:id — surface the latest review fields when the
    // engine refetches after the POST resolves.
    await page.route(/\/api\/content-drafts\/[^/]+$/, async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'draft-e2e-1',
            status: lastReviewVerdict === 'approved' ? 'approved' : 'in_review',
            canonical_core_json: { title: 'EC R1 Draft', thesis: 'Loop until approved' },
            draft_json: {
              blog: { full_draft: 'Body markdown for EC R1 draft.' },
              full_draft: 'Body markdown for EC R1 draft.',
              word_count: 800,
            },
            body_markdown: 'Body markdown for EC R1 draft.',
            word_count: 800,
            title: 'EC R1 Draft',
            review_score: lastReviewScore || null,
            review_verdict: lastReviewVerdict,
            review_feedback_json: lastReviewScore
              ? reviewFeedbackPayload(lastReviewScore, lastReviewVerdict as 'approved' | 'revision_required')
              : null,
            iteration_count: reviewCallCount,
          },
          error: null,
        }),
      })
    })

    // POST /api/projects/:id/stage-runs (stage=review) — keep the orchestrator
    // snapshot consistent with whichever iter just ran.
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      if (body?.stage !== 'review') return route.fallback()

      // If no /review POST has fired yet, advance the iter here; otherwise mirror
      // the most recent values written by /review (don't double-increment).
      let score = lastReviewScore
      let verdict = lastReviewVerdict
      if (verdict === 'pending') {
        const next = nextReviewIter()
        score = next.score
        verdict = next.verdict
      }
      const row = reviewRunRow(project.id, {
        score,
        verdict: verdict as 'approved' | 'revision_required',
        status: 'completed',
      })
      happy.completeStage('review')

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { stageRun: row },
          error: null,
        }),
      })
    })

    // Production stage: track calls and inject review feedback on iter 2
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string; input?: unknown } | null
      if (body?.stage !== 'production') return route.fallback()

      const prodCount = (callCounts.get('production') ?? 0) + 1
      callCounts.set('production', prodCount)
      happy.completeStage('production')

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            stageRun: {
              id: `sr-production-e2e-${prodCount}`,
              projectId: project.id,
              stage: 'production',
              status: 'completed',
              attemptNo: prodCount,
              outcomeJson: {
                draftId: 'draft-e2e-1',
                draftTitle: 'E2E Revised Draft',
                draftContent: `Revised content iteration ${prodCount}`,
                // Echo the review feedback back so tests can assert injection
                reviewFeedbackInjected: prodCount > 1,
              },
              payloadRef: { kind: 'content_draft', id: 'draft-e2e-1' },
              finishedAt: nowIso(),
              createdAt: nowIso(-5),
              updatedAt: nowIso(),
            },
          },
          error: null,
        }),
      })
    })
  }

  if (scenario === 'max-iterations') {
    // Every review returns score 70 (revision_required). After maxIterations=2,
    // review dispatcher parks run in awaiting_user(max_iterations).
    // Production emit site: apps/api/src/jobs/pipeline-review-dispatch.ts (budget branch)
    // — `awaitingReason: 'max_iterations'` since #204.

    const MAX_ITER = 2

    // POST /api/content-drafts/:id/review — primary trigger fired by ReviewEngine
    // (autopilot loop in supervised). Returns score 70 revision_required each
    // call and, on hitting the budget, also parks the review stage_run so the
    // workspace-level AwaitingBanner renders with reason=max_iterations.
    await page.route(/\/api\/content-drafts\/[^/]+\/review/, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      reviewCallCount++
      const callNo = reviewCallCount
      const cappedIter = Math.min(callNo, MAX_ITER)
      const isExhausted = callNo >= MAX_ITER

      if (isExhausted) {
        const row = reviewRunRow(project.id, {
          score: 70,
          verdict: 'revision_required',
          status: 'awaiting_user',
          awaitingReason: 'max_iterations',
        })
        happy.runs.set('review', {
          ...happy.runs.get('review'),
          id: row.id,
          projectId: project.id,
          stage: 'review',
          status: 'awaiting_user',
          attemptNo: callNo,
          inputJson: null,
          outcomeJson: row.outcomeJson,
          payloadRef: row.payloadRef,
          finishedAt: null,
          errorMessage: null,
          trackId: null,
          publishTargetId: null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } as Parameters<typeof happy.runs.set>[1])
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'draft-e2e-1',
            status: 'in_review',
            review_score: 70,
            review_verdict: 'revision_required',
            review_feedback_json: {
              overall_verdict: 'Revision Required',
              blog_review: {
                score: 70,
                verdict: 'Revision Required',
                strengths: [],
                issues: {
                  critical: [
                    { location: 'intro', issue: 'Still weak.', suggested_fix: 'Rewrite intro.' },
                  ],
                  minor: [],
                },
              },
              summary: 'Needs more work.',
            },
            // Cap iteration_count at MAX_ITER so rearmKey stops changing past
            // the budget — prevents the autopilot from firing additional
            // reviews after parking (the orchestrator would refuse them in
            // production; the cap mirrors that gate).
            iteration_count: cappedIter,
          },
          error: null,
        }),
      })
    })

    // GET /api/content-drafts/:id — surface latest review fields with capped iter
    await page.route(/\/api\/content-drafts\/[^/]+$/, async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const cappedIter = Math.min(reviewCallCount, MAX_ITER)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'draft-e2e-1',
            status: 'in_review',
            canonical_core_json: { title: 'EC R2 Draft', thesis: 'Loop budget' },
            draft_json: {
              blog: { full_draft: 'Body markdown for EC R2 draft.' },
              full_draft: 'Body markdown for EC R2 draft.',
              word_count: 800,
            },
            body_markdown: 'Body markdown for EC R2 draft.',
            word_count: 800,
            title: 'EC R2 Draft',
            review_score: reviewCallCount > 0 ? 70 : null,
            review_verdict: reviewCallCount > 0 ? 'revision_required' : 'pending',
            review_feedback_json: reviewCallCount > 0
              ? {
                  overall_verdict: 'Revision Required',
                  blog_review: { score: 70, verdict: 'Revision Required', strengths: [], issues: { critical: [{ location: 'intro', issue: 'Still weak.', suggested_fix: 'Rewrite intro.' }], minor: [] } },
                  summary: 'Needs more work.',
                }
              : null,
            iteration_count: cappedIter,
          },
          error: null,
        }),
      })
    })

    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      if (body?.stage !== 'review') return route.fallback()

      reviewCallCount++
      const callNo = reviewCallCount

      // First maxIterations-1 calls: completed with revision_required (loop back)
      // Final call: awaiting_user(max_iterations) — budget exhausted
      const isExhausted = callNo >= 2

      const row = reviewRunRow(project.id, {
        score: 70,
        verdict: 'revision_required',
        status: isExhausted ? 'awaiting_user' : 'completed',
        awaitingReason: isExhausted ? 'max_iterations' : null,
      })

      // Update the snapshot so GET /stages reflects the awaiting state
      if (isExhausted) {
        happy.runs.set('review', {
          ...happy.runs.get('review'),
          id: row.id,
          projectId: project.id,
          stage: 'review',
          status: 'awaiting_user',
          attemptNo: callNo,
          inputJson: null,
          outcomeJson: row.outcomeJson,
          payloadRef: row.payloadRef,
          finishedAt: null,
          errorMessage: null,
          trackId: null,
          publishTargetId: null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        } as Parameters<typeof happy.runs.set>[1])
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { stageRun: row },
          error: null,
        }),
      })
    })

    // GET /stages override for max-iterations: reflects awaiting_user for review.
    // Mirrors the happy snapshotResponse shape (project + stageRuns + tracks)
    // so PipelineWorkspace's supervised auto-advance can still find the active
    // blog track and walk forward through production → review.
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const reviewRun = happy.runs.get('review')
      const allRuns = happy.snapshot()
      const enriched = allRuns.map((r) => {
        if (r.stage === 'review' && reviewRun?.status === 'awaiting_user') {
          return { ...r, status: 'awaiting_user', awaitingReason: 'max_iterations' }
        }
        return r
      })

      const TRACK_ID = 'track-e2e-blog-1'
      const trackScopedStages = ['production', 'review', 'assets', 'preview', 'publish'] as const
      const trackStageRuns: Record<string, unknown> = {}
      for (const stage of trackScopedStages) {
        const row = enriched.find((r) => r.stage === stage) ?? null
        trackStageRuns[stage] = row ? { ...row, trackId: TRACK_ID, allAttempts: [] } : null
      }
      const tracks = [
        {
          id: TRACK_ID,
          medium: 'blog',
          status: 'active',
          paused: false,
          stageRuns: trackStageRuns,
          publishTargets: [{ id: 'pt-e2e-1', displayName: 'E2E WordPress' }],
        },
      ]

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            project: { mode: project.mode, paused: false },
            stageRuns: enriched.map((r) => ({ ...r, allAttempts: [] })),
            tracks,
          },
          error: null,
        }),
      })
    })

    // GET /api/projects/:id: keep project as not-paused (awaiting state comes from stage run)
    await page.route(`**/api/projects/${project.id}`, async (route: Route) => {
      const method = route.request().method()
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readBody(route)
        patchBodies.push({ url: `/api/projects/${project.id}`, body })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
      }
      if (method !== 'GET') return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: project.id,
            channel_id: 'ch-e2e-edge',
            title: project.title,
            mode: project.mode,
            paused: false,
            autopilot_config_json: {
              review: { maxIterations: 2, autoApproveThreshold: 90, hardFailThreshold: 50 },
              assets: { mode: 'skip' },
              preview: { enabled: false },
              publish: { status: 'draft' },
            },
            pipeline_state_json: null,
            template_id: null,
            migrated_to_stage_runs_at: nowIso(-86400),
          },
          error: null,
        }),
      })
    })
  }

  if (scenario === 'hard-fail') {
    // Review returns score 30 < hardFailThreshold(50) → Stage Run failed
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      if (body?.stage !== 'review') return route.fallback()

      reviewCallCount++

      const row = {
        id: `sr-review-e2e-hardfail`,
        projectId: project.id,
        stage: 'review',
        status: 'failed',
        attemptNo: 1,
        outcomeJson: {
          score: 30,
          verdict: 'rejected',
          qualityTier: 'poor',
          feedbackJson: {
            summary: 'Content does not meet minimum quality threshold.',
          },
        },
        errorMessage: 'Review rejected (score 30 < 50)',
        awaitingReason: null,
        payloadRef: { kind: 'content_draft', id: 'draft-e2e-1' },
        finishedAt: nowIso(),
        createdAt: nowIso(-10),
        updatedAt: nowIso(),
      }

      // Update snapshot so GET /stages reflects failed state
      happy.runs.set('review', {
        id: row.id,
        projectId: project.id,
        stage: 'review',
        status: 'failed',
        attemptNo: 1,
        inputJson: null,
        outcomeJson: row.outcomeJson,
        payloadRef: row.payloadRef,
        finishedAt: row.finishedAt,
        errorMessage: row.errorMessage,
        trackId: null,
        publishTargetId: null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } as Parameters<typeof happy.runs.set>[1])

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { stageRun: row },
          error: null,
        }),
      })
    })

    // GET /stages: reflect failed review
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = happy.snapshot()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            project: { mode: project.mode, paused: false },
            stageRuns,
          },
          error: null,
        }),
      })
    })
  }

  if (scenario === 'provider-quota') {
    // Stage-runs POST for any stage returns 429 PROVIDER_QUOTA_EXHAUSTED
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      // Affect all stages except brainstorm/research/canonical (they use happy-path)
      // to simulate a quota error in the production stage
      if (!body?.stage || ['brainstorm', 'research', 'canonical'].includes(body.stage)) {
        return route.fallback()
      }

      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          error: {
            code: 'PROVIDER_QUOTA_EXHAUSTED',
            message: 'AI provider quota has been exhausted. Please retry later.',
          },
        }),
      })
    })

    // GET /stages: production is awaiting_user(provider_quota_exhausted)
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = happy.snapshot()
      // Find if production was attempted; if so, show it as awaiting
      const productionRun = happy.runs.get('production')
      const enriched = productionRun
        ? stageRuns
        : [
            ...stageRuns,
            {
              id: 'sr-production-quota',
              projectId: project.id,
              stage: 'production',
              status: 'awaiting_user',
              awaitingReason: 'provider_quota_exhausted',
              attemptNo: 1,
              inputJson: null,
              outcomeJson: null,
              payloadRef: null,
              finishedAt: null,
              errorMessage: 'Provider quota exhausted',
              trackId: null,
              publishTargetId: null,
              createdAt: nowIso(-5),
              updatedAt: nowIso(),
            },
          ]

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            project: { mode: project.mode, paused: false },
            stageRuns: enriched,
          },
          error: null,
        }),
      })
    })

    // POST /resume: succeed and flip production back to queued
    await page.route(`**/api/projects/${project.id}/resume`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      happy.completeStage('production')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ok: true }, error: null }),
      })
    })
  }

  if (scenario === 'manual-paste') {
    // Stage-runs POST for production returns 422 NO_PROVIDER_CONFIGURED
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      if (!body?.stage || ['brainstorm', 'research', 'canonical'].includes(body.stage)) {
        return route.fallback()
      }

      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          error: {
            code: 'NO_PROVIDER_CONFIGURED',
            message: 'No AI provider is configured. Please paste the output manually.',
          },
        }),
      })
    })

    // GET /stages: production is awaiting_user(manual_paste)
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = happy.snapshot()
      const productionRun = happy.runs.get('production')
      const enriched = productionRun
        ? stageRuns
        : [
            ...stageRuns,
            {
              id: 'sr-production-manual',
              projectId: project.id,
              stage: 'production',
              status: 'awaiting_user',
              awaitingReason: 'manual_paste',
              attemptNo: 1,
              inputJson: null,
              outcomeJson: null,
              payloadRef: null,
              finishedAt: null,
              errorMessage: null,
              trackId: null,
              publishTargetId: null,
              createdAt: nowIso(-5),
              updatedAt: nowIso(),
            },
          ]

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            project: { mode: project.mode, paused: false },
            stageRuns: enriched,
          },
          error: null,
        }),
      })
    })

    // POST /:id/stage-runs/:runId/manual-output — accept paste and complete stage
    await page.route(`**/api/projects/${project.id}/stage-runs/**/manual-output`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      happy.completeStage('production')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { stageRunId: 'sr-production-manual', status: 'completed' }, error: null }),
      })
    })
  }

  if (scenario === 'stage-failure-retry') {
    // Production fails once (HTTP 500), succeeds on second attempt
    let productionAttempts = 0
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      if (body?.stage !== 'production') return route.fallback()

      productionAttempts++
      if (productionAttempts === 1) {
        // First attempt fails
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
          }),
        })
      }

      // Subsequent attempts succeed
      happy.completeStage('production')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            stageRun: {
              id: `sr-production-retry-${productionAttempts}`,
              projectId: project.id,
              stage: 'production',
              status: 'completed',
              attemptNo: productionAttempts,
              outcomeJson: {
                draftId: 'draft-e2e-1',
                draftTitle: 'E2E Retry Draft',
                draftContent: 'Retry successful content.',
              },
              payloadRef: { kind: 'content_draft', id: 'draft-e2e-1' },
              finishedAt: nowIso(),
              createdAt: nowIso(-5),
              updatedAt: nowIso(),
            },
          },
          error: null,
        }),
      })
    })

    // GET /stages: reflect failed state after first attempt
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = happy.snapshot()
      const productionRun = happy.runs.get('production')

      if (!productionRun && productionAttempts >= 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              project: { mode: project.mode, paused: false },
              stageRuns: [
                ...stageRuns,
                {
                  id: 'sr-production-failed',
                  projectId: project.id,
                  stage: 'production',
                  status: 'failed',
                  attemptNo: 1,
                  inputJson: null,
                  outcomeJson: null,
                  payloadRef: null,
                  finishedAt: null,
                  errorMessage: 'Internal server error',
                  awaitingReason: null,
                  trackId: null,
                  publishTargetId: null,
                  createdAt: nowIso(-5),
                  updatedAt: nowIso(),
                },
              ],
            },
            error: null,
          }),
        })
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { project: { mode: project.mode, paused: false }, stageRuns },
          error: null,
        }),
      })
    })
  }

  if (scenario === 'malformed-json') {
    // Production worker hits a Zod parse error on the provider output.
    // Real behavior (apps/api/src/lib/ai/router.ts retry-then-fail + the worker's
    // catch in apps/api/src/jobs/production-generate.ts): the worker retries the
    // same provider via shouldRetrySameProvider; on exhaustion it calls
    // markFailed with the parse-error message. There is NO manual_paste park
    // for malformed JSON — manual_paste only fires from pipeline-assets-dispatch.ts
    // when mode === 'manual_upload'. Asserting awaiting(manual_paste) here was
    // fixture-only; production emits status='failed'.
    await page.route(`**/api/projects/${project.id}/stage-runs`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = (await readBody(route)) as { stage?: string } | null
      if (body?.stage !== 'production') return route.fallback()

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            stageRun: {
              id: 'sr-production-malformed',
              projectId: project.id,
              stage: 'production',
              status: 'failed',
              awaitingReason: null,
              attemptNo: 1,
              inputJson: null,
              outcomeJson: null,
              payloadRef: null,
              finishedAt: nowIso(),
              errorMessage: 'Output parse error: malformed JSON from provider',
              trackId: null,
              publishTargetId: null,
              createdAt: nowIso(-5),
              updatedAt: nowIso(),
            },
          },
          error: null,
        }),
      })
    })

    // GET /stages: production is failed due to parse error
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = happy.snapshot()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            project: { mode: project.mode, paused: false },
            stageRuns: [
              ...stageRuns,
              {
                id: 'sr-production-malformed',
                projectId: project.id,
                stage: 'production',
                status: 'failed',
                awaitingReason: null,
                attemptNo: 1,
                inputJson: null,
                outcomeJson: null,
                payloadRef: null,
                finishedAt: nowIso(),
                errorMessage: 'Output parse error: malformed JSON from provider',
                trackId: null,
                publishTargetId: null,
                createdAt: nowIso(-5),
                updatedAt: nowIso(),
              },
            ],
          },
          error: null,
        }),
      })
    })
  }

  if (scenario === 'manual-pause-resume') {
    let isPaused = false
    let pauseCallCount = 0

    // Intercept PATCH /projects/:id to track pause/resume
    await page.route(`**/api/projects/${project.id}`, async (route: Route) => {
      const method = route.request().method()
      const body = (await readBody(route)) as { paused?: boolean } | null
      patchBodies.push({ url: `/api/projects/${project.id}`, body })

      if ((method === 'PATCH' || method === 'PUT') && body?.paused !== undefined) {
        isPaused = body.paused
        if (body.paused) pauseCallCount++
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
      }
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: project.id,
              channel_id: 'ch-e2e-edge',
              title: project.title,
              mode: project.mode,
              paused: isPaused,
              autopilot_config_json: { assets: { mode: 'skip' }, preview: { enabled: false }, publish: { status: 'draft' } },
              pipeline_state_json: null,
              template_id: null,
              migrated_to_stage_runs_at: nowIso(-86400),
            },
            error: null,
          }),
        })
      }
      return route.fallback()
    })

    // GET /stages: reflects paused state
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = happy.snapshot()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { project: { mode: project.mode, paused: isPaused }, stageRuns },
          error: null,
        }),
      })
    })

    // POST /resume: unpauses
    await page.route(`**/api/projects/${project.id}/resume`, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      isPaused = false
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
    })
  }

  if (scenario === 'manual-abort') {
    let isAborted = false

    // Intercept PATCH /projects/:id to track abort
    await page.route(`**/api/projects/${project.id}`, async (route: Route) => {
      const method = route.request().method()
      const body = (await readBody(route)) as { status?: string; paused?: boolean } | null
      patchBodies.push({ url: `/api/projects/${project.id}`, body })

      if ((method === 'PATCH' || method === 'PUT') && body?.status === 'aborted') {
        isAborted = true
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ok: true }, error: null }) })
      }
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: project.id,
              channel_id: 'ch-e2e-edge',
              title: project.title,
              mode: project.mode,
              paused: isAborted,
              status: isAborted ? 'aborted' : 'active',
              autopilot_config_json: { assets: { mode: 'skip' }, preview: { enabled: false }, publish: { status: 'draft' } },
              pipeline_state_json: null,
              template_id: null,
              migrated_to_stage_runs_at: nowIso(-86400),
            },
            error: null,
          }),
        })
      }
      return route.fallback()
    })

    // GET /stages: reflects aborted stages
    await page.route(`**/api/projects/${project.id}/stages`, async (route: Route) => {
      const stageRuns = isAborted
        ? happy.snapshot().map((r) => {
            if (!['brainstorm', 'research', 'canonical'].includes(r.stage)) {
              return { ...r, status: 'aborted', errorMessage: 'User aborted pipeline' }
            }
            return r
          })
        : happy.snapshot()

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { project: { mode: project.mode, paused: isAborted }, stageRuns },
          error: null,
        }),
      })
    })

    // PATCH /stage-runs/:id: abort individual run
    await page.route(`**/api/projects/${project.id}/stage-runs/**`, async (route: Route) => {
      const method = route.request().method()
      const url = route.request().url()
      if (url.includes('/mirror-from-legacy') || url.includes('/continue') || url.includes('/manual-output')) {
        return route.fallback()
      }
      if (method === 'PATCH') {
        isAborted = true
        patchBodies.push({ url, body: await readBody(route) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { stageRunId: 'sr-production-e2e', status: 'aborted' }, error: null }) })
      }
      return route.fallback()
    })
  }

  // reviewCallCount is mutated by route handlers; expose via getter so callers
  // see the live count instead of a value snapshot taken at return time.
  const parkReviewMax = () => {
    if (scenario !== 'max-iterations') return
    const row = reviewRunRow(project.id, {
      score: 70,
      verdict: 'revision_required',
      status: 'awaiting_user',
      awaitingReason: 'max_iterations',
    })
    happy.runs.set('review', {
      ...happy.runs.get('review'),
      id: row.id,
      projectId: project.id,
      stage: 'review',
      status: 'awaiting_user',
      attemptNo: 2,
      inputJson: null,
      outcomeJson: row.outcomeJson,
      payloadRef: row.payloadRef,
      finishedAt: null,
      errorMessage: null,
      trackId: null,
      publishTargetId: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as Parameters<typeof happy.runs.set>[1])
  }

  return {
    ...happy,
    scenario,
    get reviewCallCount() { return reviewCallCount },
    callCounts,
    patchBodies,
    parkReviewMax,
    // Override unroute to use the page's unrouteAll
    unroute: async () => {
      await page.unrouteAll({ behavior: 'ignoreErrors' })
    },
  }
}
