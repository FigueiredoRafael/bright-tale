/**
 * Credit Balance Calculator (V2-006.2)
 *
 * Unifies fields from two branches:
 *   - V2-006 (credit-reservations): creditsReserved
 *   - M-004 (staging):              signupBonusCredits, signupBonusExpiresAt
 *
 * VIP override (F3-012):
 *   When organizations.is_vip is true, available = Number.POSITIVE_INFINITY
 *   and the CreditBalance carries an unlimited: true discriminant.
 *
 * available formula (non-VIP):
 *   (credits_total - credits_used - credits_reserved)
 *   + credits_addon
 *   + signup_bonus_remaining
 *
 * where signup_bonus_remaining = signupBonusExpiresAt > now()
 *   ? signupBonusCredits : 0
 */

import { createServiceClient } from '../supabase/index.js';
import { ApiError } from '../api/errors.js';

// ---------------------------------------------------------------------------
// CreditBalance type
// ---------------------------------------------------------------------------

export interface CreditBalance {
  /** True only for VIP orgs (is_vip = true). When present and true, available = Infinity. */
  unlimited: boolean;
  creditsTotal: number;
  creditsUsed: number;
  creditsAddon: number;
  /** Credits currently reserved (held, not yet committed). V2-006. */
  creditsReserved: number;
  creditsResetAt: string | null;
  /** Effective available credits (see module header for formula). */
  available: number;
  /** Bonus credits granted at signup. M-004. */
  signupBonusCredits: number;
  /** ISO timestamp when the signup bonus expires (null = no expiry / no bonus). M-004. */
  signupBonusExpiresAt: string | null;
}

// ---------------------------------------------------------------------------
// getBalance()
// ---------------------------------------------------------------------------

/**
 * Returns the current credit balance for an organization.
 *
 * @throws ApiError 404 — organization not found
 */
export async function getBalance(orgId: string): Promise<CreditBalance> {
  const sb = createServiceClient();

  const { data: org, error } = await sb
    .from('organizations')
    .select(
      'credits_total, credits_used, credits_addon, credits_reserved, credits_reset_at, is_vip, signup_bonus_credits, signup_bonus_expires_at',
    )
    .eq('id', orgId)
    .single();

  if (error || !org) {
    throw new ApiError(404, 'Organization not found', 'NOT_FOUND');
  }

  const creditsTotal: number = org.credits_total as number;
  const creditsUsed: number = org.credits_used as number;
  const creditsAddon: number = (org.credits_addon as number) ?? 0;
  const creditsReserved: number = (org.credits_reserved as number) ?? 0;
  const creditsResetAt: string | null = (org.credits_reset_at as string | null) ?? null;
  const isVip: boolean = (org.is_vip as boolean) ?? false;
  const signupBonusCredits: number = (org.signup_bonus_credits as number) ?? 0;
  const signupBonusExpiresAt: string | null = (org.signup_bonus_expires_at as string | null) ?? null;

  // VIP override — unlimited sentinel
  if (isVip) {
    return {
      unlimited: true,
      creditsTotal,
      creditsUsed,
      creditsAddon,
      creditsReserved,
      creditsResetAt,
      available: Number.POSITIVE_INFINITY,
      signupBonusCredits,
      signupBonusExpiresAt,
    };
  }

  // Signup bonus: only counted if not yet expired
  const signupBonusRemaining =
    signupBonusExpiresAt && new Date(signupBonusExpiresAt) > new Date()
      ? signupBonusCredits
      : 0;

  const available =
    (creditsTotal - creditsUsed - creditsReserved) + creditsAddon + signupBonusRemaining;

  return {
    unlimited: false,
    creditsTotal,
    creditsUsed,
    creditsAddon,
    creditsReserved,
    creditsResetAt,
    available,
    signupBonusCredits,
    signupBonusExpiresAt,
  };
}
