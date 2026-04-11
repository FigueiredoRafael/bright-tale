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

// Mock heavy dependencies
vi.mock('@/lib/ai/imageIndex', () => ({
  getImageProvider: vi.fn(),
}));
vi.mock('@/lib/files/imageStorage', () => ({
  saveImageLocally: vi.fn(),
  deleteImageFile: vi.fn(),
}));
vi.mock('@/lib/ai/promptGenerators', () => ({
  generateBlogFeaturedImagePrompt: vi.fn(
    (title: string, _ctx: any, style: string) =>
      `Blog featured ${style}: ${title}`,
  ),
  generateBlogSectionImagePrompt: vi.fn(
    (h2: string, _points?: string[]) => `Blog section image: ${h2}`,
  ),
  generateVideoThumbnailPrompt: vi.fn(
    (title: string, concept: string, emotion: string) =>
      `Video thumbnail: ${title} ${concept || ''} ${emotion || ''}`.trim(),
  ),
  generateVideoChapterImagePrompt: vi.fn(
    (title: string) => `Chapter image: ${title}`,
  ),
  generateStandalonePrompt: vi.fn(
    (concept: string, style: string) => `Standalone ${style}: ${concept}`,
  ),
  extractAgentImagePrompt: vi.fn().mockReturnValue(undefined),
}));

// Mock archiver
const mockArchiveChunks: Buffer[] = [];
const mockArchive = {
  on: vi.fn(),
  file: vi.fn(),
  finalize: vi.fn(),
};
vi.mock('archiver', () => ({
  default: vi.fn(() => mockArchive),
}));

// Mock fs — must include `default` so `import fs from 'fs'` in the route gets the mock
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mockModule = {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-image-data')),
  };
  return {
    ...mockModule,
    default: mockModule,
  };
});

vi.stubEnv('INTERNAL_API_KEY', 'test-key');
vi.stubEnv('UNSPLASH_ACCESS_KEY', 'unsplash-test-key');

import { assetsRoutes } from '../../routes/assets';
import { getImageProvider } from '@/lib/ai/imageIndex';
import { saveImageLocally, deleteImageFile } from '@/lib/files/imageStorage';
import { extractAgentImagePrompt } from '@/lib/ai/promptGenerators';
import fs from 'fs';

const AUTH = { 'x-internal-key': 'test-key' };

const mockAsset = {
  id: 'asset-1',
  project_id: 'proj-1',
  asset_type: 'image',
  source: 'unsplash',
  source_url: 'https://example.com/image.jpg',
  alt_text: 'Test image',
  local_path: null,
  role: null,
  content_type: null,
  content_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockGeneratedAsset = {
  ...mockAsset,
  id: 'asset-gen-1',
  source: 'generated',
  local_path: 'public/generated/proj-1/image.jpg',
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  // Restore fs mocks to default state after vi.clearAllMocks() resets implementations
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data') as any);
  mockChain.single.mockResolvedValue({ data: mockAsset, error: null });
  mockChain.maybeSingle.mockResolvedValue({ data: mockAsset, error: null });
  Object.defineProperty(mockChain, 'data', {
    value: [mockAsset],
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
  await app.register(assetsRoutes, { prefix: '/assets' });
  await app.ready();
});

// ============================================================
// GET /assets
// ============================================================
describe('GET /assets', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with asset list', async () => {
    // Mock the query chain to return data with count
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [mockAsset], count: 1, error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({ method: 'GET', url: '/assets', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });

  it('applies projectId filter', async () => {
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [mockAsset], count: 1, error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/assets?projectId=proj-1',
      headers: AUTH,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('project_id', 'proj-1');

    delete mockChain.then;
  });

  it('applies source filter', async () => {
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [], count: 0, error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    await app.inject({
      method: 'GET',
      url: '/assets?source=generated',
      headers: AUTH,
    });

    expect(mockChain.eq).toHaveBeenCalledWith('source', 'generated');

    delete mockChain.then;
  });
});

// ============================================================
// POST /assets
// ============================================================
describe('POST /assets', () => {
  const validBody = {
    project_id: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
    asset_type: 'image',
    source: 'unsplash',
    source_url: 'https://example.com/image.jpg',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates asset and returns 201', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'proj-1' }, error: null });
    mockChain.single.mockResolvedValueOnce({ data: mockAsset, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.asset).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      headers: AUTH,
      payload: { project_id: 'bad-id' }, // missing required fields
    });
    expect(res.statusCode).toBe(400);
  });
});

