import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Chainable supabase mock
const mockChain: Record<string, any> = {};
[
  'from', 'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'in', 'ilike', 'or', 'overlaps', 'filter',
  'order', 'limit', 'range',
].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.single = vi.fn();
mockChain.maybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockChain,
}));
vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
      });
    }
    const userId = request.headers['x-user-id'];
    request.userId = typeof userId === 'string' ? userId : undefined;
  }),
}));
vi.mock('@/lib/api/fastify-errors', () => ({
  sendError: vi.fn(async (reply: any, error: any) => {
    if (error && error.statusCode) {
      return reply.status(error.statusCode).send({
        data: null,
        error: { message: error.message, code: error.code },
      });
    }
    if (error && error.name === 'ZodError') {
      return reply.status(400).send({
        data: null,
        error: { message: 'Validation error', code: 'VALIDATION_ERROR' },
      });
    }
    return reply.status(500).send({
      data: null,
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    });
  }),
}));
vi.mock('@/lib/api/errors', () => ({
  ApiError: class ApiError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, message: string, code: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));
vi.mock('@/lib/utils', () => ({
  markdownToHtml: vi.fn((md: string) => `<p>${md}</p>`),
}));
vi.mock('@/lib/exporters/podcastExporter', () => ({
  generatePodcastMarkdownExport: vi.fn(
    (podcast: any) => `# Podcast Episode: ${podcast.episode_title}\n\nduration: TBD`,
  ),
  generatePodcastHtmlExport: vi.fn(
    (podcast: any) =>
      `<!DOCTYPE html><html><head><title>${podcast.episode_title}</title></head><body></body></html>`,
  ),
}));
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { podcastsRoutes } from '../../routes/podcasts';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

const mockTalkingPoints = [
  { point: 'First point', notes: 'Some notes here' },
  { point: 'Second point', notes: 'More notes here' },
];

const mockPodcast = {
  id: 'p-1',
  episode_title: 'Test Podcast Episode',
  episode_description: 'A great podcast about testing',
  intro_hook: 'Welcome to this episode',
  talking_points_json: JSON.stringify(mockTalkingPoints),
  personal_angle: 'My personal take on this',
  guest_questions: ['Question one?', 'Question two?'],
  outro: 'Thanks for listening',
  duration_estimate: '45:00',
  word_count: 200,
  status: 'draft',
  project_id: null,
  idea_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: mockPodcast, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockPodcast, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockPodcast],
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'count', {
    value: 1,
    writable: true,
    configurable: true,
  });
  app = Fastify({ logger: false });
  await app.register(podcastsRoutes, { prefix: '/podcasts' });
  await app.ready();
});

describe('GET /podcasts', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/podcasts' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 3, data: null, error: null });
      } else {
        resolve({ data: [mockPodcast], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({ method: 'GET', url: '/podcasts', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.podcasts).toBeDefined();
    expect(body.data.pagination).toBeDefined();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('filters by user_id when X-User-Id header is present', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 1, data: null, error: null });
      } else {
        resolve({ data: [mockPodcast], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({ method: 'GET', url: '/podcasts', headers: AUTH_USER });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });

  it('returns 400 for invalid query params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/podcasts?status=invalid_status',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /podcasts', () => {
  const validBody = {
    episode_title: 'My New Podcast',
    episode_description: 'A podcast about something interesting',
    intro_hook: 'Welcome to the show',
    talking_points: mockTalkingPoints,
    personal_angle: 'My personal perspective',
    outro: 'Thanks for listening everyone',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/podcasts', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates podcast and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.podcast).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH_USER,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123' }),
    );
  });

  it('inserts null user_id when X-User-Id header is absent', async () => {
    await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null }),
    );
  });

  it('returns 400 for invalid body (missing required fields)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH,
      payload: { episode_title: 'Only title' }, // missing required fields
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores talking_points_json as stringified JSON', async () => {
    await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ talking_points_json: JSON.stringify(mockTalkingPoints) }),
    );
  });

  it('calculates word count when not provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH,
      payload: validBody,
    });
    // word_count should be calculated (not 0 since fields have content)
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ word_count: expect.any(Number) }),
    );
  });

  it('uses provided word_count when given', async () => {
    await app.inject({
      method: 'POST',
      url: '/podcasts',
      headers: AUTH,
      payload: { ...validBody, word_count: 999 },
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ word_count: 999 }),
    );
  });
});

describe('GET /podcasts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/podcasts/p-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with PodcastOutput transform', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockPodcast, error: null });

    const res = await app.inject({ method: 'GET', url: '/podcasts/p-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.podcast).toBeDefined();
    expect(body.data.podcast.id).toBe('p-1');
    expect(body.data.podcast.episode_title).toBe('Test Podcast Episode');
    expect(body.data.podcast.talking_points).toBeDefined();
    expect(Array.isArray(body.data.podcast.talking_points)).toBe(true);
    expect(body.data.podcast.intro_hook).toBe('Welcome to this episode');
    expect(body.error).toBeNull();
  });

  it('returns 404 when podcast not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({ method: 'GET', url: '/podcasts/nonexistent', headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('parses talking_points_json correctly', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockPodcast, error: null });

    const res = await app.inject({ method: 'GET', url: '/podcasts/p-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.podcast.talking_points).toEqual(mockTalkingPoints);
  });
});

describe('PUT /podcasts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/podcasts/p-1',
      payload: { episode_title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when podcast not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/podcasts/nonexistent',
      headers: AUTH,
      payload: { episode_title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('updates podcast and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockPodcast, episode_title: 'Updated Title' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/podcasts/p-1',
      headers: AUTH,
      payload: { episode_title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.podcast).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('stores talking_points as talking_points_json when updating', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockPodcast, error: null });

    await app.inject({
      method: 'PUT',
      url: '/podcasts/p-1',
      headers: AUTH,
      payload: { talking_points: mockTalkingPoints },
    });
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ talking_points_json: JSON.stringify(mockTalkingPoints) }),
    );
  });
});

describe('PATCH /podcasts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/podcasts/p-1',
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when podcast not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: '/podcasts/nonexistent',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates podcast status and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockPodcast, status: 'review' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/podcasts/p-1',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.podcast).toBeDefined();
    expect(body.error).toBeNull();
  });
});

describe('DELETE /podcasts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/podcasts/p-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when podcast not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/podcasts/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('deletes podcast and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'p-1' }, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({ method: 'DELETE', url: '/podcasts/p-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();

    mockChain.delete = origDelete;
  });
});

describe('GET /podcasts/:id/export', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/podcasts/p-1/export' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when podcast not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/podcasts/nonexistent/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('exports markdown by default', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockPodcast, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/podcasts/p-1/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('.md');
    expect(res.payload).toContain('# Podcast Episode:');
  });

  it('exports markdown when format=markdown', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockPodcast, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/podcasts/p-1/export?format=markdown',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('.md');
  });

  it('exports HTML when format=html', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockPodcast, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/podcasts/p-1/export?format=html',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('.html');
    expect(res.payload).toContain('<!DOCTYPE html>');
    expect(res.payload).toContain('<title>Test Podcast Episode</title>');
  });

  it('exports JSON when format=json', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockPodcast, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/podcasts/p-1/export?format=json',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('.json');
    const body = res.json();
    expect(body.id).toBe('p-1');
    expect(body.episode_title).toBe('Test Podcast Episode');
    expect(body.status).toBe('draft');
  });
});
