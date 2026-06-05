/**
 * Canonical channel column superset used when loading a channel for any
 * production/generation path.
 *
 * Callers that previously loaded only a subset (e.g. name, niche, language,
 * tone, presentation_style) can switch to STAGE_CHANNEL_SELECT — loading extra
 * unused columns is harmless and keeps all paths aligned for future migrations.
 */
export const STAGE_CHANNEL_SELECT =
  'name, niche, language, tone, presentation_style, video_style, voice_id, voice_provider, voice_speed' as const;
