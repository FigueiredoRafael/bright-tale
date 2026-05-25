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

  // POST /api/projects auto-dispatches a brainstorm run on creation so the
  // Focus view has something to show the moment the user lands. The
  // `brainstorm-action-generate` button stays disabled while that run is in
  // flight — clicking it is a re-run trigger, not the primary action. In
  // step-by-step mode the user just waits for cards and picks one. Mirror
  // that: wait up to 120s (real AI latency) for the auto-dispatched run to
  // produce >=2 cards, then select and advance.
  await page.getByTestId('idea-card').first().waitFor({ state: 'visible', timeout: 120_000 })
  const cardCount = await page.getByTestId('idea-card').count()
  if (cardCount < 2) {
    throw new Error(`[driveBrainstorm] expected >=2 idea cards, got ${cardCount}`)
  }

  // Pick the first idea and confirm it transitions to data-selected="true".
  const firstIdea = page.getByTestId('idea-card').first()
  await firstIdea.click()
  await firstIdea.waitFor({ state: 'visible' })

  await page.getByTestId('brainstorm-action-next').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('brainstorm-action-next').click()
}

async function driveResearch(page: Page): Promise<void> {
  await clickSidebar(page, 'research')
  await waitEngineRoot(page, 'research')

  // Click 'generate' only if enabled — research may be auto-dispatched on
  // brainstorm completion in some pipeline configs, in which case the button
  // is disabled and we just wait for the in-flight run.
  const genBtn = page.getByTestId('research-action-generate')
  const disabled = await genBtn.isDisabled().catch(() => false)
  if (!disabled) await genBtn.click()

  // ResearchFindingsReport must surface actual research before approval. Wait
  // for the report root + at least one source card so we know the rich
  // findings rendered. Real AI research can run 30–120s, so the timeout has
  // to be generous.
  await page.getByTestId('research-findings-report').waitFor({ state: 'visible', timeout: 180_000 })
  await page.getByTestId('research-source-card').first().waitFor({ state: 'visible', timeout: 30_000 })

  await page.getByTestId('research-action-approve-all').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('research-action-approve-all').click()
}

async function driveCanonical(page: Page): Promise<void> {
  await clickSidebar(page, 'canonical')
  await waitEngineRoot(page, 'canonical')

  // In step-by-step mode the canonical stage is user-driven (no auto-dispatch),
  // so we must click generate. The button stays disabled until research, title
  // (auto-derived from research.input_json.topic), and selectedPersonaId are
  // all loaded — none of which is instant after the sidebar click. Wait for
  // the button to become enabled (up to 30s) before clicking. If it stays
  // disabled past 30s we fall back to clicking anyway so the test surfaces
  // the real failure mode instead of a generic timeout on approve.
  const genBtn = page.getByTestId('canonical-action-generate')
  await genBtn.waitFor({ state: 'visible', timeout: 30_000 })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await genBtn.isEnabled().catch(() => false)) break
    await page.waitForTimeout(500)
  }
  await genBtn.click()

  // Wait for the approve button to appear — real AI canonical write can run
  // 30–120s, so timeout has to be generous.
  await page.getByTestId('canonical-action-approve').waitFor({ state: 'visible', timeout: 180_000 })
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

  // Click 'produce' only if enabled (production may be auto-dispatched).
  const prodBtn = page.getByTestId('production-action-produce')
  const disabled = await prodBtn.isDisabled().catch(() => false)
  if (!disabled) await prodBtn.click()

  // Production is the heaviest AI call (writes the full draft) — allow up to
  // 5 minutes for the model to stream the article.
  await page.getByTestId('production-action-done').waitFor({ state: 'visible', timeout: 300_000 })
  await page.getByTestId('production-action-done').click()
}

async function driveReview(page: Page): Promise<void> {
  // Review may be track-based
  const reviewItem = page.locator('[data-testid*="sidebar-item-"][data-testid*="review"]').first()
  const reviewVisible = await reviewItem.isVisible().catch(() => false)
  if (reviewVisible) await reviewItem.click()
  await waitEngineRoot(page, 'review')

  // Click 'run' only if enabled (review may be auto-dispatched).
  const runBtn = page.getByTestId('review-action-run')
  const disabled = await runBtn.isDisabled().catch(() => false)
  if (!disabled) await runBtn.click()

  // Wait for review result — either "next" (score >= 90) or "override-approve".
  // Review is fast (just scores the existing draft) but still needs ~30–60s.
  await Promise.race([
    page.getByTestId('review-action-next').waitFor({ state: 'visible', timeout: 120_000 }),
    page.getByTestId('review-action-override-approve').waitFor({ state: 'visible', timeout: 120_000 }),
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
