/**
 * Image Generation Router — S7 (#220)
 *
 * Routes image generation calls to the configured AI image provider.
 * Mirrors the text router's semantics:
 *   - Provider/model resolution via getImageProvider()
 *   - prompts-only short-circuit: no provider call, no credit debit
 *   - usage logging via logAiUsage (same Axiom sink as text router)
 *
 * Provider choice: Gemini Imagen (gemini-2.5-flash-image by default).
 * Rationale: project already uses Gemini for all text stages; sharing the
 * Google AI key avoids a second vendor secret and gives consistent quota
 * monitoring. The ImageIndex factory already resolves OpenAI as a fallback,
 * so operator can switch without code changes.
 */

import { getImageProvider } from './imageIndex.js';
import { logAiUsage } from '../axiom.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImageSlot = 'thumbnail' | 'broll' | 'hook';
export type ImageMode = 'generate' | 'prompts-only';

export interface RouteImageParams {
  /** The image prompt text (required regardless of mode). */
  prompt: string;
  /** ID of the content_draft row — used for usage log metadata. */
  draftId: string;
  /** Which visual slot this image belongs to (thumbnail / broll / hook). */
  slot: ImageSlot;
  /** For broll slots — which chapter (0-indexed) this belongs to. */
  chapterIndex?: number;
  /** 'generate' calls the provider; 'prompts-only' short-circuits. */
  mode: ImageMode;
  /** Caller's user ID for usage log attribution. */
  userId?: string | null;
  /** Aspect ratio hint forwarded to the provider. Defaults to '16:9'. */
  aspectRatio?: string;
}

export interface RouteImageResult {
  /** true when mode='prompts-only' — no provider was called. */
  shortCircuited: boolean;
  /** The original prompt (always present). */
  prompt: string;
  /** Data URL (data:image/...;base64,...) of the generated image. Undefined when short-circuited. */
  imageUrl?: string;
  /** Raw base64 string (no prefix). Undefined when short-circuited. */
  base64?: string;
  /** MIME type of the generated image. Undefined when short-circuited. */
  mimeType?: string;
  /** Name of the provider that handled the request, or 'none' for short-circuit. */
  provider: string;
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Route an image generation request.
 *
 * prompts-only mode:
 *   - Returns { shortCircuited: true, prompt, provider: 'none' }
 *   - Logs a usage entry with provider='none', tokens=0, metadata.shortCircuited=true
 *   - Does NOT call getImageProvider or the underlying model
 *
 * generate mode:
 *   - Resolves the active image provider via getImageProvider()
 *   - Calls provider.generateImages({ prompt, aspectRatio })
 *   - Returns { shortCircuited: false, imageUrl, base64, mimeType, provider }
 *   - Logs a success or error usage entry
 *   - Throws ImageGenerationError on provider failure
 */
export async function routeImageGeneration(params: RouteImageParams): Promise<RouteImageResult> {
  const { prompt, draftId, slot, chapterIndex, mode, userId, aspectRatio = '16:9' } = params;

  // ── prompts-only short-circuit ────────────────────────────────────────────
  if (mode === 'prompts-only') {
    logAiUsage({
      userId: userId ?? null,
      orgId: null,
      action: 'image.prompts_only',
      provider: 'none',
      model: 'none',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: 0,
      // 'success' because this is intentional — no spend, no error.
      // The shortCircuited flag in metadata distinguishes this from a real generation.
      status: 'success',
      error: null,
      metadata: {
        shortCircuited: true,
        slot,
        draftId,
        chapterIndex,
        prompt,
      },
    });

    return {
      shortCircuited: true,
      prompt,
      provider: 'none',
    };
  }

  // ── generate mode — resolve provider (may throw on config error) ─────────
  const provider = await getImageProvider();
  const providerName = provider.name;
  const startedAt = Date.now();

  try {
    const results = await provider.generateImages({
      prompt,
      numImages: 1,
      aspectRatio,
      outputMimeType: 'image/jpeg',
    });

    if (results.length === 0) {
      throw new ImageGenerationError(
        'Image generation failed: provider returned no images',
        providerName,
      );
    }

    const first = results[0];
    const imageUrl = `data:${first.mimeType};base64,${first.base64}`;

    logAiUsage({
      userId: userId ?? null,
      orgId: null,
      action: 'image.generate',
      provider: providerName,
      model: 'image',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startedAt,
      status: 'success',
      error: null,
      metadata: {
        shortCircuited: false,
        slot,
        draftId,
        chapterIndex,
        prompt,
      },
    });

    return {
      shortCircuited: false,
      prompt,
      imageUrl,
      base64: first.base64,
      mimeType: first.mimeType,
      provider: providerName,
    };
  } catch (err) {
    // Re-wrap as ImageGenerationError if it isn't already
    const imageErr =
      err instanceof ImageGenerationError
        ? err
        : new ImageGenerationError(
            `Image generation failed: ${(err as { message?: string })?.message ?? String(err)}`,
            providerName,
            err,
          );

    logAiUsage({
      userId: userId ?? null,
      orgId: null,
      action: 'image.generate',
      provider: providerName,
      model: 'image',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startedAt,
      status: 'error',
      error: imageErr.message,
      metadata: {
        shortCircuited: false,
        slot,
        draftId,
        chapterIndex,
        prompt,
      },
    });

    throw imageErr;
  }
}
