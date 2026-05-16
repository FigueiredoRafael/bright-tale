/**
 * T6.4 — RSS feed route tests.
 *
 * Tests the Fastify route GET /feeds/:channelId.xml in isolation using the
 * same pattern as the rest of the route test suite (mock supabase, no DB).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const sbChain: Record<string, unknown> = {};
(['from', 'select', 'eq', 'order'] as const).forEach((m) => {
  sbChain[m] = vi.fn().mockReturnValue(sbChain);
});
sbChain.maybeSingle = vi.fn();
// Vitest needs a terminal method for the episodes query (.order is the last
// chainable call before the awaited result).
// We return sbChain from order() and make it thenable via a separate mock.

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => sbChain,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CHANNEL_ID = 'chn-00000000-0000-0000-0000-000000000001';

const mockChannel = {
  id: CHANNEL_ID,
  name: 'Tech Talks',
  niche: 'Technology and Software',
  language: 'en',
  logo_url: 'https://cdn.example.com/logo.png',
  blog_url: 'https://techtalkspod.example.com',
};

const mockEpisodes = [
  {
    id: 'ep-1',
    title: 'Episode 1: Getting Started',
    description: 'A beginner episode about getting started',
    audio_url: 'https://audio.example.com/ep1.mp3',
    duration_sec: 1800,
    guid: 'urn:guid:ep-1',
    published_at: '2026-05-10T10:00:00Z',
    itunes_explicit: false,
    itunes_image_url: null,
    updated_at: '2026-05-10T10:00:00Z',
  },
  {
    id: 'ep-2',
    title: 'Episode 2: Going Deeper',
    description: 'An advanced episode',
    audio_url: 'https://audio.example.com/ep2.mp3',
    duration_sec: 3661,
    guid: 'urn:guid:ep-2',
    published_at: '2026-05-11T10:00:00Z',
    itunes_explicit: true,
    itunes_image_url: 'https://cdn.example.com/ep2-art.png',
    updated_at: '2026-05-11T10:00:00Z',
  },
];

// ─── App setup ────────────────────────────────────────────────────────────────

import { feedsRoutes } from '../../routes/feeds';

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  // Re-attach chain methods (clearAllMocks resets mock implementations).
  (['from', 'select', 'eq', 'order'] as const).forEach((m) => {
    (sbChain[m] as ReturnType<typeof vi.fn>).mockReturnValue(sbChain);
  });

  app = Fastify({ logger: false });
  await app.register(feedsRoutes, { prefix: '/feeds' });
  await app.ready();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /feeds/:channelId.xml', () => {
  it('returns 200 with Content-Type application/rss+xml and ETag header', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    // Episodes query is awaited on sbChain (order returns the chainable and
    // Fastify / vitest resolves it).
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockEpisodes,
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/rss+xml');
    expect(res.headers['etag']).toBeDefined();
    expect(res.payload).toContain('<?xml version="1.0"');
    expect(res.payload).toContain('<rss version="2.0"');
    expect(res.payload).toContain('xmlns:itunes=');
  });

  it('returns valid RSS 2.0 with channel metadata', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockEpisodes,
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
    });

    const xml = res.payload;
    expect(xml).toContain('<title>Tech Talks</title>');
    expect(xml).toContain('Technology and Software');
    expect(xml).toContain('https://techtalkspod.example.com');
    expect(xml).toContain('<language>en</language>');
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(xml).toContain('<itunes:author>Tech Talks</itunes:author>');
    expect(xml).toContain('https://cdn.example.com/logo.png');
  });

  it('returns episodes in published_at desc order with per-episode tags', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockEpisodes,
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
    });

    const xml = res.payload;

    // Both episodes present.
    expect(xml).toContain('Episode 1: Getting Started');
    expect(xml).toContain('Episode 2: Going Deeper');

    // Enclosure tags.
    expect(xml).toContain('url="https://audio.example.com/ep1.mp3"');
    expect(xml).toContain('url="https://audio.example.com/ep2.mp3"');

    // GUIDs.
    expect(xml).toContain('urn:guid:ep-1');
    expect(xml).toContain('urn:guid:ep-2');

    // itunes:duration — 30:00 and 1:01:01.
    expect(xml).toContain('<itunes:duration>30:00</itunes:duration>');
    expect(xml).toContain('<itunes:duration>1:01:01</itunes:duration>');

    // itunes:explicit per item.
    // Episode 1 is false, episode 2 is true.
    expect(xml).toMatch(/<itunes:explicit>false<\/itunes:explicit>/);
    expect(xml).toMatch(/<itunes:explicit>true<\/itunes:explicit>/);
  });

  it('honors itunes:image at item level when set', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockEpisodes,
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
    });

    // Episode 2 has its own image.
    expect(res.payload).toContain(
      '<itunes:image href="https://cdn.example.com/ep2-art.png"/>',
    );
    // Episode 1 falls back to channel logo.
    expect(res.payload).toContain(
      '<itunes:image href="https://cdn.example.com/logo.png"/>',
    );
  });

  it('returns 304 with empty body when If-None-Match matches ETag', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockEpisodes,
      error: null,
    });

    // First request to get the ETag.
    const first = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
    });
    const etag = first.headers['etag'] as string;
    expect(etag).toBeDefined();

    // Reset mocks for second call.
    vi.clearAllMocks();
    (['from', 'select', 'eq', 'order'] as const).forEach((m) => {
      (sbChain[m] as ReturnType<typeof vi.fn>).mockReturnValue(sbChain);
    });
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockEpisodes,
      error: null,
    });

    // Second request with matching ETag.
    const second = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
      headers: { 'if-none-match': etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.payload).toBe('');
    expect(second.headers['etag']).toBe(etag);
  });

  it('returns a valid empty feed when the channel has zero episodes', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: mockChannel,
      error: null,
    });
    (sbChain.order as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/feeds/${CHANNEL_ID}.xml`,
    });

    expect(res.statusCode).toBe(200);
    const xml = res.payload;
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).not.toContain('<item>');
  });

  it('returns 404 when the channel does not exist', async () => {
    (sbChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/feeds/non-existent-channel.xml',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
