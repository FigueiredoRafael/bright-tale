import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

const ROOT = process.cwd()
const RUN_ID =
  process.env.QA_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-')
const ARTIFACTS_DIR = join(ROOT, 'qa-artifacts', RUN_ID)

mkdirSync(ARTIFACTS_DIR, { recursive: true })

let stepCounter = 0

function nextStep(): string {
  stepCounter += 1
  return String(stepCounter).padStart(2, '0')
}

function slug(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

export async function snapshot(page: Page, label: string): Promise<string> {
  const file = join(ARTIFACTS_DIR, `${nextStep()}-${slug(label)}.png`)
  await page.screenshot({ path: file, fullPage: true })
   
  console.log(`[QA] snapshot → ${file}`)
  return file
}

export async function dumpDom(page: Page, label: string): Promise<string> {
  const file = join(ARTIFACTS_DIR, `${nextStep()}-${slug(label)}.html`)
  writeFileSync(file, await page.content())
   
  console.log(`[QA] dom → ${file}`)
  return file
}

export async function applyDefaultMocks(page: Page): Promise<void> {
  await page.route('**/api/admin/pipeline-settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null }),
    }),
  )
  await page.route('**/api/admin/credit-settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null }),
    }),
  )
  await page.route('**/api/autopilot-templates*', async (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      const body = route.request().postDataJSON?.() as { name?: string } | undefined
      const created = {
        id: `tpl-${Date.now()}`,
        name: body?.name ?? 'unnamed',
        is_default: false,
        scope: 'channel',
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: created, error: null }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [] }, error: null }),
    })
  })
  await page.route('**/api/projects/*/setup', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {}, error: null }),
    }),
  )
  // Block telemetry to keep network logs clean
  await page.route('**/posthog.com/**', (route) => route.fulfill({ status: 204 }))
  await page.route('**/i.posthog.com/**', (route) => route.fulfill({ status: 204 }))
  await page.route('**/*.sentry.io/**', (route) => route.fulfill({ status: 204 }))
}

export function attachConsoleCapture(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = `[${msg.type()}] ${msg.text()}`
      errors.push(text)
       
      console.log(`[BROWSER ${text}]`)
    }
  })
  page.on('pageerror', (err) => {
    const text = `[pageerror] ${err.message}`
    errors.push(text)
     
    console.log(`[BROWSER ${text}]`)
  })
  return errors
}

export const QA_ARTIFACTS_DIR = ARTIFACTS_DIR
export const QA_RUN_ID = RUN_ID
