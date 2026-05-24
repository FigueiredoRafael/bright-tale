/**
 * Image Router tests — S7 (#220)
 *
 * RED → GREEN per acceptance criterion:
 * 1. Short-circuit: mode='prompts-only' never calls provider, never debits credits
 * 2. Happy-path: mode='generate' calls provider, returns URL
 * 3. Provider error: surfaces typed error without crashing
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock the image provider factory ─────────────────────────────────────────
// NOTE: vi.mock factories are hoisted — no top-level vars allowed inside them.
// We use vi.fn() with a deferred implementation set in beforeEach instead.

vi.mock('../imageIndex.js', () => ({
  getImageProvider: vi.fn(),
}));

// ── Mock axiom usage logging so tests don't need DB ─────────────────────────

vi.mock('../../axiom.js', () => ({
  logAiUsage: vi.fn(),
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import { routeImageGeneration } from '../image-router';
import { getImageProvider } from '../imageIndex.js';
import { logAiUsage } from '../../axiom.js';

// ── Provider stub ─────────────────────────────────────────────────────────────

const mockGenerateImages = vi.fn();

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PARAMS = {
  prompt: 'A glowing anglerfish in the deep ocean',
  draftId: 'draft-abc-123',
  slot: 'thumbnail' as const,
  userId: 'user-1',
};

beforeEach(() => {
  vi.mocked(logAiUsage).mockReset();
  mockGenerateImages.mockReset();
  vi.mocked(getImageProvider).mockResolvedValue({
    name: 'gemini',
    generateImages: mockGenerateImages,
  });
});

// ── AC1: Short-circuit ────────────────────────────────────────────────────────

describe('routeImageGeneration — prompts-only mode', () => {
  it('returns the prompt text without calling getImageProvider', async () => {
    const result = await routeImageGeneration({ ...BASE_PARAMS, mode: 'prompts-only' });

    expect(result.shortCircuited).toBe(true);
    expect(result.prompt).toBe(BASE_PARAMS.prompt);
    expect(result.imageUrl).toBeUndefined();
    expect(getImageProvider).not.toHaveBeenCalled();
  });

  it('does not call the image provider in prompts-only mode', async () => {
    await routeImageGeneration({ ...BASE_PARAMS, mode: 'prompts-only' });

    expect(mockGenerateImages).not.toHaveBeenCalled();
  });

  it('logs a short-circuited usage entry with provider=none and tokens=0', async () => {
    await routeImageGeneration({ ...BASE_PARAMS, mode: 'prompts-only' });

    expect(vi.mocked(logAiUsage)).toHaveBeenCalledOnce();
    const entry = vi.mocked(logAiUsage).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(entry['provider']).toBe('none');
    expect(entry['inputTokens']).toBe(0);
    expect(entry['outputTokens']).toBe(0);
    expect((entry['metadata'] as Record<string, unknown>)['shortCircuited']).toBe(true);
  });
});

// ── AC2: Happy-path generate ─────────────────────────────────────────────────

describe('routeImageGeneration — generate mode', () => {
  beforeEach(() => {
    mockGenerateImages.mockResolvedValue([
      { base64: 'abc123base64', mimeType: 'image/jpeg' },
    ]);
  });

  it('calls getImageProvider and returns imageUrl on success', async () => {
    const result = await routeImageGeneration({ ...BASE_PARAMS, mode: 'generate' });

    expect(result.shortCircuited).toBe(false);
    expect(result.imageUrl).toBeDefined();
    // base64 data URL for in-memory result before storage
    expect(result.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.base64).toBe('abc123base64');
    expect(result.mimeType).toBe('image/jpeg');
    expect(getImageProvider).toHaveBeenCalledOnce();
    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: BASE_PARAMS.prompt }),
    );
  });

  it('logs a success usage entry with provider=gemini', async () => {
    await routeImageGeneration({ ...BASE_PARAMS, mode: 'generate' });

    expect(vi.mocked(logAiUsage)).toHaveBeenCalledOnce();
    const entry = vi.mocked(logAiUsage).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(entry['provider']).toBe('gemini');
    expect(entry['status']).toBe('success');
    expect((entry['metadata'] as Record<string, unknown>)['shortCircuited']).toBeFalsy();
  });

  it('passes chapterIndex to the provider call metadata when provided', async () => {
    await routeImageGeneration({
      ...BASE_PARAMS,
      slot: 'broll',
      chapterIndex: 1,
      mode: 'generate',
    });

    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: BASE_PARAMS.prompt }),
    );
    const entry = vi.mocked(logAiUsage).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect((entry['metadata'] as Record<string, unknown>)['chapterIndex']).toBe(1);
  });
});

// ── AC3: Provider error mapping ───────────────────────────────────────────────

describe('routeImageGeneration — provider error', () => {
  it('throws an ImageGenerationError on provider failure', async () => {
    mockGenerateImages.mockRejectedValue(new Error('503 Service Unavailable'));

    await expect(
      routeImageGeneration({ ...BASE_PARAMS, mode: 'generate' }),
    ).rejects.toThrow(/image generation failed/i);
  });

  it('logs an error usage entry when provider throws', async () => {
    mockGenerateImages.mockRejectedValue(new Error('quota exceeded'));

    await expect(
      routeImageGeneration({ ...BASE_PARAMS, mode: 'generate' }),
    ).rejects.toThrow();

    expect(vi.mocked(logAiUsage)).toHaveBeenCalledOnce();
    const entry = vi.mocked(logAiUsage).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(entry['status']).toBe('error');
    expect(entry['provider']).toBe('gemini');
  });

  it('does not log usage when getImageProvider itself throws (config error)', async () => {
    vi.mocked(getImageProvider).mockRejectedValue(new Error('No image provider configured'));

    await expect(
      routeImageGeneration({ ...BASE_PARAMS, mode: 'generate' }),
    ).rejects.toThrow();

    // config error before provider is known — no usage entry
    expect(vi.mocked(logAiUsage)).not.toHaveBeenCalled();
  });
});
