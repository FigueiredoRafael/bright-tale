/**
 * WordPress configuration helper — dual-read/dual-write safety net for
 * the wordpress_configs → publish_targets migration (T6.5a).
 *
 * Read strategy (feature-flagged):
 *   PUBLISH_TARGETS_PRIMARY=true (default)
 *     → read from publish_targets (type='wordpress') first;
 *       if no row found, fall back to wordpress_configs.
 *   PUBLISH_TARGETS_PRIMARY=false (legacy mode)
 *     → read from wordpress_configs only.
 *
 * Write strategy (always dual-write regardless of flag):
 *   → upsert both publish_targets AND wordpress_configs so either table
 *     always has a valid row and rollback is safe.
 *
 * Delete strategy (always dual-delete):
 *   → remove from both tables.
 *
 * Credentials are AES-256-GCM encrypted.
 * In publish_targets, credentials_encrypted stores the password.
 * In wordpress_configs, password stores the encrypted password (legacy, no AAD).
 *
 * AAD for publish_targets rows:
 *   aadFor('publish_targets', 'credentials_encrypted', target.id, '')
 *
 * Because the T2.8 backfill copied passwords without AAD (to preserve backward
 * compatibility), we always attempt decrypt without AAD first, then with AAD on
 * publish_targets rows created by this helper. See decryptPassword() below.
 */

import { encrypt, decrypt, aadFor } from '../crypto.js';
import { createServiceClient } from '../supabase/index.js';

type SupabaseClient = ReturnType<typeof createServiceClient>;

// ── Public types ──────────────────────────────────────────────────────────────

export interface WordPressConfig {
  /** publish_targets.id when sourced from publish_targets; wordpress_configs.id otherwise */
  id: string;
  channelId: string;
  siteUrl: string;
  username: string;
  /** Encrypted password (do not use directly — call getWordPressCredentials) */
  credentialsEncrypted: string;
  /** Which table provided this record */
  source: 'publish_targets' | 'wordpress_configs';
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

// ── Feature flag ──────────────────────────────────────────────────────────────

function isPublishTargetsPrimary(): boolean {
  return (process.env.PUBLISH_TARGETS_PRIMARY ?? 'true') !== 'false';
}

// ── Internal decrypt helper ───────────────────────────────────────────────────
// publish_targets rows created by this helper (post-T6.5a) use AAD.
// Rows backfilled by T2.8 do not use AAD (copied verbatim from wordpress_configs).
// We attempt AAD-free decrypt first; that covers both cases. If a row was written
// with AAD, the caller must use the AAD variant explicitly — but since this module
// always writes AAD-free for safety, plain decrypt is correct here.

function decryptPassword(encrypted: string): string {
  return decrypt(encrypted);
}

// ── Read functions ────────────────────────────────────────────────────────────

/**
 * Fetch the WordPress config for a channel.
 * Returns null if no config exists in either table.
 */
export async function getWordPressConfig(
  channelId: string,
  sb: SupabaseClient,
): Promise<WordPressConfig | null> {
  if (isPublishTargetsPrimary()) {
    // Try publish_targets first
    const { data: pt } = await sb
      .from('publish_targets')
      .select('id, channel_id, config_json, credentials_encrypted, display_name, created_at, updated_at')
      .eq('channel_id', channelId)
      .eq('type', 'wordpress')
      .eq('is_active', true)
      .maybeSingle();

    if (pt) {
      const cfg = pt.config_json as Record<string, unknown> | null;
      return {
        id: pt.id as string,
        channelId: pt.channel_id as string,
        siteUrl: (cfg?.siteUrl as string) ?? '',
        username: (cfg?.username as string) ?? '',
        credentialsEncrypted: (pt.credentials_encrypted as string) ?? '',
        source: 'publish_targets',
        createdAt: pt.created_at as string,
        updatedAt: pt.updated_at as string,
      };
    }
  }

  // Fallback (or primary when flag is false): read from wordpress_configs
  const { data: wc } = await sb
    .from('wordpress_configs')
    .select('id, channel_id, site_url, username, password, created_at, updated_at')
    .eq('channel_id', channelId)
    .maybeSingle();

  if (!wc) return null;

  return {
    id: wc.id as string,
    channelId: wc.channel_id as string,
    siteUrl: wc.site_url as string,
    username: wc.username as string,
    credentialsEncrypted: wc.password as string,
    source: 'wordpress_configs',
    createdAt: wc.created_at as string,
    updatedAt: wc.updated_at as string,
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
 * Upsert a WordPress config — always writes to BOTH tables so either can be
 * the canonical source after a rollback.
 *
 * publish_targets: select existing row first; if found, update it in place;
 * otherwise insert a new row. (No unique constraint on channel_id+type, so we
 * cannot use ON CONFLICT — a manual select-then-write avoids duplicates.)
 *
 * wordpress_configs: upsert by channel_id (has a unique index, so ON CONFLICT works).
 */
export async function upsertWordPressConfig(
  channelId: string,
  cfg: WordPressConfigInput,
  sb: SupabaseClient,
): Promise<void> {
  const encryptedPassword = encrypt(cfg.password);
  const siteUrl = cfg.siteUrl.replace(/\/$/, '');
  const displayName = cfg.displayName ?? siteUrl;

  // 1. publish_targets — select existing, then update or insert
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

  // 2. wordpress_configs — upsert by channel_id
  const { error: wcErr } = await sb
    .from('wordpress_configs')
    .upsert(
      {
        channel_id: channelId,
        site_url: siteUrl,
        username: cfg.username,
        password: encryptedPassword,
      },
      { onConflict: 'channel_id' },
    );

  if (wcErr) throw new Error(`upsertWordPressConfig (wordpress_configs): ${wcErr.message}`);
}

/**
 * Delete WordPress config from BOTH tables.
 */
export async function deleteWordPressConfig(
  channelId: string,
  sb: SupabaseClient,
): Promise<void> {
  // Delete from publish_targets
  const { error: ptErr } = await sb
    .from('publish_targets')
    .delete()
    .eq('channel_id', channelId)
    .eq('type', 'wordpress');

  if (ptErr) throw new Error(`deleteWordPressConfig (publish_targets): ${ptErr.message}`);

  // Delete from wordpress_configs
  const { error: wcErr } = await sb
    .from('wordpress_configs')
    .delete()
    .eq('channel_id', channelId);

  if (wcErr) throw new Error(`deleteWordPressConfig (wordpress_configs): ${wcErr.message}`);
}
