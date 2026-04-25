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

vi.mock('@/middleware/authenticate', () => {
  const handler = vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
      });
    }
    const userId = request.headers['x-user-id'];
    request.userId = typeof userId === 'string' ? userId : undefined;
  });
  return { authenticate: handler, authenticateWithUser: handler };
});

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
    constructor(statusCode: number, message: string, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code ?? 'API_ERROR';
    }
  },
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((val: string) => `enc:${val}`),
  decrypt: vi.fn((val: string) => val.replace(/^enc:/, '')),
}));

vi.mock('@/lib/utils', () => ({
  markdownToHtml: vi.fn((md: string) => `<p>${md}</p>`),
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn((_content: string) => {
      // Return a mock production stage
      return {
        production_output: {
          blog: {
            title: 'Test Blog Post',
            slug: 'test-blog-post',
            full_draft: 'This is the blog content.',
            meta_description: 'Test meta description',
          },
        },
      };
    }),
  },
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');
vi.stubEnv('ENCRYPTION_SECRET', 'test-secret');

import { wordpressRoutes } from '../../routes/wordpress';

const AUTH = { 'x-internal-key': 'test-key' };

const MOCK_CONFIG = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  site_url: 'https://example.com',
  username: 'admin',
  password: 'enc:secretpassword',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();

  mockChain.single.mockResolvedValue({ data: MOCK_CONFIG, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: MOCK_CONFIG, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [MOCK_CONFIG],
    writable: true,
    configurable: true,
  });
  Object.defineProperty(mockChain, 'error', {
    value: null,
    writable: true,
    configurable: true,
  });

  app = Fastify({ logger: false });
  await app.register(wordpressRoutes, { prefix: '/wordpress' });
  await app.ready();
});

// ===========================
// POST /wordpress/config
// ===========================
describe.skip('POST /wordpress/config', () => {
  const validBody = {
    site_url: 'https://example.com',
    username: 'admin',
    password: 'secret123',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/config',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates a config and returns 201', async () => {
    mockChain.single.mockResolvedValueOnce({ data: MOCK_CONFIG, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/config',
      headers: AUTH,
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    expect(body.data.id).toBe(MOCK_CONFIG.id);
    // Password should not be in response
    expect(body.data.password).toBeUndefined();
  });

  it('returns 400 for invalid site_url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/config',
      headers: AUTH,
      payload: { ...validBody, site_url: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for missing username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/config',
      headers: AUTH,
      payload: { site_url: 'https://example.com', password: 'secret' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when ENCRYPTION_SECRET is missing', async () => {
    vi.stubEnv('ENCRYPTION_SECRET', '');

    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/config',
      headers: AUTH,
      payload: validBody,
    });

    expect(res.statusCode).toBe(500);
    vi.stubEnv('ENCRYPTION_SECRET', 'test-secret');
  });
});

// ===========================
// GET /wordpress/config
// ===========================
describe.skip('GET /wordpress/config', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/wordpress/config' });
    expect(res.statusCode).toBe(401);
  });

  it('returns list of configs with passwords masked', async () => {
    Object.defineProperty(mockChain, 'data', {
      value: [MOCK_CONFIG, { ...MOCK_CONFIG, id: 'clconfig00000000000000002' }],
      writable: true,
      configurable: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/wordpress/config',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
    // Passwords should be masked
    for (const config of body.data) {
      expect(config.password).toBeUndefined();
    }
  });
});

// ===========================
// GET /wordpress/config/:id
// ===========================
describe.skip('GET /wordpress/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/wordpress/config/some-id' });
    expect(res.statusCode).toBe(401);
  });

  it('returns config with password masked', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: MOCK_CONFIG, error: null });

    const res = await app.inject({
      method: 'GET',
      url: `/wordpress/config/${MOCK_CONFIG.id}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(MOCK_CONFIG.id);
    expect(body.data.password).toBeUndefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when config not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/wordpress/config/nonexistent',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ===========================
// PUT /wordpress/config/:id
// ===========================
describe.skip('PUT /wordpress/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/wordpress/config/some-id',
      payload: { username: 'new-user' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('updates config and returns 200', async () => {
    // First call: find existing
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: MOCK_CONFIG.id }, error: null });
    // Second call: update returns updated config
    mockChain.single.mockResolvedValueOnce({
      data: { ...MOCK_CONFIG, username: 'new-user' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/wordpress/config/${MOCK_CONFIG.id}`,
      headers: AUTH,
      payload: { username: 'new-user' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when config not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/wordpress/config/nonexistent',
      headers: AUTH,
      payload: { username: 'new-user' },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ===========================
// PATCH /wordpress/config/:id
// ===========================
describe.skip('PATCH /wordpress/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/wordpress/config/some-id',
      payload: { username: 'new-user' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('updates config and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: MOCK_CONFIG.id }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...MOCK_CONFIG, username: 'patched-user' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/wordpress/config/${MOCK_CONFIG.id}`,
      headers: AUTH,
      payload: { username: 'patched-user' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });
});

// ===========================
// DELETE /wordpress/config/:id
// ===========================
describe.skip('DELETE /wordpress/config/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/wordpress/config/some-id',
    });
    expect(res.statusCode).toBe(401);
  });

  it('deletes config and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: MOCK_CONFIG.id }, error: null });
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/wordpress/config/${MOCK_CONFIG.id}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.id).toBe(MOCK_CONFIG.id);
    expect(body.error).toBeNull();
  });

  it('returns 404 when config not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/wordpress/config/nonexistent',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
  });
});

