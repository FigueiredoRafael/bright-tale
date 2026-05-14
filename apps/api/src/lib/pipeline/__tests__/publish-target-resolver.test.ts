/**
 * Unit tests for publish-target-resolver.
 *
 * Supabase is mocked at the module level; no real DB connection is needed.
 *
 * Refs #32
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublishTarget } from '../publish-target-resolver.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTarget(
  overrides: Partial<PublishTarget> = {},
): PublishTarget {
  return {
    id: 'target-1',
    channel_id: 'ch-1',
    org_id: null,
    type: 'wordpress',
    display_name: 'My WordPress',
    credentials_encrypted: null,
    config_json: null,
    is_active: true,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    ...overrides,
  };
}

// ─── Supabase mock ───────────────────────────────────────────────────────────

type QueryResult = { data: PublishTarget[] | null; error: { message: string } | null };

// Mutable slot that each test populates before calling resolvePublishTargets.
let mockQueryResult: QueryResult = { data: [], error: null };

// Track what filters were applied so assertions can inspect them.
let capturedFilters: Record<string, unknown> = {};

const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  // Terminal method — returns the pre-configured result.
  then: undefined as unknown,
};

// Make the builder thenable (so `await query` works without `.then` override).
// We intercept the final `await` via a Proxy that returns the Promise when
// `.then` is accessed.
function makeBuilder() {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      capturedFilters[col] = val;
      return builder;
    }),
    in: vi.fn((col: string, vals: unknown[]) => {
      capturedFilters[`${col}:in`] = vals;
      return builder;
    }),
    or: vi.fn((filter: string) => {
      capturedFilters['or'] = filter;
      return builder;
    }),
  };

  // Make the builder await-able by adding a then() that returns the mock result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (builder as any).then = (
    resolve?: ((v: QueryResult) => unknown) | null,
    _reject?: ((e: unknown) => unknown) | null,
  ) => Promise.resolve(mockQueryResult).then(resolve ?? undefined);

  return builder;
}

vi.mock('../../supabase/index.js', () => ({
  createServiceClient: () => ({
    from(_table: string) {
      capturedFilters = {};
      return makeBuilder();
    },
  }),
}));

// ─── Import SUT after mocks are set up ───────────────────────────────────────

import {
  resolvePublishTargets,
  MEDIUM_TO_TARGET_TYPES,
} from '../publish-target-resolver.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQueryResult = { data: [], error: null };
  capturedFilters = {};
});

describe('MEDIUM_TO_TARGET_TYPES', () => {
  it('maps blog to wordpress only', () => {
    expect(MEDIUM_TO_TARGET_TYPES.blog).toEqual(['wordpress']);
  });

  it('maps video to youtube only', () => {
    expect(MEDIUM_TO_TARGET_TYPES.video).toEqual(['youtube']);
  });

  it('maps shorts to youtube only', () => {
    expect(MEDIUM_TO_TARGET_TYPES.shorts).toEqual(['youtube']);
  });

  it('maps podcast to spotify, apple_podcasts, youtube, rss', () => {
    expect(MEDIUM_TO_TARGET_TYPES.podcast).toEqual([
      'spotify',
      'apple_podcasts',
      'youtube',
      'rss',
    ]);
  });
});

describe('resolvePublishTargets — channel-only (no org)', () => {
  it('returns channel-scoped targets when org is null', async () => {
    const target = makeTarget({ id: 'target-wp', type: 'wordpress' });
    mockQueryResult = { data: [target], error: null };

    const results = await resolvePublishTargets('ch-1', null, 'blog');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('target-wp');
  });

  it('filters by channel_id (eq) when org is null', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-abc', null, 'blog');

    // When orgId is null the resolver uses .eq('channel_id', channelId)
    expect(capturedFilters['channel_id']).toBe('ch-abc');
    expect(capturedFilters['or']).toBeUndefined();
  });

  it('always filters is_active = true', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'blog');

    expect(capturedFilters['is_active']).toBe(true);
  });
});

describe('resolvePublishTargets — org fallback', () => {
  it('uses OR filter when orgId is provided', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', 'org-1', 'blog');

    expect(capturedFilters['or']).toBeDefined();
    const orFilter = capturedFilters['or'] as string;
    expect(orFilter).toContain('ch-1');
    expect(orFilter).toContain('org-1');
  });

  it('returns org-scoped target when no channel target exists', async () => {
    const orgTarget = makeTarget({
      id: 'target-org',
      channel_id: null,
      org_id: 'org-1',
      type: 'wordpress',
    });
    mockQueryResult = { data: [orgTarget], error: null };

    const results = await resolvePublishTargets('ch-1', 'org-1', 'blog');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('target-org');
    expect(results[0].org_id).toBe('org-1');
    expect(results[0].channel_id).toBeNull();
  });

  it('returns both channel and org targets when both exist', async () => {
    const chTarget = makeTarget({ id: 'ch-target', channel_id: 'ch-1', type: 'wordpress' });
    const orgTarget = makeTarget({
      id: 'org-target',
      channel_id: null,
      org_id: 'org-1',
      type: 'wordpress',
    });
    mockQueryResult = { data: [chTarget, orgTarget], error: null };

    const results = await resolvePublishTargets('ch-1', 'org-1', 'blog');

    expect(results).toHaveLength(2);
  });
});

describe('resolvePublishTargets — medium-type filtering', () => {
  it('passes [wordpress] as type filter for blog', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'blog');

    expect(capturedFilters['type:in']).toEqual(['wordpress']);
  });

  it('passes [youtube] as type filter for video', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'video');

    expect(capturedFilters['type:in']).toEqual(['youtube']);
  });

  it('passes [youtube] as type filter for shorts', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'shorts');

    expect(capturedFilters['type:in']).toEqual(['youtube']);
  });

  it('passes [spotify, apple_podcasts, youtube, rss] as type filter for podcast', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'podcast');

    expect(capturedFilters['type:in']).toEqual([
      'spotify',
      'apple_podcasts',
      'youtube',
      'rss',
    ]);
  });

  it('does not return a youtube target for a blog medium', async () => {
    // The mock returns whatever we put in mockQueryResult, so the type
    // filtering is done by the DB (mocked via the .in() assertion).
    // We verify the .in() call carries the right types.
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'blog');

    // Should NOT include youtube, spotify, etc.
    const types = capturedFilters['type:in'] as string[];
    expect(types).not.toContain('youtube');
    expect(types).not.toContain('spotify');
  });
});

describe('resolvePublishTargets — is_active exclusion', () => {
  it('always sets is_active filter to true', async () => {
    mockQueryResult = { data: [], error: null };

    await resolvePublishTargets('ch-1', null, 'blog');

    expect(capturedFilters['is_active']).toBe(true);
  });

  it('returns empty array when no active targets match', async () => {
    mockQueryResult = { data: [], error: null };

    const results = await resolvePublishTargets('ch-1', null, 'blog');

    expect(results).toEqual([]);
  });
});

describe('resolvePublishTargets — empty results', () => {
  it('returns empty array when data is null', async () => {
    mockQueryResult = { data: null, error: null };

    const results = await resolvePublishTargets('ch-1', null, 'blog');

    expect(results).toEqual([]);
  });

  it('returns empty array when no targets match', async () => {
    mockQueryResult = { data: [], error: null };

    const results = await resolvePublishTargets('ch-99', 'org-99', 'video');

    expect(results).toEqual([]);
  });
});

describe('resolvePublishTargets — error handling', () => {
  it('throws when Supabase returns an error', async () => {
    mockQueryResult = { data: null, error: { message: 'connection refused' } };

    await expect(
      resolvePublishTargets('ch-1', null, 'blog'),
    ).rejects.toThrow('resolvePublishTargets: connection refused');
  });
});
