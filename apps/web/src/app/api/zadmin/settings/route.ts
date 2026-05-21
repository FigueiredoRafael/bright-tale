import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const WRITE_ROLES = new Set(['owner', 'admin'])
const READ_ROLES = new Set(['owner', 'admin', 'support', 'billing', 'readonly'])

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ data: null, error: { code, message } }, { status })
}

async function getManagerRole(userId: string): Promise<string | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('managers')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  return data?.role ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail(401, 'UNAUTHORIZED', 'Not authenticated')

  const role = await getManagerRole(user.id)
  if (!role || !READ_ROLES.has(role)) return fail(403, 'FORBIDDEN', 'Manager access required')

  const sb = createAdminClient()

  const [{ data: cfg }, { data: rates }] = await Promise.all([
    sb.from('pricing_config').select('*').eq('id', true).maybeSingle(),
    sb.from('currency_rates').select('currency, rate_to_usd, fetched_at, source').order('currency'),
  ])

  if (!cfg) return fail(500, 'NO_CONFIG', 'pricing_config row not found')

  return NextResponse.json({
    data: {
      pricing: {
        extraBlockCredits: cfg.extra_block_credits,
        extraBlockPriceUsdCents: cfg.extra_block_price_usd_cents,
        freeTierMonthlyCredits: cfg.free_tier_monthly_credits,
        freeTierSignupBonusCredits: cfg.free_tier_signup_bonus_credits,
        freeTierBonusValidityDays: cfg.free_tier_bonus_validity_days,
      },
      sla: cfg.support_sla_json ?? { p0_mins: 15, p1_mins: 120, p2_mins: 480, p3_mins: 1440 },
      margins: cfg.margin_thresholds_json ?? { green_pct: 40, yellow_pct: 20 },
      currencyRates: (rates ?? []).map((r) => ({
        currency: r.currency,
        rateToUsd: r.rate_to_usd,
        fetchedAt: r.fetched_at,
        source: r.source,
      })),
      updatedAt: cfg.updated_at,
    },
    error: null,
  })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail(401, 'UNAUTHORIZED', 'Not authenticated')

  const role = await getManagerRole(user.id)
  if (!role || !WRITE_ROLES.has(role)) return fail(403, 'FORBIDDEN', 'Owner or admin role required')

  const body = await request.json() as Record<string, unknown>
  const update: Record<string, unknown> = { updated_by: user.id }

  if ('extraBlockCredits' in body) update.extra_block_credits = Number(body.extraBlockCredits)
  if ('extraBlockPriceUsdCents' in body) update.extra_block_price_usd_cents = Number(body.extraBlockPriceUsdCents)
  if ('freeTierMonthlyCredits' in body) update.free_tier_monthly_credits = Number(body.freeTierMonthlyCredits)
  if ('freeTierSignupBonusCredits' in body) update.free_tier_signup_bonus_credits = Number(body.freeTierSignupBonusCredits)
  if ('freeTierBonusValidityDays' in body) update.free_tier_bonus_validity_days = Number(body.freeTierBonusValidityDays)
  if ('sla' in body) update.support_sla_json = body.sla
  if ('margins' in body) update.margin_thresholds_json = body.margins

  if (Object.keys(update).length <= 1) {
    return fail(400, 'NO_FIELDS', 'Nothing to update')
  }

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('pricing_config')
    .update(update as never)
    .eq('id', true)
    .select('*')
    .single()

  if (error) return fail(500, 'UPDATE_ERROR', error.message)
  if (!data) return fail(500, 'NO_CONFIG', 'pricing_config row not found')

  return NextResponse.json({ data: { updatedAt: data.updated_at }, error: null })
}
