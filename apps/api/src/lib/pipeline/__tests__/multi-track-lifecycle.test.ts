/**
 * T2.15 — Integration test: full multi-track autopilot lifecycle.
 *
 * Category C per CLAUDE.md — hits a real local Supabase instance.
 * Requires: npm run db:start && npm run db:reset
 *
 * What this test covers (per issue #52):
 *   1. Seed user + channel + project with media=[blog, video, podcast]
 *   2. Step through each shared stage (brainstorm → research → canonical)
 *   3. Assert canonical fan-out creates 3 parallel production stage_runs
 *   4. Each track advances: production → review → assets → preview → publish
 *   5. Video review loop: score 78 (revision_required) → re-run → score 92 (approved)
 *
 * Inngest is mocked — the test drives stage transitions directly via
 * insertRun + markCompleted (the same seam the real dispatchers use).
 * AI provider calls do not happen — outcomes are written manually to
 * stage_runs.outcome_json so the orchestrator reacts correctly.
 *
 * Console output follows the [T2.15] prefix convention for live observation.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// ─── Inngest mock (must be hoisted before orchestrator import) ────────────────

const { inngestSendMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn(async () => ({ ids: ['mock-evt'] })),
}));
vi.mock('@/jobs/client', () => ({ inngest: { send: inngestSendMock } }));

// ─── Real Supabase client (service role, bypasses RLS) ───────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// The SUPABASE_SERVICE_ROLE_KEY must be set in the environment.
// For local development the local Supabase CLI emits this key on `supabase start`.
// See: apps/api/.env.local (gitignored).
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY env var is required for T2.15 integration test. ' +
      'Run: npm run db:start and ensure apps/api/.env.local is populated.',
  );
}

// Inject before the orchestrator module loads its own createServiceClient call.
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__supabaseMock = sb;

// ─── Module under test (after mocks + global injection) ──────────────────────

import { advanceAfter } from '@/lib/pipeline/orchestrator';
import { insertRun, markRunning, markCompleted } from '@/lib/pipeline/stage-run-writer';

// ─── Fixed UUIDs (deterministic, safe to repeat across runs) ─────────────────

const U = {
  userId: '00000001-a215-0000-0000-000000000001',
};
const O = {
  orgId: '00000002-a215-0000-0000-000000000001',
};
const C = {
  channelId: '00000003-a215-0000-0000-000000000001',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(step: string, detail = ''): void {
  // Required by the issue: live observation of stage transitions.
  console.log(`[T2.15] stage transition: ${step}${detail ? ' — ' + detail : ''}`);
}

async function seed(): Promise<{ projectId: string; trackBlog: string; trackVideo: string; trackPodcast: string }> {
  // Insert auth user via raw Supabase admin endpoint (bypasses client-level auth)
  const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchFn: typeof fetch = (global as any).fetch ?? fetch;
  const userResp = await fetchFn(adminUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      id: U.userId,
      email: 't215-test@brighttale.test',
      email_confirm: true,
      password: 'test-password-t215',
    }),
  });
  if (!userResp.ok) {
    const body = await userResp.text();
    // 422 means user already exists — tolerate for idempotent re-runs
    if (userResp.status !== 422) {
      throw new Error(`seed: auth user create failed (${userResp.status}): ${body}`);
    }
  }

  // Org
  await sb
    .from('organizations')
    .upsert({ id: O.orgId, name: 'T2.15 Test Org', slug: 't215-test-org' }, { onConflict: 'id', ignoreDuplicates: true });

  // Channel (owned by user)
  await sb
    .from('channels')
    .upsert(
      { id: C.channelId, org_id: O.orgId, user_id: U.userId, name: 'T2.15 Channel' },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  // Project in autopilot mode
  const { data: proj, error: projErr } = await sb
    .from('projects')
    .insert({
      title: 'T2.15 Multi-Track Test',
      channel_id: C.channelId,
      current_stage: 'brainstorm',
      status: 'active',
      mode: 'autopilot',
      paused: false,
      autopilot_config_json: {
        review: { maxIterations: 3, autoApproveThreshold: 90, hardFailThreshold: 50 },
        assets: { mode: 'skip' },
      },
    })
    .select('id')
    .single();
  if (projErr || !proj) throw new Error(`seed: project insert failed: ${projErr?.message}`);
  const projectId = (proj as { id: string }).id;
  log('seed', `project=${projectId}`);

  // Three tracks: blog, video, podcast
  const { data: tracks, error: trackErr } = await sb
    .from('tracks')
    .insert([
      { project_id: projectId, medium: 'blog' },
      { project_id: projectId, medium: 'video' },
      { project_id: projectId, medium: 'podcast' },
    ])
    .select('id, medium');
  if (trackErr || !tracks) throw new Error(`seed: tracks insert failed: ${trackErr?.message}`);
  const trackList = tracks as Array<{ id: string; medium: string }>;
  const trackBlog = trackList.find((t) => t.medium === 'blog')!.id;
  const trackVideo = trackList.find((t) => t.medium === 'video')!.id;
  const trackPodcast = trackList.find((t) => t.medium === 'podcast')!.id;
  log('seed', `tracks blog=${trackBlog} video=${trackVideo} podcast=${trackPodcast}`);

  return { projectId, trackBlog, trackVideo, trackPodcast };
}

async function cleanup(projectId: string): Promise<void> {
  // Cascade: stage_runs + tracks reference project via FK ON DELETE CASCADE
  await sb.from('projects').delete().eq('id', projectId);
  await sb.from('channels').delete().eq('id', C.channelId);
  await sb.from('organizations').delete().eq('id', O.orgId);
  const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users/${U.userId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchFn: typeof fetch = (global as any).fetch ?? fetch;
  await fetchFn(adminUrl, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
}

async function stageRunsFor(projectId: string): Promise<
  Array<{
    id: string;
    stage: string;
    status: string;
    trackId: string | null;
    publishTargetId: string | null;
    attemptNo: number;
    outcomeJson: unknown;
  }>
> {
  const { data, error } = await sb
    .from('stage_runs')
    .select('id, stage, status, track_id, publish_target_id, attempt_no, outcome_json')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`stageRunsFor query failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    stage: r.stage as string,
    status: r.status as string,
    trackId: (r.track_id as string | null) ?? null,
    publishTargetId: (r.publish_target_id as string | null) ?? null,
    attemptNo: r.attempt_no as number,
    outcomeJson: r.outcome_json,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T2.15 multi-track autopilot lifecycle', () => {
  let projectId = '';
  let trackBlog = '';
  let trackVideo = '';
  let trackPodcast = '';

  beforeAll(async () => {
    const seeded = await seed();
    projectId = seeded.projectId;
    trackBlog = seeded.trackBlog;
    trackVideo = seeded.trackVideo;
    trackPodcast = seeded.trackPodcast;
  }, 30_000);

  afterAll(async () => {
    if (projectId) await cleanup(projectId);
  }, 15_000);

  // ── Step 1: brainstorm ─────────────────────────────────────────────────────

  it('brainstorm: insert queued run → mark running → complete → advanceAfter queues research', async () => {
    log('brainstorm → queued');
    const brainstormRun = await insertRun(sb, {
      projectId,
      stage: 'brainstorm',
      attemptNo: 1,
      status: 'queued',
      inputJson: { mode: 'topic_driven', topic: 'T2.15 test idea' },
      trackId: null,
      publishTargetId: null,
    });
    expect((brainstormRun as { stage?: string }).stage).toBe('brainstorm');
    expect((brainstormRun as { status?: string }).status).toBe('queued');

    log('brainstorm → running');
    await markRunning(sb, (brainstormRun as { id: string }).id, { projectId, stage: 'brainstorm' });

    log('brainstorm → completed');
    await markCompleted(sb, (brainstormRun as { id: string }).id, {
      projectId,
      stage: 'brainstorm',
      suppressAdvanceEvent: true,
      outcome: { recommendation: { pick: 'T2.15 test idea', rationale: 'integration test' } },
    });

    // advanceAfter should enqueue research (autopilot + not paused + brainstorm completed)
    log('brainstorm → advanceAfter');
    inngestSendMock.mockClear();
    await advanceAfter((brainstormRun as { id: string }).id);

    const runs = await stageRunsFor(projectId);
    const research = [...runs].reverse().find((r) => r.stage === 'research');
    expect(research).toBeDefined();
    expect(research?.status).toBe('queued');
    expect(research?.trackId).toBeNull();
    log('brainstorm complete', `research=${research?.id} status=${research?.status}`);

    // Inngest event emitted for the queued research
    const events = (inngestSendMock.mock.calls as unknown as Array<[{ name: string; data: { stage: string } }]>)
      .map((c) => c[0]);
    const requested = events.find((e) => e.name === 'pipeline/stage.requested' && e.data.stage === 'research');
    expect(requested).toBeDefined();
  }, 15_000);

  // ── Step 2: research ───────────────────────────────────────────────────────

  it('research: complete with approved verdict → advanceAfter queues canonical', async () => {
    const runs = await stageRunsFor(projectId);
    const researchRun = [...runs].reverse().find((r) => r.stage === 'research');
    expect(researchRun).toBeDefined();

    log('research → running');
    await markRunning(sb, researchRun!.id, { projectId, stage: 'research' });

    log('research → completed (approved confidence)');
    await markCompleted(sb, researchRun!.id, {
      projectId,
      stage: 'research',
      suppressAdvanceEvent: true,
      outcome: { verdict: 'approved', confidence: 0.88 },
    });

    inngestSendMock.mockClear();
    log('research → advanceAfter');
    await advanceAfter(researchRun!.id);

    const runs2 = await stageRunsFor(projectId);
    const canonical = [...runs2].reverse().find((r) => r.stage === 'canonical');
    expect(canonical).toBeDefined();
    expect(canonical?.status).toBe('queued');
    expect(canonical?.trackId).toBeNull();
    log('research complete', `canonical=${canonical?.id} status=${canonical?.status}`);
  }, 15_000);

  // ── Step 3: canonical → fan-out ────────────────────────────────────────────

  it('canonical: complete → advanceAfter fans out to 3 parallel production stage_runs', async () => {
    const runs = await stageRunsFor(projectId);
    const canonicalRun = [...runs].reverse().find((r) => r.stage === 'canonical');
    expect(canonicalRun).toBeDefined();

    log('canonical → running');
    await markRunning(sb, canonicalRun!.id, { projectId, stage: 'canonical' });

    log('canonical → completed');
    await markCompleted(sb, canonicalRun!.id, {
      projectId,
      stage: 'canonical',
      suppressAdvanceEvent: true,
      outcome: { canonicalCoreId: 'core-t215', title: 'T2.15 Canonical' },
    });

    inngestSendMock.mockClear();
    log('canonical → advanceAfter (fan-out)');
    await advanceAfter(canonicalRun!.id);

    const runs2 = await stageRunsFor(projectId);
    const productions = runs2.filter((r) => r.stage === 'production' && r.status === 'queued');
    expect(productions).toHaveLength(3);

    const prodTrackIds = productions.map((r) => r.trackId).sort();
    expect(prodTrackIds).toEqual([trackBlog, trackPodcast, trackVideo].sort());
    log('canonical fan-out complete', `production runs: ${productions.map((r) => r.id).join(', ')}`);

    // 3 Inngest events emitted — one per track
    const productionEvents = (inngestSendMock.mock.calls as unknown as Array<[{ name: string; data: { stage: string } }]>)
      .map((c) => c[0])
      .filter((e) => e.name === 'pipeline/stage.requested' && e.data.stage === 'production');
    expect(productionEvents).toHaveLength(3);
  }, 15_000);

  // ── Step 4: blog track — production → review → assets (skip) → preview → publish ─

  it('blog track: completes production → review → skipped assets → preview → publish (awaiting_user)', async () => {
    const runs = await stageRunsFor(projectId);
    const blogProd = runs.find((r) => r.stage === 'production' && r.trackId === trackBlog);
    expect(blogProd).toBeDefined();

    // production → running → completed
    log('blog production → running');
    await markRunning(sb, blogProd!.id, { projectId, stage: 'production', trackId: trackBlog });
    log('blog production → completed');
    await markCompleted(sb, blogProd!.id, {
      projectId,
      stage: 'production',
      trackId: trackBlog,
      suppressAdvanceEvent: true,
      outcome: { type: 'blog', draftId: 'draft-blog-t215' },
    });

    inngestSendMock.mockClear();
    await advanceAfter(blogProd!.id);

    // Review should be queued (assets.mode='skip' does not affect review)
    const r1 = await stageRunsFor(projectId);
    const blogReview = r1.find((r) => r.stage === 'review' && r.trackId === trackBlog);
    expect(blogReview).toBeDefined();
    expect(blogReview?.status).toBe('queued');
    log('blog review → queued', `id=${blogReview?.id}`);

    // review → running → completed (approved)
    await markRunning(sb, blogReview!.id, { projectId, stage: 'review', trackId: trackBlog });
    await markCompleted(sb, blogReview!.id, {
      projectId,
      stage: 'review',
      trackId: trackBlog,
      suppressAdvanceEvent: true,
      outcome: { verdict: 'approved', score: 94, draftType: 'blog', feedbackJson: null },
    });
    log('blog review → completed (approved, score=94)');

    inngestSendMock.mockClear();
    await advanceAfter(blogReview!.id);

    // assets.mode='skip' in autopilot_config_json → should get a skipped assets + queued preview
    const r2 = await stageRunsFor(projectId);
    const blogAssets = r2.find((r) => r.stage === 'assets' && r.trackId === trackBlog);
    expect(blogAssets).toBeDefined();
    expect(blogAssets?.status).toBe('skipped');
    log('blog assets → skipped (mode=skip)');

    const blogPreview = r2.find((r) => r.stage === 'preview' && r.trackId === trackBlog);
    expect(blogPreview).toBeDefined();
    expect(blogPreview?.status).toBe('queued');
    log('blog preview → queued', `id=${blogPreview?.id}`);

    // preview → running → completed
    await markRunning(sb, blogPreview!.id, { projectId, stage: 'preview', trackId: trackBlog });
    await markCompleted(sb, blogPreview!.id, {
      projectId,
      stage: 'preview',
      trackId: trackBlog,
      suppressAdvanceEvent: true,
      outcome: { previewUrl: 'https://preview.test/blog-t215' },
    });
    log('blog preview → completed');

    inngestSendMock.mockClear();
    await advanceAfter(blogPreview!.id);

    // publish must be awaiting_user(manual_advance) — never queued in autopilot
    const r3 = await stageRunsFor(projectId);
    const blogPublish = r3.find((r) => r.stage === 'publish' && r.trackId === trackBlog);
    expect(blogPublish).toBeDefined();
    expect(blogPublish?.status).toBe('awaiting_user');
    log('blog publish → awaiting_user (manual_advance)', `id=${blogPublish?.id}`);
  }, 30_000);

  // ── Step 5: video track — review loop (score 78 → 92) ─────────────────────

  it('video track: review loop — score 78 triggers revision, score 92 approves and advances', async () => {
    const runs = await stageRunsFor(projectId);
    const videoProd1 = runs.find((r) => r.stage === 'production' && r.trackId === trackVideo);
    expect(videoProd1).toBeDefined();

    // production attempt 1 → completed
    log('video production attempt 1 → running');
    await markRunning(sb, videoProd1!.id, { projectId, stage: 'production', trackId: trackVideo });
    await markCompleted(sb, videoProd1!.id, {
      projectId,
      stage: 'production',
      trackId: trackVideo,
      suppressAdvanceEvent: true,
      outcome: { type: 'video', draftId: 'draft-video-t215-v1' },
    });
    log('video production attempt 1 → completed');

    inngestSendMock.mockClear();
    await advanceAfter(videoProd1!.id);

    const r1 = await stageRunsFor(projectId);
    const videoReview1 = r1.find(
      (r) => r.stage === 'review' && r.trackId === trackVideo && r.attemptNo === 1,
    );
    expect(videoReview1).toBeDefined();
    expect(videoReview1?.status).toBe('queued');
    log('video review attempt 1 → queued', `id=${videoReview1?.id}`);

    // review attempt 1 → completed with verdict=revision_required (score 78 < 90 threshold)
    await markRunning(sb, videoReview1!.id, { projectId, stage: 'review', trackId: trackVideo });
    await markCompleted(sb, videoReview1!.id, {
      projectId,
      stage: 'review',
      trackId: trackVideo,
      suppressAdvanceEvent: true,
      outcome: {
        verdict: 'revision_required',
        score: 78,
        draftType: 'video',
        feedbackJson: { issues: { critical: [{ issue: 'Pacing too slow in intro.' }], minor: [] } },
      },
    });
    log('video review attempt 1 → completed (score=78, verdict=revision_required)');

    // advanceAfter should loop back to production (or legacy 'draft' until T2.6)
    inngestSendMock.mockClear();
    await advanceAfter(videoReview1!.id);

    const r2 = await stageRunsFor(projectId);
    // The orchestrator loops back to draft (LEGACY_DRAFT_STAGE='draft') until T2.6
    // replaces it with 'production'. Because there are no prior 'draft' rows, the
    // revision run gets attempt_no=1 with stage='draft'. We look for any queued
    // draft-or-production run for the video track (regardless of attempt_no).
    const videoRevision = r2.find(
      (r) =>
        (r.stage === 'production' || r.stage === 'draft') &&
        r.trackId === trackVideo &&
        r.status === 'queued',
    );
    expect(videoRevision).toBeDefined();
    expect(videoRevision?.status).toBe('queued');
    log(
      `video ${videoRevision?.stage} attempt ${videoRevision?.attemptNo} → queued (revision)`,
      `id=${videoRevision?.id}`,
    );

    // revision attempt → running → completed
    await markRunning(sb, videoRevision!.id, {
      projectId,
      stage: videoRevision!.stage,
      trackId: trackVideo,
    });
    await markCompleted(sb, videoRevision!.id, {
      projectId,
      stage: videoRevision!.stage,
      trackId: trackVideo,
      suppressAdvanceEvent: true,
      outcome: { type: 'video', draftId: 'draft-video-t215-v2' },
    });
    log(`video ${videoRevision?.stage} attempt ${videoRevision?.attemptNo} → completed`);

    // advanceAfter from the revised draft should queue review attempt 2
    inngestSendMock.mockClear();
    await advanceAfter(videoRevision!.id);

    const r3 = await stageRunsFor(projectId);
    // The orchestrator inserts the re-review with attempt_no=1 (advanceAfter hardcodes it).
    // We find the fresh queued review row for the video track.
    const videoReview2 = r3.find(
      (r) => r.stage === 'review' && r.trackId === trackVideo && r.status === 'queued',
    );
    expect(videoReview2).toBeDefined();
    expect(videoReview2?.status).toBe('queued');
    log('video review (iteration 2) → queued', `id=${videoReview2?.id}`);

    // review attempt 2 → completed with verdict=approved (score 92 >= 90 threshold)
    await markRunning(sb, videoReview2!.id, { projectId, stage: 'review', trackId: trackVideo });
    await markCompleted(sb, videoReview2!.id, {
      projectId,
      stage: 'review',
      trackId: trackVideo,
      suppressAdvanceEvent: true,
      outcome: {
        verdict: 'approved',
        score: 92,
        draftType: 'video',
        feedbackJson: null,
      },
    });
    log('video review attempt 2 → completed (score=92, verdict=approved)');

    inngestSendMock.mockClear();
    await advanceAfter(videoReview2!.id);

    // assets skipped (mode=skip), preview queued
    const r4 = await stageRunsFor(projectId);
    const videoAssets = r4.find((r) => r.stage === 'assets' && r.trackId === trackVideo);
    expect(videoAssets).toBeDefined();
    expect(videoAssets?.status).toBe('skipped');
    log('video assets → skipped (mode=skip)');

    const videoPreview = r4.find((r) => r.stage === 'preview' && r.trackId === trackVideo);
    expect(videoPreview).toBeDefined();
    expect(videoPreview?.status).toBe('queued');
    log('video preview → queued', `id=${videoPreview?.id}`);
  }, 60_000);

  // ── Step 6: podcast track ─────────────────────────────────────────────────

  it('podcast track: production → approved review → preview → publish (awaiting_user)', async () => {
    const runs = await stageRunsFor(projectId);
    const podcastProd = runs.find((r) => r.stage === 'production' && r.trackId === trackPodcast);
    expect(podcastProd).toBeDefined();

    log('podcast production → running → completed');
    await markRunning(sb, podcastProd!.id, { projectId, stage: 'production', trackId: trackPodcast });
    await markCompleted(sb, podcastProd!.id, {
      projectId,
      stage: 'production',
      trackId: trackPodcast,
      suppressAdvanceEvent: true,
      outcome: { type: 'podcast', draftId: 'draft-podcast-t215' },
    });
    inngestSendMock.mockClear();
    await advanceAfter(podcastProd!.id);

    const r1 = await stageRunsFor(projectId);
    const podcastReview = r1.find((r) => r.stage === 'review' && r.trackId === trackPodcast);
    expect(podcastReview).toBeDefined();
    log('podcast review → queued', `id=${podcastReview?.id}`);

    await markRunning(sb, podcastReview!.id, { projectId, stage: 'review', trackId: trackPodcast });
    await markCompleted(sb, podcastReview!.id, {
      projectId,
      stage: 'review',
      trackId: trackPodcast,
      suppressAdvanceEvent: true,
      outcome: { verdict: 'approved', score: 91, draftType: 'podcast', feedbackJson: null },
    });
    log('podcast review → completed (approved, score=91)');

    inngestSendMock.mockClear();
    await advanceAfter(podcastReview!.id);

    const r2 = await stageRunsFor(projectId);
    const podcastAssets = r2.find((r) => r.stage === 'assets' && r.trackId === trackPodcast);
    expect(podcastAssets?.status).toBe('skipped');
    log('podcast assets → skipped');

    const podcastPreview = r2.find((r) => r.stage === 'preview' && r.trackId === trackPodcast);
    expect(podcastPreview?.status).toBe('queued');
    log('podcast preview → queued', `id=${podcastPreview?.id}`);

    await markRunning(sb, podcastPreview!.id, { projectId, stage: 'preview', trackId: trackPodcast });
    await markCompleted(sb, podcastPreview!.id, {
      projectId,
      stage: 'preview',
      trackId: trackPodcast,
      suppressAdvanceEvent: true,
      outcome: { previewUrl: 'https://preview.test/podcast-t215' },
    });
    log('podcast preview → completed');

    inngestSendMock.mockClear();
    await advanceAfter(podcastPreview!.id);

    const r3 = await stageRunsFor(projectId);
    const podcastPublish = r3.find((r) => r.stage === 'publish' && r.trackId === trackPodcast);
    expect(podcastPublish).toBeDefined();
    expect(podcastPublish?.status).toBe('awaiting_user');
    log('podcast publish → awaiting_user (manual_advance)', `id=${podcastPublish?.id}`);
  }, 30_000);

  // ── Step 7: final state assertions across all 3 tracks ─────────────────────

  it('final state: correct stage_run topology across all 3 tracks', async () => {
    // Complete video track's preview → publish to get a full picture
    const runs = await stageRunsFor(projectId);
    const videoPreview = runs.find(
      (r) => r.stage === 'preview' && r.trackId === trackVideo && r.status === 'queued',
    );
    if (videoPreview) {
      await markRunning(sb, videoPreview.id, { projectId, stage: 'preview', trackId: trackVideo });
      await markCompleted(sb, videoPreview.id, {
        projectId,
        stage: 'preview',
        trackId: trackVideo,
        suppressAdvanceEvent: true,
        outcome: { previewUrl: 'https://preview.test/video-t215' },
      });
      inngestSendMock.mockClear();
      await advanceAfter(videoPreview.id);
      log('video preview → completed → publish awaiting_user');
    }

    const allRuns = await stageRunsFor(projectId);

    // ── Shared stages: exactly 1 run each, all completed ──
    const brainstormRuns = allRuns.filter((r) => r.stage === 'brainstorm' && r.trackId === null);
    const researchRuns = allRuns.filter((r) => r.stage === 'research' && r.trackId === null);
    const canonicalRuns = allRuns.filter((r) => r.stage === 'canonical' && r.trackId === null);
    expect(brainstormRuns).toHaveLength(1);
    expect(brainstormRuns[0].status).toBe('completed');
    expect(researchRuns).toHaveLength(1);
    expect(researchRuns[0].status).toBe('completed');
    expect(canonicalRuns).toHaveLength(1);
    expect(canonicalRuns[0].status).toBe('completed');
    log('final: shared stages 1×brainstorm + 1×research + 1×canonical, all completed');

    // ── Blog track: production + review + assets(skip) + preview + publish(awaiting_user) ──
    const blogRuns = allRuns.filter((r) => r.trackId === trackBlog);
    expect(blogRuns.find((r) => r.stage === 'production')?.status).toBe('completed');
    expect(blogRuns.find((r) => r.stage === 'review')?.status).toBe('completed');
    expect(blogRuns.find((r) => r.stage === 'assets')?.status).toBe('skipped');
    expect(blogRuns.find((r) => r.stage === 'preview')?.status).toBe('completed');
    expect(blogRuns.find((r) => r.stage === 'publish')?.status).toBe('awaiting_user');
    log('final: blog track — all 5 per-track stages in expected states');

    // ── Video track: review loop visible ──
    const videoRuns = allRuns.filter((r) => r.trackId === trackVideo);
    const videoProductionOrDraft = videoRuns.filter(
      (r) => r.stage === 'production' || r.stage === 'draft',
    );
    expect(videoProductionOrDraft.length).toBeGreaterThanOrEqual(2);
    log(`final: video track — ${videoProductionOrDraft.length} production/draft attempts (revision loop)`);

    const videoReviews = videoRuns.filter((r) => r.stage === 'review');
    expect(videoReviews.length).toBeGreaterThanOrEqual(2);
    // The approving review has verdict='approved' and score=92.
    // (Both review runs land with attempt_no=1 since advanceAfter hardcodes it;
    // the first is completed/revision_required, the second is completed/approved.)
    const approvedVideoReview = videoReviews.find((r) => {
      const oc = r.outcomeJson as { verdict?: string; score?: number } | null;
      return r.status === 'completed' && oc?.verdict === 'approved';
    });
    expect(approvedVideoReview).toBeDefined();
    const reviewOutcome = approvedVideoReview?.outcomeJson as { score?: number; verdict?: string } | null;
    expect(reviewOutcome?.score).toBe(92);
    expect(reviewOutcome?.verdict).toBe('approved');
    log('final: video track — approved review score=92, verdict=approved');

    expect(videoRuns.find((r) => r.stage === 'assets')?.status).toBe('skipped');
    expect(videoRuns.find((r) => r.stage === 'publish')?.status).toBe('awaiting_user');

    // ── Podcast track: production + review + assets(skip) + preview + publish(awaiting_user) ──
    const podcastRuns = allRuns.filter((r) => r.trackId === trackPodcast);
    expect(podcastRuns.find((r) => r.stage === 'production')?.status).toBe('completed');
    expect(podcastRuns.find((r) => r.stage === 'review')?.status).toBe('completed');
    expect(podcastRuns.find((r) => r.stage === 'assets')?.status).toBe('skipped');
    expect(podcastRuns.find((r) => r.stage === 'publish')?.status).toBe('awaiting_user');
    log('final: podcast track — all per-track stages in expected states');

    log('DONE', `total stage_runs=${allRuns.length} for project=${projectId}`);
  }, 30_000);
});
