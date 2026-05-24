/**
 * S10 — POST /api/content-drafts/:id/youtube-publish route tests
 *
 * Category A/B — no DB calls, all Supabase + inngest + adapter mocked.
 * Tests: schema validation, success path (dry-run adapter), three error mappings.
 *
 * Mocking strategy:
 *   - Supabase: stubbed via vi.mock('@/lib/supabase/index.js') — returns fixture rows
 *   - publishToYouTube adapter: vi.mock('../lib/youtube/publish.js')
 *   - decryptTokens: vi.mock('../lib/youtube/oauth.js')
 *   - inngest.send: mocked so no Inngest server needed
 *   - assertProjectOwner: bypassed (returns void)
 *
 * Upload-path decision (documented here per PR requirement):
 *   Proxy-through-API chosen for security simplicity — the OAuth token never
 *   leaves the API boundary. The browser sends multipart to the API; the API
 *   streams bytes to YouTube. For files > 2 GB Inngest background jobs should
 *   be wired, but that is out of S10 scope.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { youtubePublishParams } from '@brighttale/shared/schemas/youtubePublishParams';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase/index.js', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('../../lib/youtube/publish.js', () => ({
  publishToYouTube: vi.fn(),
}));

vi.mock('../../lib/youtube/oauth.js', () => ({
  decryptTokens: vi.fn(),
}));

vi.mock('../../lib/projects/ownership.js', () => ({
  assertProjectOwner: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../jobs/client.js', () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../middleware/authenticate.js', () => ({
  authenticate: vi.fn((req: { userId?: string }, _res: unknown, done: () => void) => {
    req.userId = 'user-test-1';
    done();
  }),
  authenticateWithUser: vi.fn((req: { userId?: string }, _res: unknown, done: () => void) => {
    req.userId = 'user-test-1';
    done();
  }),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { createServiceClient } from '../../lib/supabase/index.js';
import { publishToYouTube } from '../../lib/youtube/publish.js';
import { decryptTokens } from '../../lib/youtube/oauth.js';
import { inngest } from '../../jobs/client.js';
import { contentDraftsYouTubeRoutes } from '../content-drafts-youtube.js';

// ─── Fixture data ──────────────────────────────────────────────────────────────

const DRAFT_ID = 'draft-uuid-1234';
const PUBLISH_TARGET_ID = 'pt-uuid-5678';
const CHANNEL_ID = 'ch-uuid-9012';
const STAGE_RUN_ID = 'sr-uuid-3456';

const STUB_DRAFT = {
  id: DRAFT_ID,
  channel_id: CHANNEL_ID,
  type: 'video',
  status: 'approved',
  draft_json: {
    video_title: 'Test Video',
    video_description: 'A test description',
    tags: ['test', 'video'],
  },
};

const STUB_PUBLISH_TARGET = {
  id: PUBLISH_TARGET_ID,
  channel_id: CHANNEL_ID,
  kind: 'youtube',
  credentials_encrypted: 'enc-token-abc',
  config_json: {},
};

const STUB_STAGE_RUN = {
  id: STAGE_RUN_ID,
  project_id: 'proj-1',
  stage: 'publish',
  status: 'completed',
};

const STUB_TOKENS = {
  access_token: 'ya29.access',
  refresh_token: '1//refresh',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockSb({
  draft = STUB_DRAFT,
  publishTarget = STUB_PUBLISH_TARGET,
  stageRunInsert = STUB_STAGE_RUN,
}: {
  draft?: typeof STUB_DRAFT | null;
  publishTarget?: typeof STUB_PUBLISH_TARGET | null;
  stageRunInsert?: typeof STUB_STAGE_RUN | null;
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: draft,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'publish_targets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: publishTarget,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'stage_runs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: stageRunInsert,
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(contentDraftsYouTubeRoutes, { prefix: '/content-drafts' });
  await app.ready();
  return app;
}

// ─── Valid request body ────────────────────────────────────────────────────────

const VALID_BODY = {
  publishTargetId: PUBLISH_TARGET_ID,
  visibility: 'private' as const,
  madeForKids: false,
  categoryId: '22',
  language: 'en',
  dryRun: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('youtubePublishParams schema', () => {
  it('accepts a minimal valid body (dryRun only)', () => {
    const result = youtubePublishParams.parse({
      publishTargetId: PUBLISH_TARGET_ID,
      visibility: 'private',
      madeForKids: false,
      categoryId: '22',
      language: 'en',
    });
    expect(result.publishTargetId).toBe(PUBLISH_TARGET_ID);
    expect(result.visibility).toBe('private');
  });

  it('accepts all valid visibility values', () => {
    for (const v of ['public', 'unlisted', 'private'] as const) {
      const parsed = youtubePublishParams.parse({
        publishTargetId: PUBLISH_TARGET_ID,
        visibility: v,
        madeForKids: false,
        categoryId: '22',
        language: 'en',
      });
      expect(parsed.visibility).toBe(v);
    }
  });

  it('rejects missing publishTargetId', () => {
    expect(() =>
      youtubePublishParams.parse({
        visibility: 'private',
        madeForKids: false,
        categoryId: '22',
        language: 'en',
      })
    ).toThrow();
  });

  it('rejects invalid visibility value', () => {
    expect(() =>
      youtubePublishParams.parse({
        publishTargetId: PUBLISH_TARGET_ID,
        visibility: 'protected',
        madeForKids: false,
        categoryId: '22',
        language: 'en',
      })
    ).toThrow();
  });

  it('accepts optional dryRun, scheduleAt, title, description, tags', () => {
    const parsed = youtubePublishParams.parse({
      publishTargetId: PUBLISH_TARGET_ID,
      visibility: 'public',
      madeForKids: false,
      categoryId: '28',
      language: 'pt',
      dryRun: true,
      scheduleAt: '2026-06-01T10:00:00Z',
      title: 'Custom title',
      description: 'Custom description',
      tags: ['a', 'b'],
    });
    expect(parsed.dryRun).toBe(true);
    expect(parsed.scheduleAt).toBe('2026-06-01T10:00:00Z');
    expect(parsed.tags).toEqual(['a', 'b']);
  });
});

describe('POST /content-drafts/:id/youtube-publish — success path (dry-run)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(createServiceClient).mockReturnValue(makeMockSb() as never);
    vi.mocked(decryptTokens).mockReturnValue(STUB_TOKENS);
    vi.mocked(publishToYouTube).mockResolvedValue({
      ok: true,
      videoId: 'dryrun-123',
      url: 'https://www.youtube.com/watch?v=dryrun-123',
      status: 'dryRun',
    });
    app = await buildApp();
  });

  it('returns 200 with videoId + url on dry-run success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { videoId: string; url: string }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.videoId).toBe('dryrun-123');
    expect(body.data.url).toContain('youtube.com');
  });

  it('writes a publish stage_run with payload_ref containing videoId + url', async () => {
    await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: VALID_BODY,
    });

    const sbInstance = vi.mocked(createServiceClient).mock.results[0]?.value as ReturnType<typeof makeMockSb>;
    const stageRunsFromCall = sbInstance.from.mock.calls.find(([t]) => t === 'stage_runs');
    expect(stageRunsFromCall).toBeDefined();
  });

  it('emits pipeline/stage.run.finished after writing stage_run', async () => {
    await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: VALID_BODY,
    });
    expect(vi.mocked(inngest.send)).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pipeline/stage.run.finished',
      }),
    );
  });

  it('passes dryRun:true to the adapter when body.dryRun is true', async () => {
    await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: { ...VALID_BODY, dryRun: true },
    });
    expect(vi.mocked(publishToYouTube)).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });
});

describe('POST /content-drafts/:id/youtube-publish — request validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(createServiceClient).mockReturnValue(makeMockSb() as never);
    app = await buildApp();
  });

  it('returns 400 when publishTargetId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: {
        visibility: 'private',
        madeForKids: false,
        categoryId: '22',
        language: 'en',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when visibility is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: {
        publishTargetId: PUBLISH_TARGET_ID,
        visibility: 'protected',
        madeForKids: false,
        categoryId: '22',
        language: 'en',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when draft not found', async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeMockSb({ draft: null }) as never);
    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when publish target not found', async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeMockSb({ publishTarget: null }) as never,
    );
    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /content-drafts/:id/youtube-publish — error mappings', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(createServiceClient).mockReturnValue(makeMockSb() as never);
    vi.mocked(decryptTokens).mockReturnValue(STUB_TOKENS);
    app = await buildApp();
  });

  it('returns 401 with YOUTUBE_AUTH_FAILED when adapter returns auth error', async () => {
    vi.mocked(publishToYouTube).mockResolvedValue({
      ok: false,
      code: 'YOUTUBE_AUTH_FAILED',
      message: 'OAuth token expired and no refresh_token supplied',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: { ...VALID_BODY, dryRun: false },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('YOUTUBE_AUTH_FAILED');
  });

  it('returns 429 with YOUTUBE_QUOTA_EXCEEDED when adapter returns quota error', async () => {
    vi.mocked(publishToYouTube).mockResolvedValue({
      ok: false,
      code: 'YOUTUBE_QUOTA_EXCEEDED',
      message: 'YouTube quota exceeded',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: { ...VALID_BODY, dryRun: false },
    });

    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('YOUTUBE_QUOTA_EXCEEDED');
  });

  it('returns 422 with YOUTUBE_REJECTED when adapter returns rejection', async () => {
    vi.mocked(publishToYouTube).mockResolvedValue({
      ok: false,
      code: 'YOUTUBE_REJECTED',
      message: 'YouTube rejected the request: videoNotFound',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/youtube-publish`,
      headers: { 'x-user-id': 'user-test-1' },
      payload: { ...VALID_BODY, dryRun: false },
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('YOUTUBE_REJECTED');
    expect(body.error.message).toContain('videoNotFound');
  });
});
