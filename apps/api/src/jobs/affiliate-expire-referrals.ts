import { inngest } from './client.js'
import { buildAffiliateContainer } from '../lib/affiliate/container.js'

type StepRun = (name: string, fn: () => Promise<unknown>) => Promise<unknown>

export const affiliateExpireReferrals = inngest.createFunction(
  {
    id: 'affiliate-expire-referrals',
    retries: 2,
    triggers: [{ cron: '0 5 * * *' }],   // 02:00 BRT (Brazil DST abolished 2019)
  },
  async ({ step }: { step: { run: StepRun } }) => {
    const container = buildAffiliateContainer()
    try {
      const result = (await step.run('expire-pending-referrals', async () => {
        return container.expirePendingUseCase.execute(new Date().toISOString())
      })) as { totalExpired: number }
      return { totalExpired: result.totalExpired, ranAt: new Date().toISOString() }
    } catch (err) {
      console.error('[affiliate-expire-referrals] failed', err)
      throw err  // re-throw so Inngest retry semantics apply; global handlers capture
    }
  }
)
