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
vi.mock('@/lib/exporters/videoExporter', () => ({
  generateVideoMarkdownExport: vi.fn((video: any, title: string) => `# Video Script: ${title}\n\ntotal_duration: TBD`),
  generateVideoHtmlExport: vi.fn((video: any, title: string) => `<!DOCTYPE html><html><head><title>${title}</title></head><body></body></html>`),
  generateTeleprompterExport: vi.fn((video: any, title: string) => `${title}\nTELEPROMPTER SCRIPT`),
}));
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { videosRoutes } from '../../routes/videos';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

const mockScript = {
  hook: { duration: '0:30', content: 'Hook content', visual_notes: 'Visual hook' },
  problem: { duration: '0:45', content: 'Problem content', visual_notes: 'Visual problem' },
  teaser: { duration: '0:20', content: 'Teaser content', visual_notes: 'Visual teaser' },
  chapters: [
    {
      chapter_number: 1,
      title: 'Chapter One',
      duration: '3:00',
      content: 'Chapter content',
      b_roll_suggestions: ['Shot A', 'Shot B'],
      key_stat_or_quote: 'Key stat here',
    },
  ],
};

const mockVideo = {
  id: 'v-1',
  title: 'Test Video Title',
  title_options: ['Test Video Title', 'Alternative Title'],
  thumbnail_json: JSON.stringify({
    visual_concept: 'Bright background',
    text_overlay: 'Watch This',
    emotion: 'curiosity',
    why_it_works: 'Grabs attention',
  }),
  script_json: JSON.stringify(mockScript),
  total_duration_estimate: '10:00',
  word_count: 150,
  status: 'draft',
  project_id: null,
  idea_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: mockVideo, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockVideo, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockVideo],
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
  await app.register(videosRoutes, { prefix: '/videos' });
  await app.ready();
});

describe('GET /videos', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 3, data: null, error: null });
      } else {
        resolve({ data: [mockVideo], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({ method: 'GET', url: '/videos', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.videos).toBeDefined();
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
        resolve({ data: [mockVideo], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({ method: 'GET', url: '/videos', headers: AUTH_USER });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });

  it('returns 400 for invalid query params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/videos?status=invalid_status',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /videos', () => {
  const validBody = {
    title: 'My New Video',
    title_options: ['My New Video', 'Another Title'],
    script: mockScript,
    total_duration_estimate: '10:00',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/videos', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates video and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/videos',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.video).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST',
      url: '/videos',
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
      url: '/videos',
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
      url: '/videos',
      headers: AUTH,
      payload: { title: 'Only title' }, // missing title_options, script, total_duration_estimate
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores script_json as stringified JSON', async () => {
    await app.inject({
      method: 'POST',
      url: '/videos',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ script_json: JSON.stringify(mockScript) }),
    );
  });

  it('calculates word count when not provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/videos',
      headers: AUTH,
      payload: validBody,
    });
    // word_count should be calculated (not 0 since script has content)
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ word_count: expect.any(Number) }),
    );
  });

  it('uses provided word_count when given', async () => {
    await app.inject({
      method: 'POST',
      url: '/videos',
      headers: AUTH,
      payload: { ...validBody, word_count: 999 },
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ word_count: 999 }),
    );
  });
});

describe('GET /videos/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/v-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with VideoOutput transform', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockVideo, error: null });

    const res = await app.inject({ method: 'GET', url: '/videos/v-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.video).toBeDefined();
    expect(body.data.video.id).toBe('v-1');
    expect(body.data.video.title).toBe('Test Video Title');
    expect(body.data.video.title_options).toBeDefined();
    expect(Array.isArray(body.data.video.title_options)).toBe(true);
    expect(body.data.video.thumbnail).toBeDefined();
    expect(body.data.video.script).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when video not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({ method: 'GET', url: '/videos/nonexistent', headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('parses thumbnail_json as null gracefully', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { ...mockVideo, thumbnail_json: null },
      error: null,
    });

    const res = await app.inject({ method: 'GET', url: '/videos/v-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.video.thumbnail).toBeUndefined();
  });

  it('parses script_json as null gracefully', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { ...mockVideo, script_json: null },
      error: null,
    });

    const res = await app.inject({ method: 'GET', url: '/videos/v-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.video.script).toBeUndefined();
  });
});

describe('PUT /videos/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/videos/v-1',
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when video not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/videos/nonexistent',
      headers: AUTH,
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('updates video and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'v-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockVideo, title: 'Updated Title' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/videos/v-1',
      headers: AUTH,
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.video).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('stores script as script_json when updating', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'v-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockVideo, error: null });

    await app.inject({
      method: 'PUT',
      url: '/videos/v-1',
      headers: AUTH,
      payload: { script: mockScript },
    });
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ script_json: JSON.stringify(mockScript) }),
    );
  });
});

describe('PATCH /videos/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/videos/v-1',
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when video not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: '/videos/nonexistent',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates video status and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'v-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockVideo, status: 'review' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/videos/v-1',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.video).toBeDefined();
    expect(body.error).toBeNull();
  });
});

describe('DELETE /videos/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/videos/v-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when video not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({ method: 'DELETE', url: '/videos/nonexistent', headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('deletes video and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'v-1' }, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({ method: 'DELETE', url: '/videos/v-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();

    mockChain.delete = origDelete;
  });
});

describe('GET /videos/:id/export', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/v-1/export' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when video not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/videos/nonexistent/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('exports markdown by default', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockVideo, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/videos/v-1/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('-script.md');
    expect(res.payload).toContain('# Video Script:');
  });

  it('exports markdown when format=markdown', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockVideo, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/videos/v-1/export?format=markdown',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('-script.md');
  });

  it('exports HTML when format=html', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockVideo, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/videos/v-1/export?format=html',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('-script.html');
    expect(res.payload).toContain('<!DOCTYPE html>');
    expect(res.payload).toContain('<title>Test Video Title</title>');
  });

  it('exports teleprompter when format=teleprompter', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockVideo, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/videos/v-1/export?format=teleprompter',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('-teleprompter.txt');
    expect(res.payload).toContain('TELEPROMPTER SCRIPT');
  });

  it('exports JSON when format=json', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockVideo, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/videos/v-1/export?format=json',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('.json');
    const body = res.json();
    expect(body.id).toBe('v-1');
    expect(body.title).toBe('Test Video Title');
    expect(body.status).toBe('draft');
  });
});
