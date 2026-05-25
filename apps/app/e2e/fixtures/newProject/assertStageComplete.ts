/**
 * assertStageComplete — polls sidebar status icon until a stage reaches
 * data-status="completed".
 *
 * Sidebar testids (from FocusSidebar.tsx):
 *   - Shared stages: [data-testid="sidebar-status-{stage}"][data-status="completed"]
 *   - Track stages:  [data-testid="sidebar-status-{trackId}-{stage}"][data-status="completed"]
 *
 * For single-track (blog-only) projects, trackId is omitted and the stage
 * has a sidebar-status- testid under the shared or the first track.
 *
 * For simplicity, this helper asserts:
 *   1. sidebar-status-{stage} (shared stages: brainstorm, research, canonical)
 *   2. For track stages, it polls any element whose testid starts with
 *      `sidebar-status-` and ends with `-{stage}` and has data-status=completed.
 */

import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const SHARED_STAGES = ['brainstorm', 'research', 'canonical']

export async function assertStageComplete(
  page: Page,
  stage: string,
  options: { timeout?: number; trackId?: string } = {},
): Promise<void> {
  const timeout = options.timeout ?? 30_000

  if (SHARED_STAGES.includes(stage) && !options.trackId) {
    // Shared stage — status icon testid is sidebar-status-{stage}
    const statusIcon = page.getByTestId(`sidebar-status-${stage}`)
    await expect(statusIcon).toHaveAttribute('data-status', 'completed', { timeout })
  } else if (options.trackId) {
    // Explicit track id
    const statusIcon = page.getByTestId(`sidebar-status-${options.trackId}-${stage}`)
    await expect(statusIcon).toHaveAttribute('data-status', 'completed', { timeout })
  } else {
    // Track stage without explicit trackId — poll until ANY sidebar status for this stage is completed
    await expect.poll(
      async () => {
        const elements = await page.locator(`[data-testid$="-${stage}"][data-status]`).all()
        for (const el of elements) {
          const status = await el.getAttribute('data-status').catch(() => null)
          if (status === 'completed') return true
        }
        return false
      },
      { timeout, message: `Stage '${stage}' did not reach data-status="completed" within ${timeout}ms` },
    ).toBe(true)
  }
}
