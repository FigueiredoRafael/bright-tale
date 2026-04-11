/**
 * Mock Image Provider for development and testing
 * Returns a 1x1 transparent PNG encoded as base64
 */

import type { ImageProvider, GenerateImageParams, GeneratedImageResult } from "../imageProvider.js";

// Minimal 1×1 transparent PNG (67 bytes)
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

  async generateImages(params: GenerateImageParams): Promise<GeneratedImageResult[]> {
    const count = params.numImages ?? 1;
    console.log(`[MockImageProvider] Generating ${count} mock image(s) for prompt: "${params.prompt.slice(0, 60)}..."`);

    return Array.from({ length: count }, () => ({
      base64: MOCK_PNG_BASE64,
      mimeType: "image/png" as const,
    }));
  }
}

export const mockImageProvider = new MockImageProvider();
