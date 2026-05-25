/**
 * Assets route — POST /generate/video — S7 (#220)
 *
 * Tests the new video image generation endpoint that wraps routeImageGeneration.
 * RED → GREEN per acceptance criterion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/middleware/authenticate', () => ({
  authenticate: vi.fn(async (request: any, reply: any) => {
    const key = request.headers['x-internal-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
      return reply.status(401).send({
        data: null,
        error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
      });
    }
    request.userId = request.headers['x-user-id'] ?? 'anon';
  }),
}));

vi.mock('@/lib/api/fastify-errors', () => ({
  sendError: vi.fn(async (reply: any, error: any) => {
    if (error?.statusCode) {
      return reply.status(error.statusCode).send({
        data: null,
        error: { message: error.message, code: error.code },
      });
    }
    if (error?.name === 'ZodError') {
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

// Mock the image router module
const mockRouteImageGeneration = vi.fn();
vi.mock('@/lib/ai/image-router', () => ({
  routeImageGeneration: (...args: unknown[]) => mockRouteImageGeneration(...args),
  ImageGenerationError: class ImageGenerationError extends Error {
    provider: string;
    constructor(message: string, provider: string) {
      super(message);
      this.name = 'ImageGenerationError';
      this.provider = provider;
    }
  },
}));

vi.stubEnv('INTERNAL_API_KEY', 'test-key');

import { assetsGenerateVideoRoutes } from '../../routes/assets-generate-video';

const AUTH = { 'x-internal-key': 'test-key', 'x-user-id': 'user-1' };

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockRouteImageGeneration.mockReset();
  app = Fastify({ logger: false });
  await app.register(assetsGenerateVideoRoutes, { prefix: '/assets' });
  await app.ready();
});

// ── AC1: prompts-only short-circuit ─────────────────────────────────────────

describe('POST /assets/generate/video — prompts-only mode', () => {
  it('returns 200 with shortCircuited=true and no imageUrl', async () => {
    mockRouteImageGeneration.mockResolvedValue({
      shortCircuited: true,
      prompt: 'A glowing deep-sea creature',
      provider: 'none',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: AUTH,
      payload: {
        draftId: 'draft-1',
        slot: 'thumbnail',
        prompt: 'A glowing deep-sea creature',
        mode: 'prompts-only',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.shortCircuited).toBe(true);
    expect(body.data.imageUrl).toBeUndefined();
    expect(body.data.prompt).toBe('A glowing deep-sea creature');
    expect(body.error).toBeNull();
  });

  it('calls routeImageGeneration with mode=prompts-only', async () => {
    mockRouteImageGeneration.mockResolvedValue({
      shortCircuited: true,
      prompt: 'Test prompt for thumbnail',
      provider: 'none',
    });

    await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: AUTH,
      payload: {
        draftId: 'draft-abc',
        slot: 'thumbnail',
        prompt: 'Test prompt for thumbnail',
        mode: 'prompts-only',
      },
    });

    expect(mockRouteImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-abc',
        slot: 'thumbnail',
        prompt: 'Test prompt for thumbnail',
        mode: 'prompts-only',
        userId: 'user-1',
      }),
    );
  });
});

// ── AC2: generate mode happy-path ────────────────────────────────────────────

describe('POST /assets/generate/video — generate mode', () => {
  it('returns 201 with imageUrl on successful generation', async () => {
    mockRouteImageGeneration.mockResolvedValue({
      shortCircuited: false,
      prompt: 'Dramatic anglerfish close-up',
      imageUrl: 'data:image/jpeg;base64,abc123',
      base64: 'abc123',
      mimeType: 'image/jpeg',
      provider: 'gemini',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: AUTH,
      payload: {
        draftId: 'draft-1',
        slot: 'thumbnail',
        prompt: 'Dramatic anglerfish close-up',
        mode: 'generate',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.shortCircuited).toBe(false);
    expect(body.data.imageUrl).toBe('data:image/jpeg;base64,abc123');
    expect(body.data.provider).toBe('gemini');
    expect(body.error).toBeNull();
  });

  it('passes chapterIndex for broll slot', async () => {
    mockRouteImageGeneration.mockResolvedValue({
      shortCircuited: false,
      prompt: 'B-roll prompt',
      imageUrl: 'data:image/jpeg;base64,xyz',
      base64: 'xyz',
      mimeType: 'image/jpeg',
      provider: 'gemini',
    });

    await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: AUTH,
      payload: {
        draftId: 'draft-1',
        slot: 'broll',
        prompt: 'B-roll prompt for chapter two',
        chapterIndex: 1,
        mode: 'generate',
      },
    });

    expect(mockRouteImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        slot: 'broll',
        chapterIndex: 1,
        mode: 'generate',
      }),
    );
  });
});

// ── AC3: provider error surfaces typed error ─────────────────────────────────

describe('POST /assets/generate/video — provider error', () => {
  it('returns 502 when image generation fails', async () => {
    const { ImageGenerationError } = await import('@/lib/ai/image-router');
    mockRouteImageGeneration.mockRejectedValue(
      new ImageGenerationError('Image generation failed: 503 Service Unavailable', 'gemini'),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: AUTH,
      payload: {
        draftId: 'draft-1',
        slot: 'thumbnail',
        prompt: 'Dramatic ocean scene with bioluminescence',
        mode: 'generate',
      },
    });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('IMAGE_GENERATION_FAILED');
    expect(body.data).toBeNull();
  });

  it('returns 400 for invalid request body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: AUTH,
      payload: {
        // missing required fields
        mode: 'generate',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.data).toBeNull();
  });

  it('returns 401 when authentication key is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/assets/generate/video',
      headers: {},
      payload: {
        draftId: 'draft-1',
        slot: 'thumbnail',
        prompt: 'A deep ocean creature glowing in the dark',
        mode: 'generate',
      },
    });

    expect(res.statusCode).toBe(401);
  });
});
