/**
 * V2-006.5 — expire-reservations cron
 *
 * Runs every 5 minutes. Sweeps held credit reservations older than 15 minutes
 * via the expireStale() façade (which calls the expire_stale_reservations RPC).
 *
 * Telemetry:
 *   - Axiom metric: credit_reservations.expired_count
 *   - [ALERT] log at error level if expiredCount > EXPIRED_COUNT_ALERT_THRESHOLD
 *     (no external webhook configured — alert is Axiom error-level so it surfaces
 *     in dashboards and Sentry if wired; threshold is easy to raise via the constant)
 */

import * as Sentry from '@sentry/node'
import { inngest } from './client.js'
import { expireStale } from '../lib/credits/reservations.js'
import { ingest, flushAxiom } from '../lib/axiom.js'

/** Raise this constant to tune the alert sensitivity without touching logic. */
export const EXPIRED_COUNT_ALERT_THRESHOLD = 50

type StepRun = (name: string, fn: () => Promise<unknown>) => Promise<unknown>

export const expireReservations = inngest.createFunction(
  {
    id: 'expire-reservations',
    retries: 2,
    triggers: [{ cron: '*/5 * * * *' }],
  },
  async ({ step }: { step: { run: StepRun } }) => {
    let expiredCount = 0

    try {
      expiredCount = (await step.run('expire-stale-reservations', async () => {
        return expireStale()
      })) as number

      ingest({
        type: 'credit_reservations.expired_count',
        metric: 'credit_reservations.expired_count',
        expiredCount,
        ranAt: new Date().toISOString(),
      })

      if (expiredCount > EXPIRED_COUNT_ALERT_THRESHOLD) {
        // No Slack/Discord webhook configured — log at error level so the event
        // surfaces in Axiom error dashboards and triggers any downstream alerting.
        ingest({
          type: 'alert',
          level: 'error',
          message: `[ALERT] expire-reservations: high expiry count (${expiredCount} > threshold ${EXPIRED_COUNT_ALERT_THRESHOLD})`,
          expiredCount,
          threshold: EXPIRED_COUNT_ALERT_THRESHOLD,
          ranAt: new Date().toISOString(),
        })
        console.error(
          `[ALERT] expire-reservations: high expiry count (${expiredCount} > threshold ${EXPIRED_COUNT_ALERT_THRESHOLD})`
        )
      }

      await flushAxiom()
      return { expiredCount, ranAt: new Date().toISOString() }
    } catch (err) {
      // Inngest intercepts the throw before process-level handlers, so capture
      // explicitly to ensure Sentry records the failure.
      Sentry.captureException(err, { tags: { job: 'expire-reservations' } })
      console.error('[expire-reservations] failed', err)
      throw err // re-throw so Inngest retry semantics apply
    }
  }
)
