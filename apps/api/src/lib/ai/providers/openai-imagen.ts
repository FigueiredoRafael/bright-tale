/**
 * OpenAI Image Provider
 *
 * Uses the OpenAI SDK images API (gpt-image-1, dall-e-3).
 * Default model is gpt-image-1 — multimodal image gen, returns base64.
 *
 * Aspect ratios are mapped to the model's supported sizes since OpenAI
 * does not accept ratios directly (only fixed pixel sizes).
 */

import OpenAI from "openai";
import type { ImageProvider, GenerateImageParams, GeneratedImageResult } from "../imageProvider.js";

// OpenAI's CJS declaration resolves as a namespace on Vercel (TS2709).
// Use ReturnType<> off a factory to sidestep the type half — same fix as stripe.ts.
function createOpenAIClient(apiKey: string) { return new OpenAI({ apiKey }); }
type OpenAIClient = ReturnType<typeof createOpenAIClient>;

type SupportedSize = "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792" | "1792x1024";

function mapAspectRatio(model: string, aspectRatio: string): SupportedSize {
  // dall-e-3 supports 1024x1024, 1024x1792, 1792x1024
  if (model.startsWith("dall-e-3")) {
    switch (aspectRatio) {
      case "9:16":
        return "1024x1792";
      case "16:9":
        return "1792x1024";
      default:
        return "1024x1024";
    }
  }
  // gpt-image-1 supports 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape)
  switch (aspectRatio) {
    case "9:16":
      return "1024x1536";
    case "16:9":
      return "1536x1024";
    default:
      return "1024x1024";
  }
}

export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  private client: OpenAIClient;

  constructor(
    apiKey: string,
    private model: string = "gpt-image-1",
    private config: Record<string, unknown> = {},
  ) {
    this.client = createOpenAIClient(apiKey);
  }

  async generateImages(params: GenerateImageParams): Promise<GeneratedImageResult[]> {
    const numImages = params.numImages ?? 1;
    const aspectRatio = params.aspectRatio ?? "16:9";
    const size = mapAspectRatio(this.model, aspectRatio);
    const outputMimeType = (params.outputMimeType as "image/jpeg" | "image/png") ?? "image/jpeg";

    const isGptImage = this.model.startsWith("gpt-image");
    const baseParams = {
      model: this.model,
      prompt: params.prompt,
      n: numImages,
      size,
      ...this.config,
    } as Parameters<typeof this.client.images.generate>[0];

    const requestParams = isGptImage
      // gpt-image-1 always returns base64; format selectable.
      ? { ...baseParams, output_format: outputMimeType === "image/png" ? "png" : "jpeg" }
      // dall-e-3 needs explicit response_format=b64_json to avoid signed URLs.
      : { ...baseParams, response_format: "b64_json" as const };

    const response = await this.client.images.generate(
      requestParams as Parameters<typeof this.client.images.generate>[0],
    );

    const results: GeneratedImageResult[] = [];
    const items = "data" in response ? response.data ?? [] : [];
    for (const img of items) {
      if (img.b64_json) {
        results.push({
          base64: img.b64_json,
          mimeType: outputMimeType,
        });
      }
    }
    return results;
  }
}
