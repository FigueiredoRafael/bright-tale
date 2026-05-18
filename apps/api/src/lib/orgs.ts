/**
 * Organization helpers with runtime fallback.
 *
 * `ensureOrgId` is idempotent — if the user has no org, it creates one.
 * Use this at write entry points so users can never hit "No organization found".
 */

import { createServiceClient } from './supabase/index.js';
import { ApiError } from './api/errors.js';

/**
 * Returns the user's primary org_id. If they don't have one (shouldn't happen
 * in normal flow, but can happen for legacy users), creates it on the fly.
 */
export async function ensureOrgId(userId: string): Promise<string> {
  const sb = createServiceClient();

  // Check existing membership first
  const { data: existing } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.org_id) return existing.org_id;

  // No membership → create org + make user owner
  // Get user email for org name
  const { data: authData } = await sb.auth.admin.getUserById(userId);
  const email = authData?.user?.email ?? null;
  const orgName = email ? email.split('@')[0] : 'My Organization';
  const slug = `personal-${userId.replace(/-/g, '')}`;

  // Ensure user_profile exists (trigger chain depends on it)
  await sb
    .from('user_profiles')
    .upsert({ id: userId, email: email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });

  // Create org. The slug is deterministic per userId, so a unique-violation
  // here means a prior attempt created the org row but failed before the
  // membership insert (or the membership was later deleted). Recover by
  // looking the org up and continuing with the membership step.
  const { data: org, error: orgError } = await sb
    .from('organizations')
    .insert({ name: orgName, slug, plan: 'free' })
    .select('id')
    .single();

  let orgId = org?.id;
  if (orgError || !org) {
    if (orgError?.code === '23505') {
      const { data: existingOrg } = await sb
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!existingOrg) {
        throw new ApiError(500, `Failed to create org: ${orgError.message}`, 'ORG_CREATE_FAILED');
      }
      orgId = existingOrg.id;
    } else {
      throw new ApiError(500, `Failed to create org: ${orgError?.message ?? 'unknown'}`, 'ORG_CREATE_FAILED');
    }
  }

  // Create membership
  const { error: memberError } = await sb
    .from('org_memberships')
    .insert({
      org_id: orgId!,
      user_id: userId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

  if (memberError) {
    // If a concurrent request already created it, look it up again
    const { data: retry } = await sb
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (retry?.org_id) return retry.org_id;
    throw new ApiError(500, `Failed to create membership: ${memberError.message}`, 'MEMBERSHIP_CREATE_FAILED');
  }

  return orgId!;
}

/**
 * Read-only version. Throws 404 if no org — use only in read endpoints.
 */
export async function getOrgIdStrict(userId: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) throw new ApiError(404, 'No organization found', 'NOT_FOUND');
  return data.org_id;
}
