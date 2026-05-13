/**
 * Credit system — check + debit logic (F1-009)
 *
 * Usage flow:
 *   1. checkCredits(orgId, userId, cost) — verify sufficient balance
 *   2. [perform the action]
 *   3. debitCredits(orgId, userId, action, category, cost) — record usage
 */

import { createServiceClient } from './supabase/index.js';
import { ApiError } from './api/errors.js';

interface CreditBalance {
  creditsTotal: number;
  creditsUsed: number;
  creditsAddon: number;
  creditsResetAt: string | null;
  available: number;
  signupBonusCredits: number;
  signupBonusExpiresAt: string | null;
}

/**
 * Returns the org's current credit balance.
 */
export async function getBalance(orgId: string): Promise<CreditBalance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceClient() as any;
  const { data: org, error } = await sb
    .from('organizations')
    .select('credits_total, credits_used, credits_addon, credits_reset_at, signup_bonus_credits, signup_bonus_expires_at')
    .eq('id', orgId)
    .single();

  if (error || !org) throw new ApiError(404, 'Organization not found', 'NOT_FOUND');

  return {
    creditsTotal: org.credits_total as number,
    creditsUsed: org.credits_used as number,
    creditsAddon: org.credits_addon as number,
    creditsResetAt: org.credits_reset_at as string | null,
    available: ((org.credits_total as number) - (org.credits_used as number)) + (org.credits_addon as number),
    signupBonusCredits: (org.signup_bonus_credits as number) ?? 0,
    signupBonusExpiresAt: (org.signup_bonus_expires_at as string | null) ?? null,
  };
}

/**
 * Checks if the org (and optionally the member) has enough credits.
 * Throws InsufficientCreditsError if not.
 */
export async function checkCredits(orgId: string, userId: string, cost: number): Promise<void> {
  // F3-012 — VIP orgs têm créditos ilimitados (invite-only admin flag).
  const sbVip = createServiceClient();
  const { data: vipCheck } = await sbVip
    .from('organizations')
    .select('is_vip')
    .eq('id', orgId)
    .maybeSingle();
  if (vipCheck?.is_vip) return;

  const balance = await getBalance(orgId);

  if (balance.available < cost) {
    throw new ApiError(402, `Insufficient credits. Available: ${balance.available}, required: ${cost}. Resets at: ${balance.creditsResetAt ?? 'N/A'}`, 'INSUFFICIENT_CREDITS');
  }

  // Check per-member limit if configured
  const sb = createServiceClient();
  const { data: membership } = await sb
    .from('org_memberships')
    .select('credit_limit, credits_used_cycle')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (membership?.credit_limit !== null && membership?.credit_limit !== undefined) {
    const memberAvailable = membership.credit_limit - membership.credits_used_cycle;
    if (memberAvailable < cost) {
      throw new ApiError(402, `Your personal credit limit reached. Used: ${membership.credits_used_cycle}/${membership.credit_limit}`, 'MEMBER_CREDIT_LIMIT');
    }
  }
}

/**
 * Debits credits after an action completes.
 * Uses addon credits first, then plan credits.
 * Records the usage in credit_usage table.
 */
export async function debitCredits(
  orgId: string,
  userId: string,
  action: string,
  category: string,
  cost: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const sb = createServiceClient();

  // Get current org credits
  const { data: org } = await sb
    .from('organizations')
    .select('credits_used, credits_addon')
    .eq('id', orgId)
    .single();

  if (!org) throw new ApiError(404, 'Organization not found', 'NOT_FOUND');

  // Determine source: use addon credits first
  let addonDebit = 0;
  let planDebit = 0;
  let source: string;

  if (org.credits_addon >= cost) {
    addonDebit = cost;
    source = 'addon';
  } else if (org.credits_addon > 0) {
    addonDebit = org.credits_addon;
    planDebit = cost - addonDebit;
    source = 'mixed';
  } else {
    planDebit = cost;
    source = 'plan';
  }

  // Update org credits
  const { error: updateError } = await sb
    .from('organizations')
    .update({
      credits_used: org.credits_used + planDebit,
      credits_addon: org.credits_addon - addonDebit,
    })
    .eq('id', orgId);

  if (updateError) throw updateError;

  // Update member cycle usage
  const { data: membership } = await sb
    .from('org_memberships')
    .select('credits_used_cycle')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (membership) {
    await sb
      .from('org_memberships')
      .update({ credits_used_cycle: membership.credits_used_cycle + cost })
      .eq('org_id', orgId)
      .eq('user_id', userId);
  }

  // Record in credit_usage
  await sb.from('credit_usage').insert({
    org_id: orgId,
    user_id: userId,
    action,
    category,
    cost,
    source,
    metadata_json: (metadata ?? null) as never,
  });
}
