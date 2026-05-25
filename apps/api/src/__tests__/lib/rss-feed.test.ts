/**
 * T6.4 — Unit tests for rss-feed.ts pure helper functions.
 *
 * These tests cover formatDuration and computeEtag directly,
 * exercising edge cases without any database access.
 */

import { describe, it, expect } from 'vitest';
import { formatDuration, computeEtag } from '../../lib/publishing/rss-feed';

describe('formatDuration', () => {
  it('formats seconds under one hour as MM:SS', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(59)).toBe('00:59');
    expect(formatDuration(60)).toBe('01:00');
    expect(formatDuration(1800)).toBe('30:00');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats seconds over one hour as H:MM:SS', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7322)).toBe('2:02:02');
  });

  it('returns empty string for null or undefined', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
  });

  it('returns empty string for negative values', () => {
    expect(formatDuration(-1)).toBe('');
  });
});

describe('computeEtag', () => {
  const ep = (id: string, updatedAt: string) => ({
    id,
    title: 'T',
    description: 'D',
    audio_url: 'https://example.com/ep.mp3',
    duration_sec: 60,
    guid: `urn:${id}`,
    published_at: '2026-05-10T10:00:00Z',
    itunes_explicit: false,
    itunes_image_url: null,
    updated_at: updatedAt,
  });

  it('returns a quoted hex string', () => {
    const etag = computeEtag([ep('ep-1', '2026-05-10T10:00:00Z')]);
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it('returns stable result for the same input', () => {
    const episodes = [ep('ep-1', '2026-05-10T10:00:00Z')];
    expect(computeEtag(episodes)).toBe(computeEtag(episodes));
  });

  it('produces a different ETag when an episode is updated', () => {
    const a = computeEtag([ep('ep-1', '2026-05-10T10:00:00Z')]);
    const b = computeEtag([ep('ep-1', '2026-05-11T10:00:00Z')]);
    expect(a).not.toBe(b);
  });

  it('produces a different ETag when an episode is added', () => {
    const a = computeEtag([ep('ep-1', '2026-05-10T10:00:00Z')]);
    const b = computeEtag([
      ep('ep-1', '2026-05-10T10:00:00Z'),
      ep('ep-2', '2026-05-11T10:00:00Z'),
    ]);
    expect(a).not.toBe(b);
  });

  it('returns a consistent ETag for an empty episode list', () => {
    const a = computeEtag([]);
    const b = computeEtag([]);
    expect(a).toBe(b);
    expect(a).toMatch(/^"[0-9a-f]{32}"$/);
  });
});
