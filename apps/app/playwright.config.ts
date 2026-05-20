import { defineConfig, devices } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'

// Load env for the test-runner process (not just the webServer subprocess).
// apps/app/.env.local supplies E2E_USER_ID + the NEXT_PUBLIC_* keys; apps/api/.env.local
// supplies SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY needed by cleanupHelper.
// Existing process.env values win — explicit shell exports still override.
loadDotenv({ path: resolve(__dirname, '.env.local') })
loadDotenv({ path: resolve(__dirname, '../api/.env.local') })

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
      // live-autopilot.spec.ts and full-pipeline-real-ai.spec.ts are gated to
      // manual / pre-merge runs. Real Supabase dev DB + real AI providers — costs apply.
      // Default chromium project skips them; opt in via E2E_RUN_LIVE=1 so they
      // run only when explicitly requested (the spec also has its own test.skip
      // guard so a stray invocation without the env stays a no-op).
      testIgnore: process.env.E2E_RUN_LIVE === '1' ? undefined : /live-autopilot|full-pipeline-real-ai/,
    },
  ],

  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        // NOTE: the `.next/dev/lock` lockfile is shared across all `next dev`
        // instances in the same project dir. If `npm run dev` is already
        // running for development, stop it before invoking the e2e suite.
        command: `next dev --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          NODE_ENV: 'development',
          NEXT_PUBLIC_E2E: '1',
        },
      },
})
