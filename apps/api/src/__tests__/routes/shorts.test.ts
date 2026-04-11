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
vi.mock('@/lib/exporters/shortsExporter', () => ({
  generateShortsMarkdownExport: vi.fn(
    (shorts: any[]) => `# Shorts Scripts\n\ncount: ${shorts.length}`,
  ),
  generateShortsHtmlExport: vi.fn(
    (_shorts: any[]) =>
      `<!DOCTYPE html><html><head><title>Shorts Scripts</title></head><body></body></html>`,
  ),
}));
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { shortsRoutes } from '../../routes/shorts';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

const mockShortItem = {
  short_number: 1,
  title: 'Test Short',
  hook: 'This will blow your mind',
  script: 'Full script content here',
  duration: '0:45',
  visual_style: 'talking head',
  cta: 'Follow for more',
  sound_effects: 'whoosh',
  background_music: 'upbeat',
};

const mockShorts = [mockShortItem];

const mockShortsDraft = {
  id: 's-1',
  shorts_json: JSON.stringify(mockShorts),
  short_count: 1,
  total_duration: '0:45',
  status: 'draft',
  project_id: null,
  idea_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: mockShortsDraft, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockShortsDraft, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockShortsDraft],
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
  await app.register(shortsRoutes, { prefix: '/shorts' });
  await app.ready();
});

describe('GET /shorts', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/shorts' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 3, data: null, error: null });
      } else {
        resolve({ data: [mockShortsDraft], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({ method: 'GET', url: '/shorts', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.shorts).toBeDefined();
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
        resolve({ data: [mockShortsDraft], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({ method: 'GET', url: '/shorts', headers: AUTH_USER });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });

  it('returns 400 for invalid query params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/shorts?status=invalid_status',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /shorts', () => {
  const validBody = {
    shorts: [mockShortItem],
    total_duration: '0:45',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/shorts', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates shorts and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/shorts',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.shorts).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST',
      url: '/shorts',
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
      url: '/shorts',
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
      url: '/shorts',
      headers: AUTH,
      payload: { total_duration: '0:45' }, // missing shorts array
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores shorts_json as stringified JSON', async () => {
    await app.inject({
      method: 'POST',
      url: '/shorts',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ shorts_json: JSON.stringify(mockShorts) }),
    );
  });

  it('sets short_count to shorts.length', async () => {
    await app.inject({
      method: 'POST',
      url: '/shorts',
      headers: AUTH,
      payload: validBody,
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ short_count: 1 }),
    );
  });
});

describe('GET /shorts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/shorts/s-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with ShortOutput transform', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    const res = await app.inject({ method: 'GET', url: '/shorts/s-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shorts).toBeDefined();
    expect(body.data.shorts.id).toBe('s-1');
    expect(body.data.shorts.shorts).toBeDefined();
    expect(Array.isArray(body.data.shorts.shorts)).toBe(true);
    expect(body.data.shorts.short_count).toBe(1);
    expect(body.error).toBeNull();
  });

  it('returns 404 when shorts not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({ method: 'GET', url: '/shorts/nonexistent', headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('parses shorts_json correctly', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    const res = await app.inject({ method: 'GET', url: '/shorts/s-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shorts.shorts).toEqual(mockShorts);
  });
});

describe('PUT /shorts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/shorts/s-1',
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when shorts not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/shorts/nonexistent',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('updates shorts and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 's-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockShortsDraft, status: 'review' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/shorts/s-1',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shorts).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('stores shorts as shorts_json and updates short_count when updating', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 's-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    await app.inject({
      method: 'PUT',
      url: '/shorts/s-1',
      headers: AUTH,
      payload: { shorts: mockShorts },
    });
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        shorts_json: JSON.stringify(mockShorts),
        short_count: 1,
      }),
    );
  });
});

describe('PATCH /shorts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/shorts/s-1',
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when shorts not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: '/shorts/nonexistent',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates shorts status and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 's-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockShortsDraft, status: 'review' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/shorts/s-1',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shorts).toBeDefined();
    expect(body.error).toBeNull();
  });
});

describe('DELETE /shorts/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/shorts/s-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when shorts not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/shorts/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('deletes shorts and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 's-1' }, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({ method: 'DELETE', url: '/shorts/s-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();

    mockChain.delete = origDelete;
  });
});

describe('GET /shorts/:id/export', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/shorts/s-1/export' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when shorts not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/shorts/nonexistent/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('exports markdown by default', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/shorts/s-1/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('.md');
    expect(res.payload).toContain('# Shorts Scripts');
  });

  it('exports markdown when format=markdown', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/shorts/s-1/export?format=markdown',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('.md');
  });

  it('exports HTML when format=html', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/shorts/s-1/export?format=html',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('.html');
    expect(res.payload).toContain('<!DOCTYPE html>');
    expect(res.payload).toContain('<title>Shorts Scripts</title>');
  });

  it('exports JSON when format=json', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockShortsDraft, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/shorts/s-1/export?format=json',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('.json');
    const body = res.json();
    expect(body.id).toBe('s-1');
    expect(body.shorts).toBeDefined();
    expect(Array.isArray(body.shorts)).toBe(true);
    expect(body.status).toBe('draft');
  });
});
