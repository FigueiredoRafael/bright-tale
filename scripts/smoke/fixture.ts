import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Baselines, SeedHandles } from './types.js'

const SMOKE_EMAIL_PREFIX = 'smoke-'
const SMOKE_EMAIL_DOMAIN = '@brighttale.test'

export function makeRunId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6)
}

export async function seed(
  supabase: SupabaseClient,
  runId: string
): Promise<SeedHandles> {
  const email = (label: string) => `${SMOKE_EMAIL_PREFIX}${runId}-${label}${SMOKE_EMAIL_DOMAIN}`
  const randomPw = () => randomUUID()

  // 1) auth users (Admin API)
  const admin = await supabase.auth.admin.createUser({
    email: email('admin'), password: randomPw(), email_confirm: true,
  })
  if (admin.error || !admin.data.user) throw new Error(`admin createUser: ${admin.error?.message}`)
  const adminUserId = admin.data.user.id

  const owner = await supabase.auth.admin.createUser({
    email: email('owner'), password: randomPw(), email_confirm: true,
  })
  if (owner.error || !owner.data.user) throw new Error(`owner createUser: ${owner.error?.message}`)
  const affiliateOwnerUserId = owner.data.user.id

  const ref = await supabase.auth.admin.createUser({
    email: email('ref'), password: randomPw(), email_confirm: true,
  })
  if (ref.error || !ref.data.user) throw new Error(`ref createUser: ${ref.error?.message}`)
  const referredUserId = ref.data.user.id

  // 2) admin role
  const roleRes = await supabase.from('user_roles').insert({
    user_id: adminUserId, role: 'admin',
  }).select('user_id').single()
  if (roleRes.error) throw new Error(`user_roles insert: ${roleRes.error.message}`)

  // 3) organization + membership
  const org = await supabase.from('organizations').insert({
    name: `Smoke Org ${runId}`,
    slug: `smoke-${runId}`,
  }).select('id').single()
  if (org.error || !org.data) throw new Error(`organizations insert: ${org.error?.message}`)
  const organizationId = org.data.id

  const mem = await supabase.from('org_memberships').insert({
    org_id: organizationId,
    user_id: referredUserId,
    role: 'owner',
  }).select('id').single()
  if (mem.error) throw new Error(`org_memberships insert: ${mem.error.message}`)

  // 4) affiliate (status=active, tier=nano, rate=0.1500)
  const code = `SMK${runId}`
  const aff = await supabase.from('affiliates').insert({
    user_id: affiliateOwnerUserId,
    code,
    name: `Smoke Owner ${runId}`,
    email: email('owner'),
    status: 'active',
    tier: 'nano',
    commission_rate: 0.15,
    contract_version: 1,
    contract_accepted_at: new Date().toISOString(),
  }).select('id').single()
  if (aff.error || !aff.data) throw new Error(`affiliates insert: ${aff.error?.message}`)
  const affiliateId = aff.data.id

  // 5) referral
  const referral = await supabase.from('affiliate_referrals').insert({
    affiliate_id: affiliateId,
    affiliate_code: code,
    user_id: referredUserId,
    attribution_status: 'active',
  }).select('id').single()
  if (referral.error || !referral.data) throw new Error(`affiliate_referrals insert: ${referral.error?.message}`)
  const referralId = referral.data.id

  // 6) commission
  const comm = await supabase.from('affiliate_commissions').insert({
    affiliate_id: affiliateId,
    affiliate_code: code,
    user_id: referredUserId,
    referral_id: referralId,
    payment_amount: 9900,
    stripe_fee: 434,
    net_amount: 9466,
    commission_rate: 0.15,
    commission_brl: 1420,
    total_brl: 1420,
    payment_type: 'monthly',
    status: 'pending',
  }).select('id').single()
  if (comm.error || !comm.data) throw new Error(`affiliate_commissions insert: ${comm.error?.message}`)
  const commissionId = comm.data.id

  // 7) fraud flag
  const flag = await supabase.from('affiliate_fraud_flags').insert({
    affiliate_id: affiliateId,
    flag_type: 'self_referral_ip_match',
    severity: 'low',
    status: 'open',
    details: { source: 'smoke-fixture' },
  }).select('id').single()
  if (flag.error || !flag.data) throw new Error(`affiliate_fraud_flags insert: ${flag.error?.message}`)
  const fraudFlagId = flag.data.id

  return {
    adminUserId, affiliateOwnerUserId, referredUserId,
    affiliateId, affiliateCode: code, referralId,
    organizationId, commissionId, fraudFlagId,
  }
}

