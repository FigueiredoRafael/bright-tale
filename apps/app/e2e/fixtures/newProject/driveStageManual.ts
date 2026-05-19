/**
 * driveStageManual — performs the step-by-step click sequence for each stage
 * in manual (step-by-step) pipeline mode.
 *
 * Engine root testids (from individual engine files):
 *   brainstorm  → brainstorm-engine-root
 *   research    → research-engine-root
 *   canonical   → canonical-engine-root
 *   production  → production-engine-root
 *   review      → review-engine-root
 *   publish     → publish-engine-root
 *
 * Action testids per stage (gathered from engine file grep):
 *   brainstorm  → brainstorm-action-generate → brainstorm-action-next
 *   research    → research-action-generate → research-action-approve-all
 *   canonical   → canonical-action-generate → canonical-action-approve → then Next
 *   production  → production-action-produce → production-action-done
 *   review      → review-action-run → (score >= 90) → review-action-next or review-action-override-approve
 *   publish     → (confirm dialog) → button "Publish"
 *
 * The function navigates to the stage via the sidebar testid before interacting.
 */

import type { Page } from '@playwright/test'

type ManualStage = 'brainstorm' | 'research' | 'canonical' | 'production' | 'review' | 'publish'

const SIDEBAR_ITEM = (stage: string) => `[data-testid="sidebar-item-${stage}"]`

async function waitEngineRoot(page: Page, stage: string, timeout = 20_000): Promise<void> {
  await page.getByTestId(`${stage}-engine-root`).waitFor({ state: 'visible', timeout })
}

async function clickSidebar(page: Page, stage: string): Promise<void> {
  const item = page.locator(SIDEBAR_ITEM(stage))
  const visible = await item.isVisible().catch(() => false)
  if (visible) {
    await item.click()
    await page.waitForTimeout(500)
  }
}

async function driveBrainstorm(page: Page): Promise<void> {
  await clickSidebar(page, 'brainstorm')
  await waitEngineRoot(page, 'brainstorm')
  // Generate
  await page.getByTestId('brainstorm-action-generate').click()
  // Wait for result and click Next
  await page.getByTestId('brainstorm-action-next').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('brainstorm-action-next').click()
}

async function driveResearch(page: Page): Promise<void> {
  await clickSidebar(page, 'research')
  await waitEngineRoot(page, 'research')
  // Generate
  await page.getByTestId('research-action-generate').click()
  // Approve all
  await page.getByTestId('research-action-approve-all').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('research-action-approve-all').click()
}

async function driveCanonical(page: Page): Promise<void> {
  await clickSidebar(page, 'canonical')
  await waitEngineRoot(page, 'canonical')
  // Generate canonical core
  await page.getByTestId('canonical-action-generate').click()
  // Approve
  await page.getByTestId('canonical-action-approve').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('canonical-action-approve').click()
  // Next (if present)
  const nextBtn = page.getByRole('button', { name: /next|continue/i })
  const nextVisible = await nextBtn.isVisible().catch(() => false)
  if (nextVisible) {
    await nextBtn.click()
  }
}

async function driveProduction(page: Page): Promise<void> {
  // Production stage — may be track-based; find the first sidebar item that contains 'production'
  const prodItem = page.locator('[data-testid*="sidebar-item-"][data-testid*="production"]').first()
  const prodVisible = await prodItem.isVisible().catch(() => false)
  if (prodVisible) await prodItem.click()
  await waitEngineRoot(page, 'production')
  // Produce
  await page.getByTestId('production-action-produce').click()
  // Done
  await page.getByTestId('production-action-done').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('production-action-done').click()
}

async function driveReview(page: Page): Promise<void> {
  // Review may be track-based
  const reviewItem = page.locator('[data-testid*="sidebar-item-"][data-testid*="review"]').first()
  const reviewVisible = await reviewItem.isVisible().catch(() => false)
  if (reviewVisible) await reviewItem.click()
  await waitEngineRoot(page, 'review')
  // Run review
  await page.getByTestId('review-action-run').click()
  // Wait for result — either "next" (score >= 90) or "override-approve"
  await Promise.race([
    page.getByTestId('review-action-next').waitFor({ state: 'visible', timeout: 30_000 }),
    page.getByTestId('review-action-override-approve').waitFor({ state: 'visible', timeout: 30_000 }),
  ])
  const nextVisible = await page.getByTestId('review-action-next').isVisible().catch(() => false)
  if (nextVisible) {
    await page.getByTestId('review-action-next').click()
  } else {
    await page.getByTestId('review-action-override-approve').click()
  }
}

async function drivePublish(page: Page): Promise<void> {
  // Publish may be track-based
  const publishItem = page.locator('[data-testid*="sidebar-item-"][data-testid*="publish"]').first()
  const publishVisible = await publishItem.isVisible().catch(() => false)
  if (publishVisible) await publishItem.click()
  await waitEngineRoot(page, 'publish')
  // Publish engine — click the publish button (confirm dialog)
  const publishBtn = page.getByRole('button', { name: /publish/i }).first()
  await publishBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await publishBtn.click()
  // Confirm dialog if it appears
  const confirmBtn = page.getByRole('button', { name: /confirm|yes|publish/i }).last()
  const confirmVisible = await confirmBtn.isVisible().catch(() => false)
  if (confirmVisible) {
    await confirmBtn.click()
  }
}

const STAGE_DRIVERS: Record<ManualStage, (page: Page) => Promise<void>> = {
  brainstorm: driveBrainstorm,
  research: driveResearch,
  canonical: driveCanonical,
  production: driveProduction,
  review: driveReview,
  publish: drivePublish,
}

/**
 * Drive a single stage in step-by-step (manual) mode.
 * The caller is responsible for navigating to the project page first.
 */
export async function driveStageManual(page: Page, stage: ManualStage): Promise<void> {
  const driver = STAGE_DRIVERS[stage]
  if (!driver) throw new Error(`[driveStageManual] Unknown stage: ${stage}`)
  await driver(page)
}
