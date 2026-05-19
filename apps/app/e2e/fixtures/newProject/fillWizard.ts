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

export type WizardOverrideStage =
  | 'brainstorm'
  | 'research'
  | 'canonicalCore'
  | 'draft'
  | 'review'
  | 'assets'

export interface WizardStageOverride {
  provider?: string
  model?: string
}

export interface FillWizardOptions {
  page: Page
  title: string
  channelId?: string
  channelName?: string
  media?: string[]
  topic: string
  mode: WizardMode
  /**
   * Per-stage provider/model overrides (supervised + overview modes only).
   * The wizard only renders ProviderModelFields when isAutopilot=true, so
   * passing this in step-by-step mode is a no-op.
   */
  overrides?: Partial<Record<WizardOverrideStage, WizardStageOverride>>
}

const MODE_LABEL: Record<WizardMode, string> = {
  'step-by-step': 'Step-by-step',
  supervised: 'Supervised',
  overview: 'Overview',
}

async function setProviderOverride(
  page: Page,
  stage: WizardOverrideStage,
  override: WizardStageOverride,
): Promise<void> {
  if (!override.provider) return

  // The autopilot section is collapsed by default for non-brainstorm stages —
  // expand by clicking the section trigger if present.
  const section = page.locator(`[data-testid="stage-section-${stage}"]`)
  const sectionVisible = await section.isVisible().catch(() => false)
  if (sectionVisible) {
    const trigger = section.locator('button[aria-expanded]').first()
    const expanded = (await trigger.getAttribute('aria-expanded').catch(() => null)) === 'true'
    if (!expanded) await trigger.click()
  }

  // Each ProviderModelFields renders two SelectTriggers in order: provider, model.
  // Scope by stage-section to avoid hitting another stage's selectors.
  const scope = sectionVisible ? section : page.locator('body')
  const triggers = scope.locator('button[role="combobox"]')
  // Provider trigger is the first combobox under the stage section.
  await triggers.first().click()
  await page.getByRole('option', { name: new RegExp(`^${override.provider}$`, 'i') }).click()

  if (override.model) {
    // Model trigger is the second combobox. After provider change the model
    // resets to "Provider default" so we have to pick the explicit model id.
    await triggers.nth(1).click()
    await page.getByRole('option', { name: override.model }).click()
  }
}

export async function fillWizard({
  page,
  title,
  channelId,
  channelName,
  media = ['Blog post'],
  topic,
  mode,
  overrides,
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

  // Apply per-stage provider/model overrides (autopilot modes only).
  if (overrides && (mode === 'supervised' || mode === 'overview')) {
    for (const [stage, override] of Object.entries(overrides) as Array<
      [WizardOverrideStage, WizardStageOverride]
    >) {
      await setProviderOverride(page, stage, override)
    }
  }

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
