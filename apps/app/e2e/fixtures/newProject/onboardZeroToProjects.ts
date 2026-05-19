/**
 * onboardZeroToProjects — drives the 7-step onboarding flow from /onboarding,
 * picks the "starting from zero" branch (no YouTube import), and returns the
 * newly created channelId once landed on /channels/:id.
 *
 * The onboarding page is in Portuguese. Steps:
 *   1. welcome       — click "Começar" (or similar CTA)
 *   2. has-channel   — click "Estou começando do zero"
 *   3. connect       — skip (not present in zero branch) or auto-advance
 *   4. market        — pick a market / niche
 *   5. media         — pick Blog post media
 *   6. video-style   — skip (blog only)
 *   7. name          — type channel name, submit
 *
 * Returns the channelId parsed from the /channels/:id URL.
 */

import type { Page } from '@playwright/test'

const LOCALE = 'en'

export async function onboardZeroToProjects(page: Page): Promise<string> {
  await page.goto(`/${LOCALE}/onboarding`)

  // Step: welcome — click the primary CTA button
  // The button text may vary; use a broad role matcher
  const startBtn = page.getByRole('button').filter({ hasText: /começar|get started|start|próximo|next/i }).first()
  await startBtn.waitFor({ state: 'visible', timeout: 15_000 })
  await startBtn.click()

  // Step: has-channel — choose "starting from zero"
  const zeroBtn = page.getByRole('button').filter({ hasText: /começando do zero|starting from zero|zero/i }).first()
  await zeroBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await zeroBtn.click()

  // Steps 3-6: advance through remaining steps
  // Use a loop: keep clicking "next/continue/próximo" buttons until we reach /channels/:id
  for (let step = 0; step < 10; step++) {
    // Check if we've landed on the channels page
    const url = page.url()
    const match = url.match(/\/channels\/([a-zA-Z0-9-]+)/)
    if (match) {
      return match[1]
    }

    // On the name step there should be an input; fill it if empty
    const nameInput = page.locator('input[type="text"]').first()
    const inputVisible = await nameInput.isVisible().catch(() => false)
    if (inputVisible) {
      const val = await nameInput.inputValue().catch(() => '')
      if (!val) {
        await nameInput.fill('E2E Test Channel')
      }
    }

    // Click next / submit
    const nextBtn = page
      .getByRole('button')
      .filter({ hasText: /próximo|next|continue|criar|create|submit|concluir|finish/i })
      .first()
    const nextVisible = await nextBtn.isVisible().catch(() => false)
    if (!nextVisible) break
    await nextBtn.click()

    // Wait briefly for navigation or DOM change
    await page.waitForTimeout(800)
  }

  // Final URL check
  await page.waitForURL(/\/channels\//, { timeout: 20_000 })
  const finalUrl = page.url()
  const finalMatch = finalUrl.match(/\/channels\/([a-zA-Z0-9-]+)/)
  if (!finalMatch) {
    throw new Error(`[onboardZeroToProjects] Could not parse channelId from URL: ${finalUrl}`)
  }
  return finalMatch[1]
}
