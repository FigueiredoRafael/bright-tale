import { test, expect } from '@playwright/test'
import {
  mockPipelineApis,
  mockApprovedDraft,
  mockReproduce,
  attachPipelineEventRecorder,
  DEFAULT_PROJECT,
} from './fixtures/pipelineMocks'

/**
 * Each test here verifies that the previously-documented bug has been fixed.
 * Title prefix `FIXED:` flags the regression — a flip back to the buggy
 * behavior should fail loudly here.
 */

const PROJECT_URL = `/en/projects/${DEFAULT_PROJECT.id}`

test.describe('previously-known bugs (now fixed)', () => {
  test('FIXED: PAUSE event halts auto-pilot and shows paused badge', async ({
    page,
  }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: { mode: 'auto', currentStage: 'brainstorm', stageResults: {}, iterationCount: 0 },
      },
    })
    const recorder = attachPipelineEventRecorder(page)
    await page.goto(PROJECT_URL)

    await page.getByRole('button', { name: /pause/i }).click()
    await expect.poll(() => recorder.types(), { timeout: 3000 }).toContain('PAUSE')
    await expect(page.getByTestId('autopilot-paused-badge')).toBeVisible()
    await expect(page.getByTestId('autopilot-paused-badge')).toContainText(/Paused/i)
    await expect(page.getByRole('button', { name: /resume/i })).toBeVisible()
  })

  test('FIXED: research stage auto-fires when topic is hydrated from brainstorm', async ({
    page,
  }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: {
          mode: 'auto',
          currentStage: 'research',
          stageResults: {
            brainstorm: {
              ideaId: 'i-1',
              ideaTitle: 'How AI changes content marketing',
              ideaVerdict: 'viable',
              ideaCoreTension: 'speed vs depth',
              completedAt: '2026-01-01',
            },
          },
          iterationCount: 0,
        },
      },
    })

    let researchPosts = 0
    await page.route('**/api/research-sessions', async (route) => {
      if (route.request().method() === 'POST') researchPosts += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { sessionId: 'rs-1', status: 'completed', findings: { sources: [] } },
          error: null,
        }),
      })
    })

    await page.goto(PROJECT_URL)
    await expect.poll(() => researchPosts, { timeout: 8000 }).toBeGreaterThan(0)
  })

  test('FIXED: assets stage prompts for confirmation before generating images', async ({
    page,
  }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: {
          mode: 'auto',
          currentStage: 'assets',
          stageResults: {
            brainstorm: { ideaId: 'i', ideaTitle: 't', ideaVerdict: 'v', ideaCoreTension: 'c', completedAt: '2026-01-01' },
            research:   { researchSessionId: 'r', approvedCardsCount: 3, researchLevel: 'medium', completedAt: '2026-01-01' },
            draft:      { draftId: 'd-1', draftTitle: 'Draft', draftContent: 'x', completedAt: '2026-01-01' },
            review:     { score: 95, verdict: 'approved', feedbackJson: {}, iterationCount: 1, completedAt: '2026-01-01' },
          },
          iterationCount: 1,
        },
      },
    })
    await mockApprovedDraft(page, 'd-1')
    await page.goto(PROJECT_URL)

    await expect(page.getByTestId('assets-confirm-dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /generate images/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /skip — pause auto-pilot/i })).toBeVisible()
  })

  test('FIXED: badge says "Awaiting input" when nothing is in-flight', async ({
    page,
  }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: { mode: 'auto', currentStage: 'brainstorm', stageResults: {}, iterationCount: 0 },
      },
    })
    await page.goto(PROJECT_URL)

    await expect(page.getByTestId('autopilot-awaiting-badge')).toBeVisible()
    await expect(page.getByTestId('autopilot-awaiting-badge')).toContainText(/Awaiting input/i)
    // No spurious "Running" badge while idle
    await expect(page.getByTestId('autopilot-running-badge')).toHaveCount(0)
  })

  test('FIXED: user-pause shows "Paused by user" reason', async ({ page }) => {
    await mockPipelineApis(page, {
      project: {
        ...DEFAULT_PROJECT,
        pipelineState: { mode: 'auto', currentStage: 'brainstorm', stageResults: {}, iterationCount: 0 },
      },
    })
    await page.goto(PROJECT_URL)

    await page.getByRole('button', { name: /pause/i }).click()
    await expect(page.getByTestId('autopilot-paused-badge')).toContainText(/Paused by user/i)
  })
})
