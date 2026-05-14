import { test, expect } from '@playwright/test'
import {
  snapshot,
  applyDefaultMocks,
  attachConsoleCapture,
  QA_ARTIFACTS_DIR,
} from './_harness'

const MOCK_CHANNELS = [
  { id: 'ch-1', name: 'Channel One' },
  { id: 'ch-2', name: 'Channel Two', is_default: true },
  { id: 'ch-3', name: 'Channel Three' },
]

test.describe('PickChannelModal — mocked walk', () => {
  test.beforeEach(async ({ page }) => {
    await applyDefaultMocks(page)
    attachConsoleCapture(page)

    // Provide channel list
    await page.route('**/api/channels*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items: MOCK_CHANNELS }, error: null }),
      }),
    )

    // Mock PATCH /api/projects/:id for channel assignment
    await page.route('**/api/projects/qa-pick-channel-project-1', (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { id: 'qa-pick-channel-project-1', channel_id: 'ch-2' }, error: null }),
        })
      }
      return route.continue()
    })
  })

  test('channel list renders → select → confirm', async ({ page }) => {
     
    console.log(`[QA] artifacts dir → ${QA_ARTIFACTS_DIR}`)

    await page.goto('/en/qa-pick-channel')

    // 01 — modal open with channel list
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 15_000 })
    await snapshot(page, 'pick-channel-initial')

    // 02 — select Channel Two
    await page.getByText('Channel Two').click()
    await snapshot(page, 'pick-channel-selected')

    // 03 — confirm
    const confirmBtn = page.getByRole('button', { name: /confirm|select|save/i })
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()
    await page.waitForTimeout(400)
    await snapshot(page, 'pick-channel-after-confirm')
  })
})
