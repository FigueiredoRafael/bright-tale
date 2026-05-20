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

  // Each ProviderModelFields renders two SelectTriggers labelled "Provider" and
  // "Model" — but the stage section ALSO contains stage-specific selects (Mode,
  // research depth, canonical persona, draft format, etc.) so we must anchor by
  // the literal "Provider"/"Model" Label text, not by position.
  const scope = sectionVisible ? section : page.locator('body')
  const providerCombobox = scope
    .locator('label:has-text("Provider")')
    .locator('xpath=following::button[@role="combobox"][1]')
  await providerCombobox.first().click()
  // Wizard label-cases provider names (e.g. `openai` → `Openai`). Use a regex
  // anchored to the first letter so we tolerate either casing.
  await page
    .getByRole('option', { name: new RegExp(`^${override.provider}$`, 'i') })
    .click()

  if (override.model) {
    const modelCombobox = scope
      .locator('label:has-text("Model")')
      .locator('xpath=following::button[@role="combobox"][1]')
    await modelCombobox.first().click()
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

  // handleChannelSelect's async merge can race with topic fill and wipe the
  // brainstorm.topic field once templates resolve. Re-fill the topic AFTER
  // mode selection (which is when supervised autopilot sections mount) so the
  // value is the last write before submit.
  await page.locator('#wizard-brainstorm-topic').fill(topic)

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

  // Wait for navigation to /projects/:id. The naive `[a-zA-Z0-9-]+` regex also
  // matches /projects/new (the wizard route itself) so waitForURL returns
  // immediately when the click hasn't navigated yet. Anchor on a UUID prefix
  // so we wait for the real destination.
  const UUID_PATH = /\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  await page.waitForURL(UUID_PATH, { timeout: 30_000 })

  const url = page.url()
  const match = url.match(/\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)
  if (!match) {
    throw new Error(`[fillWizard] Could not parse projectId from URL: ${url}`)
  }
  return match[1]
}
