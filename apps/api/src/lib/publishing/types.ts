/**
 * Shared interface for all publish drivers (T6.1+).
 *
 * Each driver (YouTube, Spotify, Apple Podcasts, RSS, WordPress) exposes
 * `publishTo(target, stageRun)` so the orchestrator can dispatch without
 * knowing the platform.
 */

import type { StageRun } from '@brighttale/shared/pipeline/inputs';

/**
 * A publish_targets row narrowed to the fields drivers need.
 */
export interface PublishTargetRow {
  id: string;
  type: string;
  displayName: string;
  credentialsEncrypted: string | null;
  configJson: Record<string, unknown> | null;
}

/**
 * Outcome written to `stage_runs.outcome_json` on success.
 * Each driver may extend this with platform-specific fields.
 */
export interface PublishResult {
  publishedUrl: string;
  /** Platform-specific identifier (e.g. YouTube videoId) */
  externalId: string;
  publishedAt: string;
}

/**
 * Outcome written on `awaiting_user` transition (auth expired, quota, etc.).
 */
export interface PublishAwaitingOutcome {
  reason: 'publish_target_auth_expired' | 'quota_exceeded';
  details?: string;
}

/**
 * Outcome for a hard validation / insert failure that the orchestrator can
 * surface to the user without requiring re-authentication.
 */
export interface PublishFailedOutcome {
  code: string;
  message: string;
}

export type PublishDriverOutcome =
  | { status: 'published'; result: PublishResult }
  | { status: 'awaiting_user'; outcome: PublishAwaitingOutcome }
  | { status: 'failed'; error: PublishFailedOutcome };

export interface PublishDriver {
  publishTo(target: PublishTargetRow, stageRun: StageRun): Promise<PublishDriverOutcome>;
}
