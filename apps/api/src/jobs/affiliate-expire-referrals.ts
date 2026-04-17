import * as Sentry from '@sentry/node'
import { inngest } from './client.js'
import { buildAffiliateContainer } from '../lib/affiliate/container.js'

type StepRun = (name: string, fn: () => Promise<unknown>) => Promise<unknown>

export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: '0 5 * * *' }],   // 02:00 BRT year-round (Brazil UTC-3)
  },
  async ({ step }: { step: { run: StepRun } }) => {
    const container = buildAffiliateContainer()
    try {
      const result = (await step.run('expire-pending-referrals', async () => {
        return container.expirePendingUseCase.execute(new Date().toISOString())
      })) as { totalExpired: number }
      return { totalExpired: result.totalExpired, ranAt: new Date().toISOString() }
    } catch (err) {
      // Inngest catches the throw before it reaches process-level handlers, so
      // the global `unhandledRejection` Sentry capture in apps/api/src/index.ts
      // never sees it. Capture explicitly here.
      Sentry.captureException(err, { tags: { job: 'affiliate-expire-referrals' } })
      console.error('[affiliate-expire-referrals] failed', err)
      throw err  // re-throw so Inngest retry semantics apply
    }
  }
)
