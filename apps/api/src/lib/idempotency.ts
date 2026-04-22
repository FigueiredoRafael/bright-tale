import { createServiceClient } from './supabase/index.js';

export interface IdempotencyRecord {
  id: string;
  token: string;
  purpose?: string | null;
  request_hash?: string | null;
  response?: any;
  consumed: boolean;
  created_at: Date;
  expires_at?: Date | null;
}

export async function getKeyByToken(token: string) {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('idempotency_keys')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createKey(
  token: string,
  opts?: { purpose?: string; request_hash?: string; expiresAt?: Date },
) {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('idempotency_keys')
    .insert({
      token,
      purpose: opts?.purpose,
      request_hash: opts?.request_hash,
      expires_at: opts?.expiresAt?.toISOString() ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await getKeyByToken(token);
      if (existing && !existing.consumed) {
        return { ...existing, _alreadyInFlight: true } as typeof existing & { _alreadyInFlight: boolean };
      }
      return existing;
    }
    throw error;
  }
  return data;
}

export async function consumeKey(token: string, response: any) {
  const sb = createServiceClient();
  const { error } = await sb
    .from('idempotency_keys')
    .update({ consumed: true, response })
    .eq('token', token);
  if (error) throw error;
}

export async function deleteKey(token: string) {
  const sb = createServiceClient();
  const { error } = await sb
    .from('idempotency_keys')
    .delete()
    .eq('token', token);
  if (error) throw error;
}

export async function cleanupExpired() {
  const sb = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from('idempotency_keys')
    .delete()
    .lt('expires_at', now);
  if (error) throw error;
}
