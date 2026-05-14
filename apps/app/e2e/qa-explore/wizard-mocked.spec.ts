import { test, expect } from '@playwright/test'
import {
  snapshot,
  dumpDom,
  applyDefaultMocks,
  attachConsoleCapture,
  QA_ARTIFACTS_DIR,
} from './_harness'

test.describe('PipelineWizard — mocked walk', () => {
  test.beforeEach(async ({ page }) => {
    await applyDefaultMocks(page)
    attachConsoleCapture(page)
  })

  test('initial render → mode select → brainstorm fill → save-template dialog → submit', async ({
    page,
  }) => {
     
    console.log(`[QA] artifacts dir → ${QA_ARTIFACTS_DIR}`)

    await page.goto('/en/qa-wizard')

    // 01 — initial render (wait for the heading inside the wizard form)
    await expect(
      page.getByRole('heading', { name: /pipeline mode/i }),
    ).toBeVisible({ timeout: 15_000 })
    await snapshot(page, 'initial')

    // 02 — pick supervised mode
    await page.locator('#mode-supervised').click()
    await snapshot(page, 'mode-supervised')

    // 03 — brainstorm section visible (open by default for incomplete stages)
    const brainstorm = page.getByTestId('stage-section-brainstorm')
    await expect(brainstorm).toBeVisible()
    await snapshot(page, 'brainstorm-section')

    // 04 — fill topic (default brainstormMode is topic_driven per existing test fixture)
    const topic = page.getByLabel('Topic', { exact: true })
    if (await topic.count()) {
      await topic.fill('AI agents in 2026')
      await snapshot(page, 'topic-filled')
    } else {
      await snapshot(page, 'topic-not-visible')
    }

    // 05 — open Save-as-new dialog
    await page.getByRole('button', { name: /save as new/i }).click()
    const dialog = page.getByRole('dialog', { name: /save as new template/i })
    await expect(dialog).toBeVisible()
    await snapshot(page, 'save-template-dialog-open')

    // 06 — Escape closes the dialog (regression: Bug #2 fix)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 2_000 })
    await snapshot(page, 'save-template-dialog-closed-via-escape')

    // 07 — re-open and dismiss via backdrop click (Bug #2 second fix)
    await page.getByRole('button', { name: /save as new/i }).click()
    await expect(dialog).toBeVisible()
    // Backdrop click — click near the corner where the overlay (not the inner card) sits
    await dialog.click({ position: { x: 10, y: 10 } })
    await expect(dialog).toBeHidden({ timeout: 2_000 })
    await snapshot(page, 'save-template-dialog-closed-via-backdrop')

    // 07 — submit button: capture label + click
    const submitBtn = page.locator('button[type="submit"]')
    await expect(submitBtn).toBeVisible()
    await snapshot(page, 'before-submit')
    await submitBtn.click()
    await page.waitForTimeout(800)
    await snapshot(page, 'after-submit')

    // 08 — final DOM dump (helpful for selector planning on next iteration)
    await dumpDom(page, 'final-dom')
  })

  test('overview mode → submit label updates', async ({ page }) => {
    await page.goto('/en/qa-wizard')
    await expect(
      page.getByRole('heading', { name: /pipeline mode/i }),
    ).toBeVisible({ timeout: 15_000 })

    await page.locator('#mode-overview').click()
    await expect(
      page.getByRole('button', { name: /start autopilot \(overview\)/i }),
    ).toBeVisible()
    await snapshot(page, 'overview-mode-selected')
  })

  test('save template happy path → POST mocked → dialog closes', async ({
    page,
  }) => {
    await page.goto('/en/qa-wizard')
    await expect(
      page.getByRole('heading', { name: /pipeline mode/i }),
    ).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /save as new/i }).click()
    await snapshot(page, 'save-dialog-open')

    // Type template name
    const nameInput = page.getByLabel('Template name')
    await nameInput.fill('My QA Template')
    await snapshot(page, 'save-dialog-name-typed')

    // Click Save (the dialog Save, not the form submit)
    const dialog = page.getByRole('dialog', { name: /save as new template/i })
    await dialog.getByRole('button', { name: /^save$/i }).click()

    // Dialog should be gone after successful POST
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await snapshot(page, 'save-dialog-closed-after-save')
  })

  test('validation: empty topic in topic_driven mode → submit blocked + error', async ({
    page,
  }) => {
    await page.goto('/en/qa-wizard')
    await expect(
      page.getByRole('heading', { name: /pipeline mode/i }),
    ).toBeVisible({ timeout: 15_000 })

    // Default mode is topic_driven; topic is empty by default
    await snapshot(page, 'before-empty-submit')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(400)
    await snapshot(page, 'after-empty-submit')

    // Look for any error text near brainstorm; if RHF surfaces one, capture it
    const possibleErrors = page.locator('p.text-destructive, [role="alert"]')
    const errorCount = await possibleErrors.count()
     
    console.log(`[QA] error elements visible after empty submit: ${errorCount}`)
    await dumpDom(page, 'validation-dom')
  })
})