// ===========================
// GET /wordpress/tags
// ===========================
describe('GET /wordpress/tags', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/wordpress/tags' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no credentials provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/wordpress/tags',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeDefined();
  });

  it('fetches tags via config_id', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: MOCK_CONFIG, error: null });

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 1, name: 'JavaScript', slug: 'javascript', count: 5 },
        { id: 2, name: 'TypeScript', slug: 'typescript', count: 3 },
      ],
    });
    global.fetch = mockFetch as any;

    const res = await app.inject({
      method: 'GET',
      url: `/wordpress/tags?config_id=${MOCK_CONFIG.id}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tags).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.error).toBeNull();
  });

  it('fetches tags via inline credentials', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, name: 'React', slug: 'react', count: 10 }],
    });
    global.fetch = mockFetch as any;

    const res = await app.inject({
      method: 'GET',
      url: '/wordpress/tags?site_url=https%3A%2F%2Fexample.com&username=admin&password=secret',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tags).toHaveLength(1);
  });
});

// ===========================
// GET /wordpress/categories
// ===========================
describe('GET /wordpress/categories', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/wordpress/categories' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no credentials provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/wordpress/categories',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
  });

  it('fetches categories via config_id', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: MOCK_CONFIG, error: null });

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 1, name: 'Technology', slug: 'technology', count: 8 },
        { id: 2, name: 'Programming', slug: 'programming', count: 6 },
      ],
    });
    global.fetch = mockFetch as any;

    const res = await app.inject({
      method: 'GET',
      url: `/wordpress/categories?config_id=${MOCK_CONFIG.id}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.categories).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.error).toBeNull();
  });

  it('fetches categories via inline credentials', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1, name: 'General', slug: 'general', count: 15 }],
    });
    global.fetch = mockFetch as any;

    const res = await app.inject({
      method: 'GET',
      url: '/wordpress/categories?site_url=https%3A%2F%2Fexample.com&username=admin&password=secret',
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.categories).toHaveLength(1);
  });
});

// ===========================
// POST /wordpress/publish
// ===========================
describe('POST /wordpress/publish', () => {
  const VALID_PROJECT_ID = '550e8400-e29b-41d4-a716-446655440002';
  const VALID_CONFIG_ID = '550e8400-e29b-41d4-a716-446655440001';

  const validBody = {
    project_id: VALID_PROJECT_ID,
    config_id: VALID_CONFIG_ID,
    status: 'draft',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/publish',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid body (missing project_id)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/publish',
      headers: AUTH,
      payload: { status: 'draft' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when project not found', async () => {
    // First maybeSingle: project not found
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/publish',
      headers: AUTH,
      payload: validBody,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.message).toContain('Project not found');
  });

  it('returns 400 when no production stage found', async () => {
    // Project found
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { id: VALID_PROJECT_ID, status: 'active' },
      error: null,
    });
    // No production stages
    Object.defineProperty(mockChain, 'data', {
      value: [],
      writable: true,
      configurable: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/publish',
      headers: AUTH,
      payload: validBody,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.message).toContain('No production content found');
  });

  it('publishes successfully and returns 201', async () => {
    // Project found (with channel_id so WP config is derived from channel)
    mockChain.maybeSingle
      .mockResolvedValueOnce({
        data: { id: VALID_PROJECT_ID, status: 'active', channel_id: VALID_CONFIG_ID },
        error: null,
      })
      // WP config found via channel_id
      .mockResolvedValueOnce({ data: MOCK_CONFIG, error: null });

    // Stages found
    Object.defineProperty(mockChain, 'data', {
      value: [
        {
          id: 'stage-1',
          yaml_artifact: 'production_output:\n  blog:\n    title: Test\n    slug: test\n    full_draft: content\n    meta_description: desc',
        },
      ],
      writable: true,
      configurable: true,
    });

    // Assets (none)
    const origData = mockChain.data;
    // Override so second "data" property access returns empty array for assets
    let dataCallCount = 0;
    // We'll rely on the mock chain's default data property after stages

    // Mock fetch for WP API
    const mockFetch = vi.fn()
      // POST /posts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          link: 'https://example.com/test-post',
          status: 'draft',
        }),
      });
    global.fetch = mockFetch as any;

    // Mock update for project status
    mockChain.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/wordpress/publish',
      headers: AUTH,
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.published).toBe(true);
    expect(body.data.wordpress_post_id).toBe(42);
    expect(body.error).toBeNull();
  });
});
