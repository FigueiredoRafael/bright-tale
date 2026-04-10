/**
 * Gemini Imagen Provider
 *
 * Uses @google/genai SDK to generate images via Google's Imagen and Gemini models.
 * Supports:
 *   - gemini-2.5-flash-image: Recommended, uses generateContent with IMAGE modality
 *   - imagen-3.0-generate-002: High-quality image-only generation via generateImages
 */

import type { ImageProvider, GenerateImageParams, GeneratedImageResult } from "../imageProvider";

export class GeminiImagenProvider implements ImageProvider {
  readonly name = "gemini";

  // Models that use generateContent with IMAGE modality (not generateImages)
  private static readonly GEMINI_CONTENT_MODELS = [
    "gemini-2.5-flash-image",
  ];

  constructor(
    private apiKey: string,
    private model: string = "gemini-2.5-flash-image",
    private config: Record<string, unknown> = {},
  ) {}

  async generateImages(params: GenerateImageParams): Promise<GeneratedImageResult[]> {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const numImages = params.numImages ?? 1;
    const outputMimeType = (params.outputMimeType as "image/jpeg" | "image/png") ?? "image/jpeg";
    const aspectRatio = params.aspectRatio ?? "16:9";

    if (GeminiImagenProvider.GEMINI_CONTENT_MODELS.includes(this.model)) {
      return this.generateWithGemini(ai, params.prompt, numImages, outputMimeType);
    }

    return this.generateWithImagen(ai, params.prompt, numImages, outputMimeType, aspectRatio);
  }

  private async generateWithImagen(
    ai: InstanceType<Awaited<typeof import("@google/genai")>["GoogleGenAI"]>,
    prompt: string,
    numImages: number,
    outputMimeType: "image/jpeg" | "image/png",
    aspectRatio: string,
  ): Promise<GeneratedImageResult[]> {
    const response = await ai.models.generateImages({
      model: this.model,
      prompt,
      config: {
        numberOfImages: numImages,
        outputMimeType,
        aspectRatio,
        ...this.config,
      },
    });

    const results: GeneratedImageResult[] = [];
    for (const generatedImage of response.generatedImages ?? []) {
      const imageBytes = generatedImage.image?.imageBytes;
      if (imageBytes) {
        results.push({
          base64: typeof imageBytes === "string" ? imageBytes : Buffer.from(imageBytes).toString("base64"),
          mimeType: outputMimeType,
        });
      }
    }
    return results;
  }

  private async generateWithGemini(
    ai: InstanceType<Awaited<typeof import("@google/genai")>["GoogleGenAI"]>,
    prompt: string,
    numImages: number,
    outputMimeType: "image/jpeg" | "image/png",
  ): Promise<GeneratedImageResult[]> {
    const results: GeneratedImageResult[] = [];

    for (let i = 0; i < numImages; i++) {
      const response = await ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseModalities: ["IMAGE"],
          ...this.config,
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          results.push({
            base64: part.inlineData.data,
            mimeType: (part.inlineData.mimeType as "image/jpeg" | "image/png") ?? outputMimeType,
          });
        }
      }
    }
    return results;
  }
}