export async function captureBaselines(
  supabase: SupabaseClient,
  h: SeedHandles
): Promise<Baselines> {
  const { count, error } = await supabase
    .from('affiliate_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', h.affiliateId)
    .eq('status', 'pending')
  if (error) throw new Error(`baseline count: ${error.message}`)
  return { pendingCommissionCountForAffiliate: count ?? 0 }
}

export interface CleanupResult {
  rowsRemoved: number
  failures: Array<{ table: string; error: string }>
}

export async function cleanup(
  supabase: SupabaseClient,
  h: Partial<SeedHandles>
): Promise<CleanupResult> {
  let rowsRemoved = 0
  const failures: CleanupResult['failures'] = []
  const tryDelete = async (table: string, fn: () => Promise<{ error: unknown; count: number | null }>) => {
    try {
      const { error, count } = await fn()
      if (error) failures.push({ table, error: String((error as any).message ?? error) })
      else rowsRemoved += count ?? 0
    } catch (err) {
      failures.push({ table, error: String(err) })
    }
  }

  if (h.affiliateId) {
    await tryDelete('affiliate_fraud_flags', () =>
      supabase.from('affiliate_fraud_flags').delete({ count: 'exact' }).eq('affiliate_id', h.affiliateId!))
    await tryDelete('affiliate_commissions', () =>
      supabase.from('affiliate_commissions').delete({ count: 'exact' }).eq('affiliate_id', h.affiliateId!))
    await tryDelete('affiliate_referrals', () =>
      supabase.from('affiliate_referrals').delete({ count: 'exact' }).eq('affiliate_id', h.affiliateId!))
    await tryDelete('affiliates', () =>
      supabase.from('affiliates').delete({ count: 'exact' }).eq('id', h.affiliateId!))
  }
  if (h.organizationId) {
    await tryDelete('org_memberships', () =>
      supabase.from('org_memberships').delete({ count: 'exact' }).eq('org_id', h.organizationId!))
    await tryDelete('organizations', () =>
      supabase.from('organizations').delete({ count: 'exact' }).eq('id', h.organizationId!))
  }
  if (h.adminUserId) {
    await tryDelete('user_roles', () =>
      supabase.from('user_roles').delete({ count: 'exact' }).eq('user_id', h.adminUserId!))
  }
  for (const uid of [h.adminUserId, h.affiliateOwnerUserId, h.referredUserId]) {
    if (!uid) continue
    try {
      const { error } = await supabase.auth.admin.deleteUser(uid)
      if (error) failures.push({ table: 'auth.users', error: error.message })
      else rowsRemoved += 1
    } catch (err) {
      failures.push({ table: 'auth.users', error: String(err) })
    }
  }
  return { rowsRemoved, failures }
}

export async function cleanupOrphans(supabase: SupabaseClient): Promise<CleanupResult> {
  const list = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (list.error) throw new Error(`listUsers: ${list.error.message}`)
  const smokeUsers = list.data.users.filter(
    u => u.email?.startsWith(SMOKE_EMAIL_PREFIX) && u.email?.endsWith(SMOKE_EMAIL_DOMAIN)
  )
  let rowsRemoved = 0
  const failures: CleanupResult['failures'] = []
  const runs = new Map<string, { admin?: string; owner?: string; ref?: string }>()
  for (const u of smokeUsers) {
    const m = /^smoke-([a-f0-9]{6})-(admin|owner|ref)@brighttale\.test$/.exec(u.email ?? '')
    if (!m) continue
    const [, rid, label] = m
    const entry = runs.get(rid) ?? {}
    entry[label as 'admin'|'owner'|'ref'] = u.id
    runs.set(rid, entry)
  }
  for (const [, trio] of runs) {
    let affiliateId: string | undefined
    if (trio.owner) {
      const { data } = await supabase.from('affiliates')
        .select('id').eq('user_id', trio.owner).maybeSingle()
      affiliateId = data?.id
    }
    let organizationId: string | undefined
    if (trio.ref) {
      const { data } = await supabase.from('org_memberships')
        .select('org_id').eq('user_id', trio.ref).limit(1).maybeSingle()
      organizationId = data?.org_id
    }
    const result = await cleanup(supabase, {
      adminUserId: trio.admin,
      affiliateOwnerUserId: trio.owner,
      referredUserId: trio.ref,
      affiliateId,
      organizationId,
    })
    rowsRemoved += result.rowsRemoved
    failures.push(...result.failures)
  }
  return { rowsRemoved, failures }
}
