import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`
const SLOWMO = Number(process.env.PLAYWRIGHT_SLOWMO ?? 0)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: SLOWMO > 0 ? 30_000 : 10_000,
    navigationTimeout: 30_000,
    launchOptions: SLOWMO > 0 ? { slowMo: SLOWMO } : undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // live-autopilot.spec.ts is gated to manual / pre-merge runs.
      // Real Supabase dev DB + real AI providers — costs apply.
      // Run manually: npx playwright test e2e/live-autopilot.spec.ts --ignore-snapshots=false
      testIgnore: /live-autopilot/,
    },
  ],

  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: `next dev --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          NODE_ENV: 'development',
          NEXT_PUBLIC_E2E: '1',
        },
      },
})
