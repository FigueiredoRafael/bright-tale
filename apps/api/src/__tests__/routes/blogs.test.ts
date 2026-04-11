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
vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { blogsRoutes } from '../../routes/blogs';

const AUTH = { 'x-internal-key': 'test-key' };
const AUTH_USER = { ...AUTH, 'x-user-id': 'user-123' };

const mockBlog = {
  id: 'b-1',
  title: 'Test Blog',
  slug: 'test-blog',
  meta_description: 'A test blog post',
  full_draft: '# Test Blog\n\nContent here.',
  outline_json: JSON.stringify([{ h2: 'Section 1', key_points: [], word_count_target: 300 }]),
  primary_keyword: 'test keyword',
  secondary_keywords: ['seo', 'blog'],
  affiliate_placement: 'middle',
  affiliate_copy: 'Buy now!',
  affiliate_link: 'https://example.com/product',
  affiliate_rationale: 'Relevant product',
  internal_links_json: JSON.stringify([{ topic: 'Related', anchor_text: 'click here' }]),
  word_count: 500,
  status: 'draft',
  project_id: null,
  idea_id: null,
  wordpress_post_id: null,
  wordpress_url: null,
  published_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockChain.single.mockResolvedValue({ data: mockBlog, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockBlog, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockBlog],
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
  await app.register(blogsRoutes, { prefix: '/blogs' });
  await app.ready();
});

describe('GET /blogs', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/blogs' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth', async () => {
    let callCount = 0;
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      callCount++;
      if (callCount % 2 === 1) {
        resolve({ count: 5, data: null, error: null });
      } else {
        resolve({ data: [mockBlog], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({ method: 'GET', url: '/blogs', headers: AUTH });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.blogs).toBeDefined();
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
        resolve({ data: [mockBlog], count: null, error: null });
      }
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({ method: 'GET', url: '/blogs', headers: AUTH_USER });

    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');

    delete mockChain.then;
  });

  it('returns 400 for invalid query params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/blogs?status=invalid_status',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /blogs', () => {
  const validBody = {
    title: 'My New Blog Post',
    slug: 'my-new-blog-post',
    meta_description: 'A great blog post',
    full_draft: '# My New Blog Post\n\nContent here.',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/blogs', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('creates blog and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/blogs',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.blog).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('inserts user_id from X-User-Id header', async () => {
    await app.inject({
      method: 'POST',
      url: '/blogs',
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
      url: '/blogs',
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
      url: '/blogs',
      headers: AUTH,
      payload: { title: 'Only title' }, // missing slug
    });
    expect(res.statusCode).toBe(400);
  });

  it('stores outline_json when outline is provided', async () => {
    const outline = [{ h2: 'Intro', key_points: ['point 1'], word_count_target: 300 }];
    await app.inject({
      method: 'POST',
      url: '/blogs',
      headers: AUTH,
      payload: { ...validBody, outline },
    });
    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ outline_json: JSON.stringify(outline) }),
    );
  });
});

describe('GET /blogs/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/blogs/b-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with BlogOutput transform', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockBlog, error: null });

    const res = await app.inject({ method: 'GET', url: '/blogs/b-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.blog).toBeDefined();
    expect(body.data.blog.id).toBe('b-1');
    expect(body.data.blog.title).toBe('Test Blog');
    expect(body.data.blog.outline).toBeDefined();
    expect(Array.isArray(body.data.blog.outline)).toBe(true);
    expect(body.data.blog.affiliate_integration).toBeDefined();
    expect(body.data.blog.affiliate_integration.placement).toBe('middle');
    expect(body.data.blog.internal_links_suggested).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when blog not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({ method: 'GET', url: '/blogs/nonexistent', headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('parses outline_json from null gracefully', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({
      data: { ...mockBlog, outline_json: null, internal_links_json: null },
      error: null,
    });

    const res = await app.inject({ method: 'GET', url: '/blogs/b-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.blog.outline).toEqual([]);
    expect(body.data.blog.internal_links_suggested).toEqual([]);
  });
});

describe('PUT /blogs/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/blogs/b-1',
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when blog not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PUT',
      url: '/blogs/nonexistent',
      headers: AUTH,
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('updates blog and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'b-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockBlog, title: 'Updated Title' },
      error: null,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/blogs/b-1',
      headers: AUTH,
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.blog).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('handles affiliate_integration update', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'b-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockBlog, error: null });

    await app.inject({
      method: 'PUT',
      url: '/blogs/b-1',
      headers: AUTH,
      payload: {
        affiliate_integration: {
          placement: 'intro',
          copy: 'New copy',
          product_link_placeholder: 'https://example.com',
          rationale: 'Great product',
        },
      },
    });
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliate_placement: 'intro',
        affiliate_copy: 'New copy',
        affiliate_link: 'https://example.com',
        affiliate_rationale: 'Great product',
      }),
    );
  });
});

describe('PATCH /blogs/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/blogs/b-1',
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when blog not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'PATCH',
      url: '/blogs/nonexistent',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates blog status and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'b-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({
      data: { ...mockBlog, status: 'review' },
      error: null,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/blogs/b-1',
      headers: AUTH,
      payload: { status: 'review' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.blog).toBeDefined();
    expect(body.error).toBeNull();
  });
});

describe('DELETE /blogs/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/blogs/b-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when blog not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({ method: 'DELETE', url: '/blogs/nonexistent', headers: AUTH });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('deletes blog and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'b-1' }, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({ method: 'DELETE', url: '/blogs/b-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();

    mockChain.delete = origDelete;
  });
});

describe('GET /blogs/:id/export', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/blogs/b-1/export' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when blog not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/blogs/nonexistent/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('exports markdown by default', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockBlog, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/blogs/b-1/export',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('test-blog.md');
    expect(res.payload).toContain('# Test Blog');
    expect(res.payload).toContain('slug: test-blog');
  });

  it('exports markdown when format=markdown', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockBlog, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/blogs/b-1/export?format=markdown',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.headers['content-disposition']).toContain('test-blog.md');
  });

  it('exports HTML when format=html', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockBlog, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/blogs/b-1/export?format=html',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('test-blog.html');
    expect(res.payload).toContain('<!DOCTYPE html>');
    expect(res.payload).toContain('<title>Test Blog</title>');
  });

  it('exports JSON when format=json', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockBlog, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/blogs/b-1/export?format=json',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('test-blog.json');
    const body = res.json();
    expect(body.id).toBe('b-1');
    expect(body.title).toBe('Test Blog');
    expect(body.slug).toBe('test-blog');
    expect(body.status).toBe('draft');
  });

  it('includes affiliate information in markdown export when copy is present', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockBlog, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/blogs/b-1/export?format=markdown',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('## Affiliate Information');
    expect(res.payload).toContain('Buy now!');
  });
});
