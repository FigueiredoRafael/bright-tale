/**
 * WordPress configuration helper — single-source reads/writes against
 * publish_targets (T6.5b).
 *
 * The dual-read/dual-write safety net from T6.5a has been removed now that
 * the wordpress_configs table is dropped (#73).
 *
 * Credentials are AES-256-GCM encrypted and stored in
 * publish_targets.credentials_encrypted.
 */

import { encrypt, decrypt } from '../crypto.js';
import { createServiceClient } from '../supabase/index.js';

type SupabaseClient = ReturnType<typeof createServiceClient>;

// ── Public types ──────────────────────────────────────────────────────────────

export interface WordPressConfig {
  /** publish_targets.id */
  id: string;
  channelId: string;
  siteUrl: string;
  username: string;
  /** Encrypted password (do not use directly — call getWordPressCredentials) */
  credentialsEncrypted: string;
  createdAt: string;
  updatedAt: string;
}

export interface WordPressConfigInput {
  siteUrl: string;
  username: string;
  /** Plain-text password — will be encrypted before writing */
  password: string;
  /** Optional human-readable label stored in publish_targets.display_name */
  displayName?: string;
}

export interface WordPressCredentials {
  siteUrl: string;
  username: string;
  /** Decrypted plain-text password */
  password: string;
}

// ── Internal decrypt helper ───────────────────────────────────────────────────

function decryptPassword(encrypted: string): string {
  return decrypt(encrypted);
}

// ── Read functions ────────────────────────────────────────────────────────────

/**
 * Fetch the WordPress config for a channel from publish_targets.
 * Returns null if no config exists.
 */
export async function getWordPressConfig(
  channelId: string,
  sb: SupabaseClient,
): Promise<WordPressConfig | null> {
  const { data: pt } = await sb
    .from('publish_targets')
    .select('id, channel_id, config_json, credentials_encrypted, display_name, created_at, updated_at')
    .eq('channel_id', channelId)
    .eq('type', 'wordpress')
    .eq('is_active', true)
    .maybeSingle();

  if (!pt) return null;

  const cfg = pt.config_json as Record<string, unknown> | null;
  return {
    id: pt.id as string,
    channelId: pt.channel_id as string,
    siteUrl: (cfg?.siteUrl as string) ?? '',
    username: (cfg?.username as string) ?? '',
    credentialsEncrypted: (pt.credentials_encrypted as string) ?? '',
    createdAt: pt.created_at as string,
    updatedAt: pt.updated_at as string,
  };
}

/**
 * Resolve decrypted credentials for a channel's WordPress config.
 * Returns null if no config exists.
 */
export async function getWordPressCredentials(
  channelId: string,
  sb: SupabaseClient,
): Promise<WordPressCredentials | null> {
  const cfg = await getWordPressConfig(channelId, sb);
  if (!cfg) return null;

  return {
    siteUrl: cfg.siteUrl,
    username: cfg.username,
    password: decryptPassword(cfg.credentialsEncrypted),
  };
}

// ── Write functions ───────────────────────────────────────────────────────────

/**
 * Upsert a WordPress config against publish_targets.
 *
 * Selects the existing row first; if found, updates it in place; otherwise
 * inserts a new row. (No unique constraint on channel_id+type, so we cannot
 * use ON CONFLICT — a manual select-then-write avoids duplicates.)
 */
export async function upsertWordPressConfig(
  channelId: string,
  cfg: WordPressConfigInput,
  sb: SupabaseClient,
): Promise<void> {
  const encryptedPassword = encrypt(cfg.password);
  const siteUrl = cfg.siteUrl.replace(/\/$/, '');
  const displayName = cfg.displayName ?? siteUrl;

  const { data: existingPt } = await sb
    .from('publish_targets')
    .select('id')
    .eq('channel_id', channelId)
    .eq('type', 'wordpress')
    .maybeSingle();

  if (existingPt) {
    const { error: ptErr } = await sb
      .from('publish_targets')
      .update({
        display_name: displayName,
        credentials_encrypted: encryptedPassword,
        config_json: { siteUrl, username: cfg.username },
        is_active: true,
      })
      .eq('id', (existingPt as { id: string }).id);
    if (ptErr) throw new Error(`upsertWordPressConfig (publish_targets update): ${ptErr.message}`);
  } else {
    const { error: ptErr } = await sb
      .from('publish_targets')
      .insert({
        channel_id: channelId,
        type: 'wordpress',
        display_name: displayName,
        credentials_encrypted: encryptedPassword,
        config_json: { siteUrl, username: cfg.username },
        is_active: true,
      });
    if (ptErr) throw new Error(`upsertWordPressConfig (publish_targets insert): ${ptErr.message}`);
  }
}

/**
 * Delete WordPress config from publish_targets.
 */
export async function deleteWordPressConfig(
  channelId: string,
  sb: SupabaseClient,
): Promise<void> {
  const { error: ptErr } = await sb
    .from('publish_targets')
    .delete()
    .eq('channel_id', channelId)
    .eq('type', 'wordpress');

  if (ptErr) throw new Error(`deleteWordPressConfig (publish_targets): ${ptErr.message}`);
}
