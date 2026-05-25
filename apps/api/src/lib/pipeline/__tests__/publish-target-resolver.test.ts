import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIUM_TO_TARGET_TYPES,
  resolvePublishTargets,
} from '../publish-target-resolver';

interface TargetRow {
  id: string;
  channel_id: string | null;
  org_id: string | null;
  type: string;
  display_name: string;
  config_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function row(overrides: Partial<TargetRow> = {}): TargetRow {
  return {
    id: 'pt-' + Math.random().toString(36).slice(2, 8),
    channel_id: null,
    org_id: null,
    type: 'wordpress',
    display_name: 'WP Blog',
    config_json: null,
    is_active: true,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    ...overrides,
  };
}

interface MockSb {
  __seed: TargetRow[];
  from: ReturnType<typeof vi.fn>;
}

function makeSb(seed: TargetRow[]): MockSb {
  // The chain: from('publish_targets').select(cols).or(scope).eq('is_active', true).in('type', types)
  // The mock matches the resolver's exact filter chain and returns rows the in-memory
  // predicates accept.
  const sb: MockSb = {
    __seed: seed,
    from: vi.fn(),
  };

  sb.from.mockImplementation((table: string) => {
    if (table !== 'publish_targets') throw new Error(`Unexpected table: ${table}`);
    const state = {
      scope: null as { channelId: string | null; orgId: string | null } | null,
      isActive: null as boolean | null,
      typeIn: null as string[] | null,
    };
    const chain = {
      select: vi.fn(() => chain),
      or: vi.fn((filter: string) => {
        // Parse `channel_id.eq.<id>` or
        // `channel_id.eq.<id>,and(org_id.eq.<oid>,channel_id.is.null)`
        const channelMatch = /channel_id\.eq\.([^,]+)/.exec(filter);
        const orgMatch = /org_id\.eq\.([^,)]+)/.exec(filter);
        state.scope = {
          channelId: channelMatch?.[1] ?? null,
          orgId: orgMatch?.[1] ?? null,
        };
        return chain;
      }),
      eq: vi.fn((col: string, val: boolean) => {
        if (col === 'is_active') state.isActive = val;
        return chain;
      }),
      in: vi.fn((col: string, vals: string[]) => {
        if (col === 'type') state.typeIn = vals;
        return chain;
      }),
      then: (resolve: (v: { data: TargetRow[]; error: null }) => unknown) => {
        const data = sb.__seed.filter((r) => {
          // Scope: channel match OR (org match AND channel_id null)
          if (!state.scope) return false;
          const channelHit = state.scope.channelId && r.channel_id === state.scope.channelId;
          const orgHit =
            state.scope.orgId && r.org_id === state.scope.orgId && r.channel_id === null;
          if (!channelHit && !orgHit) return false;
          if (state.isActive !== null && r.is_active !== state.isActive) return false;
          if (state.typeIn && !state.typeIn.includes(r.type)) return false;
          return true;
        });
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return chain;
  });

  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MEDIUM_TO_TARGET_TYPES', () => {
  it('maps each medium to its compatible publish_targets.type list', () => {
    expect(MEDIUM_TO_TARGET_TYPES.blog).toEqual(['wordpress']);
    expect(MEDIUM_TO_TARGET_TYPES.video).toEqual(['youtube']);
    expect(MEDIUM_TO_TARGET_TYPES.shorts).toEqual(['youtube']);
    expect(MEDIUM_TO_TARGET_TYPES.podcast).toEqual([
      'spotify',
      'apple_podcasts',
      'youtube',
      'rss',
    ]);
  });
});

describe('resolvePublishTargets', () => {
  describe('channel scope', () => {
    it('returns only channel-attached targets when org id is null', async () => {
      const sb = makeSb([
        row({ id: 'pt-1', channel_id: 'ch-1', type: 'wordpress' }),
        row({ id: 'pt-2', channel_id: 'ch-OTHER', type: 'wordpress' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'blog');
      expect(targets.map((t) => t.id)).toEqual(['pt-1']);
    });
  });

  describe('org fallback', () => {
    it('returns org targets (channel_id null) when channel itself has no target of that type', async () => {
      const sb = makeSb([
        row({ id: 'pt-org', org_id: 'org-1', channel_id: null, type: 'wordpress' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', 'org-1', 'blog');
      expect(targets.map((t) => t.id)).toEqual(['pt-org']);
    });

    it('returns BOTH channel + org targets when both exist (caller chooses)', async () => {
      const sb = makeSb([
        row({ id: 'pt-channel', channel_id: 'ch-1', type: 'wordpress' }),
        row({ id: 'pt-org', org_id: 'org-1', channel_id: null, type: 'wordpress' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', 'org-1', 'blog');
      expect(targets.map((t) => t.id).sort()).toEqual(['pt-channel', 'pt-org']);
    });
  });

  describe('medium filtering', () => {
    it('medium=blog → only wordpress', async () => {
      const sb = makeSb([
        row({ channel_id: 'ch-1', type: 'wordpress' }),
        row({ channel_id: 'ch-1', type: 'youtube' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'blog');
      expect(targets.map((t) => t.type)).toEqual(['wordpress']);
    });

    it('medium=video → only youtube', async () => {
      const sb = makeSb([
        row({ channel_id: 'ch-1', type: 'wordpress' }),
        row({ channel_id: 'ch-1', type: 'youtube' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'video');
      expect(targets.map((t) => t.type)).toEqual(['youtube']);
    });

    it('medium=shorts → only youtube (same compatible types as video)', async () => {
      const sb = makeSb([
        row({ channel_id: 'ch-1', type: 'youtube' }),
        row({ channel_id: 'ch-1', type: 'wordpress' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'shorts');
      expect(targets.map((t) => t.type)).toEqual(['youtube']);
    });

    it('medium=podcast → spotify, apple_podcasts, youtube, rss', async () => {
      const sb = makeSb([
        row({ channel_id: 'ch-1', type: 'spotify' }),
        row({ channel_id: 'ch-1', type: 'apple_podcasts' }),
        row({ channel_id: 'ch-1', type: 'youtube' }),
        row({ channel_id: 'ch-1', type: 'rss' }),
        row({ channel_id: 'ch-1', type: 'wordpress' }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'podcast');
      expect(targets.map((t) => t.type).sort()).toEqual(
        ['apple_podcasts', 'rss', 'spotify', 'youtube'],
      );
    });
  });

  describe('is_active filtering', () => {
    it('excludes inactive targets', async () => {
      const sb = makeSb([
        row({ id: 'pt-active', channel_id: 'ch-1', is_active: true }),
        row({ id: 'pt-inactive', channel_id: 'ch-1', is_active: false }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'blog');
      expect(targets.map((t) => t.id)).toEqual(['pt-active']);
    });
  });

  describe('empty results', () => {
    it('returns [] when nothing matches', async () => {
      const sb = makeSb([]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'blog');
      expect(targets).toEqual([]);
    });

    it('returns [] when only mismatched-type targets exist', async () => {
      const sb = makeSb([
        row({ channel_id: 'ch-1', type: 'youtube' /* but asked for blog */ }),
      ]);
      const targets = await resolvePublishTargets(sb, 'ch-1', null, 'blog');
      expect(targets).toEqual([]);
    });
  });

  describe('row mapping', () => {
    it('maps snake_case columns to camelCase fields', async () => {
      const sb = makeSb([
        row({
          id: 'pt-1',
          channel_id: 'ch-1',
          org_id: null,
          type: 'wordpress',
          display_name: 'Main WP',
          config_json: { site_url: 'https://example.com' },
          is_active: true,
          created_at: '2026-05-14T00:00:00Z',
          updated_at: '2026-05-14T01:00:00Z',
        }),
      ]);
      const [target] = await resolvePublishTargets(sb, 'ch-1', null, 'blog');
      expect(target).toEqual({
        id: 'pt-1',
        channelId: 'ch-1',
        orgId: null,
        type: 'wordpress',
        displayName: 'Main WP',
        configJson: { site_url: 'https://example.com' },
        isActive: true,
        createdAt: '2026-05-14T00:00:00Z',
        updatedAt: '2026-05-14T01:00:00Z',
      });
    });
  });

  describe('error handling', () => {
    it('throws when the supabase query returns an error', async () => {
      const sb = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } })),
        })),
      };
      await expect(
        resolvePublishTargets(sb, 'ch-1', null, 'blog'),
      ).rejects.toThrow(/boom/);
    });
  });
});