// ============================================================
// DELETE /assets/:id
// ============================================================
describe('DELETE /assets/:id', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/assets/asset-1' });
    expect(res.statusCode).toBe(401);
  });

  it('deletes asset and returns 200', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockAsset, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await app.inject({ method: 'DELETE', url: '/assets/asset-1', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();

    mockChain.delete = origDelete;
  });

  it('returns 404 when asset not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'DELETE',
      url: '/assets/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('calls deleteImageFile for generated assets with local_path', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockGeneratedAsset, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    vi.mocked(deleteImageFile).mockResolvedValueOnce(undefined);

    await app.inject({ method: 'DELETE', url: '/assets/asset-gen-1', headers: AUTH });

    expect(deleteImageFile).toHaveBeenCalledWith(mockGeneratedAsset.local_path);

    mockChain.delete = origDelete;
  });

  it('does not call deleteImageFile for non-generated assets', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockAsset, error: null });
    const origDelete = mockChain.delete;
    mockChain.delete = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    await app.inject({ method: 'DELETE', url: '/assets/asset-1', headers: AUTH });

    expect(deleteImageFile).not.toHaveBeenCalled();

    mockChain.delete = origDelete;
  });
});

// ============================================================
// GET /assets/:id/download
// ============================================================
describe('GET /assets/:id/download', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/asset-1/download' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when asset not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/assets/nonexistent/download',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when asset has no local_path', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: mockAsset, error: null }); // no local_path

    const res = await app.inject({
      method: 'GET',
      url: '/assets/asset-1/download',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('NO_LOCAL_FILE');
  });

  it('returns file with correct headers for jpg', async () => {
    const assetWithPath = { ...mockGeneratedAsset, local_path: 'public/gen/image.jpg' };
    mockChain.maybeSingle.mockResolvedValueOnce({ data: assetWithPath, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/assets/asset-gen-1/download',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.jpg');
  });

  it('returns png mime type for png files', async () => {
    const assetWithPng = { ...mockGeneratedAsset, local_path: 'public/gen/image.png' };
    mockChain.maybeSingle.mockResolvedValueOnce({ data: assetWithPng, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/assets/asset-gen-1/download',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });
});

// ============================================================
// GET /assets/download (bulk ZIP)
// ============================================================
describe('GET /assets/download', () => {
  beforeEach(() => {
    // Setup archiver mock to resolve immediately with empty buffer
    (mockArchive as any)._endHandler = null;
    mockArchive.on.mockImplementation((event: string, handler: any) => {
      if (event === 'end') {
        // Store handler to call later via finalize
        (mockArchive as any)._endHandler = handler;
      }
      return mockArchive;
    });
    mockArchive.finalize.mockImplementation(() => {
      if ((mockArchive as any)._endHandler) {
        (mockArchive as any)._endHandler();
      }
    });
  });

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/download' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when no downloadable assets found', async () => {
    // Mock query returning empty result
    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    // Also mock fs.existsSync to return false
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/assets/download',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);

    delete mockChain.then;
  });
});

// ============================================================
// GET /assets/project/:projectId
// ============================================================
describe('GET /assets/project/:projectId', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/project/proj-1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await app.inject({
      method: 'GET',
      url: '/assets/project/nonexistent',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns assets for project', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'proj-1' }, error: null });

    const thenMock = vi.fn().mockImplementation((resolve: (v: any) => void) => {
      resolve({ data: [mockAsset], error: null });
      return { catch: vi.fn() };
    });
    mockChain.then = thenMock;

    const res = await app.inject({
      method: 'GET',
      url: '/assets/project/proj-1',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.assets).toBeDefined();
    expect(body.data.count).toBeDefined();
    expect(body.error).toBeNull();

    delete mockChain.then;
  });
});

// ============================================================
// POST /assets/generate
// ============================================================
describe('POST /assets/generate', () => {
  const validBody = {
    prompt: 'A beautiful mountain landscape at sunset with dramatic clouds',
    project_id: 'proj-1',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({ method: 'POST', url: '/assets/generate', payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it('generates image and returns 201', async () => {
    const mockProvider = {
      generateImages: vi.fn().mockResolvedValue([
        { base64: 'base64data', mimeType: 'image/jpeg' },
      ]),
    };
    vi.mocked(getImageProvider).mockResolvedValueOnce(mockProvider as any);
    vi.mocked(saveImageLocally).mockResolvedValueOnce({
      localPath: 'public/gen/image.jpg',
      publicUrl: '/gen/image.jpg',
    });
    mockChain.single.mockResolvedValueOnce({ data: mockGeneratedAsset, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.error).toBeNull();
  });

  it('returns 502 when no images generated', async () => {
    const mockProvider = {
      generateImages: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getImageProvider).mockResolvedValueOnce(mockProvider as any);

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(502);
  });

  it('returns 400 for invalid body (prompt too short)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate',
      headers: AUTH,
      payload: { prompt: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('inserts asset with generated source', async () => {
    const mockProvider = {
      generateImages: vi.fn().mockResolvedValue([
        { base64: 'base64data', mimeType: 'image/jpeg' },
      ]),
    };
    vi.mocked(getImageProvider).mockResolvedValueOnce(mockProvider as any);
    vi.mocked(saveImageLocally).mockResolvedValueOnce({
      localPath: 'public/gen/image.jpg',
      publicUrl: '/gen/image.jpg',
    });
    mockChain.single.mockResolvedValueOnce({ data: mockGeneratedAsset, error: null });

    await app.inject({
      method: 'POST',
      url: '/assets/generate',
      headers: AUTH,
      payload: validBody,
    });

    expect(mockChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'generated', asset_type: 'image' }),
    );
  });

  it('returns array when multiple images generated', async () => {
    const mockProvider = {
      generateImages: vi.fn().mockResolvedValue([
        { base64: 'base64data1', mimeType: 'image/jpeg' },
        { base64: 'base64data2', mimeType: 'image/jpeg' },
      ]),
    };
    vi.mocked(getImageProvider).mockResolvedValueOnce(mockProvider as any);
    vi.mocked(saveImageLocally)
      .mockResolvedValueOnce({ localPath: 'public/gen/image1.jpg', publicUrl: '/gen/image1.jpg' })
      .mockResolvedValueOnce({ localPath: 'public/gen/image2.jpg', publicUrl: '/gen/image2.jpg' });
    mockChain.single
      .mockResolvedValueOnce({ data: { ...mockGeneratedAsset, id: 'asset-gen-1' }, error: null })
      .mockResolvedValueOnce({ data: { ...mockGeneratedAsset, id: 'asset-gen-2' }, error: null });

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate',
      headers: AUTH,
      payload: { ...validBody, numImages: 2 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ============================================================
// POST /assets/generate/suggest-prompts
// ============================================================
describe('POST /assets/generate/suggest-prompts', () => {
  const validBody = {
    content_type: 'blog',
    role: 'featured',
    title: 'How to bake bread',
  };

  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns suggestions for blog featured', async () => {
    vi.mocked(extractAgentImagePrompt).mockReturnValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.suggestions).toBeDefined();
    expect(Array.isArray(body.data.suggestions)).toBe(true);
    expect(body.data.suggestions.length).toBeGreaterThan(0);
    expect(body.error).toBeNull();
  });

  it('includes agent prompt when available', async () => {
    vi.mocked(extractAgentImagePrompt).mockReturnValueOnce('Agent generated prompt');

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.suggestions[0]).toBe('Agent generated prompt');
  });

  it('returns suggestions for standalone content_type', async () => {
    vi.mocked(extractAgentImagePrompt).mockReturnValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      headers: AUTH,
      payload: { content_type: 'standalone', role: 'hero', title: 'My concept' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.suggestions.length).toBeGreaterThan(0);
  });

  it('returns generic fallback when no matches', async () => {
    vi.mocked(extractAgentImagePrompt).mockReturnValueOnce(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      headers: AUTH,
      payload: { content_type: 'podcast', role: 'cover', title: 'My Podcast' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Should have at least one generic fallback
    expect(body.data.suggestions.length).toBeGreaterThan(0);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      headers: AUTH,
      payload: { content_type: 'invalid_type', role: 'featured' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('deduplicates and limits to 3 suggestions', async () => {
    // When agent prompt + two more are generated, limit to 3
    vi.mocked(extractAgentImagePrompt).mockReturnValueOnce('Agent prompt');

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/suggest-prompts',
      headers: AUTH,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.suggestions.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================
// GET /assets/unsplash/search
// ============================================================
describe('GET /assets/unsplash/search', () => {
  it('returns 401 without auth key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/unsplash/search?query=mountains',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for missing query param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/unsplash/search',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });

  it('proxies to Unsplash and transforms response', async () => {
    const mockUnsplashResponse = {
      results: [
        {
          id: 'photo-1',
          description: 'Mountain landscape',
          alt_description: 'A mountain at sunset',
          urls: {
            raw: 'https://example.com/raw.jpg',
            full: 'https://example.com/full.jpg',
            regular: 'https://example.com/regular.jpg',
            small: 'https://example.com/small.jpg',
            thumb: 'https://example.com/thumb.jpg',
          },
          links: {
            html: 'https://unsplash.com/photos/photo-1',
            download_location: 'https://api.unsplash.com/photos/photo-1/download',
          },
          user: {
            name: 'John Doe',
            username: 'johndoe',
            links: { html: 'https://unsplash.com/@johndoe' },
          },
          width: 1920,
          height: 1080,
        },
      ],
      total: 100,
      total_pages: 5,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockUnsplashResponse),
    } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/assets/unsplash/search?query=mountains',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.results).toHaveLength(1);
    expect(body.data.results[0].id).toBe('photo-1');
    expect(body.data.results[0].urls).toBeDefined();
    expect(body.data.results[0].user.profile).toBeDefined();
    expect(body.data.total).toBe(100);
    expect(body.error).toBeNull();
  });

  it('returns error when Unsplash API fails', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve('Rate limit exceeded'),
    } as any);

    const res = await app.inject({
      method: 'GET',
      url: '/assets/unsplash/search?query=test',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 when UNSPLASH_ACCESS_KEY is not set', async () => {
    vi.stubEnv('UNSPLASH_ACCESS_KEY', '');

    const res = await app.inject({
      method: 'GET',
      url: '/assets/unsplash/search?query=mountains',
      headers: AUTH,
    });
    expect(res.statusCode).toBe(500);

    vi.stubEnv('UNSPLASH_ACCESS_KEY', 'unsplash-test-key');
  });
});
