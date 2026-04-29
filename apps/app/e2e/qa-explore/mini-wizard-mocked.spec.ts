import { test, expect } from '@playwright/test'
import {
  snapshot,
  dumpDom,
  applyDefaultMocks,
  attachConsoleCapture,
  QA_ARTIFACTS_DIR,
} from './_harness'

test.describe('MiniWizardSheet — mocked walk', () => {
  test.beforeEach(async ({ page }) => {
    await applyDefaultMocks(page)
    attachConsoleCapture(page)
  })

  test('initial open → mode select → brainstorm topic → submit', async ({ page }) => {
     
    console.log(`[QA] artifacts dir → ${QA_ARTIFACTS_DIR}`)

    await page.goto('/en/qa-mini-wizard')

    // 01 — dialog open (MiniWizardSheet uses Radix Dialog)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
    await snapshot(page, 'mini-wizard-initial')

    // 02 — select overview mode (mini-wizard uses native <select>, not radios)
    const modeSelect = page.getByLabel(/autopilot mode/i)
    await modeSelect.selectOption('overview')
    await snapshot(page, 'mini-wizard-mode-overview')

    // 03 — switch back to supervised
    await modeSelect.selectOption('supervised')
    await snapshot(page, 'mini-wizard-mode-supervised')

    // 04 — fill brainstorm topic (visible when brainstorm not yet complete)
    const topic = page.getByLabel('Topic', { exact: true })
    if (await topic.count()) {
      await topic.fill('Mini wizard QA topic')
      await snapshot(page, 'mini-wizard-topic-filled')
    } else {
      await snapshot(page, 'mini-wizard-topic-not-visible')
    }

    // 05 — submit (Activate Autopilot button — type=submit inside dialog)
    const sheet = page.getByRole('dialog')
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
    await snapshot(page, 'mini-wizard-before-submit')
    await submitBtn.click()

    // Sheet should close after successful onSubmit (calls onClose internally)
    await expect(sheet).toBeHidden({ timeout: 3_000 })
    await snapshot(page, 'mini-wizard-after-submit-closed')

    await dumpDom(page, 'mini-wizard-final-dom')
  })
})
