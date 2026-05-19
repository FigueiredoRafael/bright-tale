/**
 * fillWizard — fills and submits the PipelineWizard form.
 *
 * Selectors are derived from PipelineWizard.tsx:
 *   - Title:   #project-title  (Input)
 *   - Channel: [data-testid="channel-option"]  (button, click to select)
 *   - Media:   aria-label="Blog post" checkbox
 *   - Topic:   #wizard-brainstorm-topic  (Input)
 *   - Mode:    role=radio  aria-label="{label}"
 *   - Submit:  button with text "Create project"
 *
 * After submit the wizard calls router.push(`/projects/${id}`).
 * Returns the projectId extracted from the navigated URL.
 */

import type { Page } from '@playwright/test'

export type WizardMode = 'step-by-step' | 'supervised' | 'overview'

export interface FillWizardOptions {
  page: Page
  title: string
  channelId?: string
  channelName?: string
  media?: string[]
  topic: string
  mode: WizardMode
}

const MODE_LABEL: Record<WizardMode, string> = {
  'step-by-step': 'Step-by-step',
  supervised: 'Supervised',
  overview: 'Overview',
}

export async function fillWizard({
  page,
  title,
  channelId,
  channelName,
  media = ['Blog post'],
  topic,
  mode,
}: FillWizardOptions): Promise<string> {
  // Wait for wizard to mount
  await page.getByTestId('pipeline-wizard').waitFor({ state: 'visible', timeout: 15_000 })

  // Fill title
  await page.locator('#project-title').fill(title)

  // Select channel
  if (channelId) {
    // Click the specific channel button that contains the channelId or name
    const channelBtns = page.getByTestId('channel-option')
    const count = await channelBtns.count()
    // If only one channel, click it
    if (count === 1) {
      await channelBtns.first().click()
    } else {
      // Try to find by name if provided
      if (channelName) {
        await channelBtns.filter({ hasText: channelName }).first().click()
      } else {
        await channelBtns.first().click()
      }
    }
  } else {
    // Select the first available channel
    await page.getByTestId('channel-option').first().click()
  }

  // Uncheck all media first, then select the desired ones
  const blogCheckbox = page.getByRole('checkbox', { name: 'Blog post' })
  const isChecked = await blogCheckbox.isChecked().catch(() => false)

  for (const medium of ['Blog post', 'Long-form video', 'Shorts / Reels', 'Podcast episode']) {
    const checkbox = page.getByRole('checkbox', { name: medium })
    const exists = await checkbox.isVisible().catch(() => false)
    if (!exists) continue
    const checked = await checkbox.isChecked().catch(() => false)
    const shouldBeChecked = media.includes(medium)
    if (checked !== shouldBeChecked) {
      await checkbox.click()
    }
  }

  // Suppress unused var warning for isChecked
  void isChecked

  // Fill topic
  await page.locator('#wizard-brainstorm-topic').fill(topic)

  // Select mode via radio
  const modeLabel = MODE_LABEL[mode]
  await page.getByRole('radio', { name: modeLabel }).click()

  // Submit
  await page.getByRole('button', { name: /create project/i }).click()

  // Wait for navigation to /projects/:id
  await page.waitForURL(/\/projects\/[a-zA-Z0-9-]+/, { timeout: 30_000 })

  const url = page.url()
  const match = url.match(/\/projects\/([a-zA-Z0-9-]+)/)
  if (!match) {
    throw new Error(`[fillWizard] Could not parse projectId from URL: ${url}`)
  }
  return match[1]
}
