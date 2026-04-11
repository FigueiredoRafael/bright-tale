/**
 * Image Generation Provider Interface
 *
 * Defines the contract for all AI image generation providers (Gemini Imagen, etc.)
 */

export interface GenerateImageParams {
  prompt: string;
  numImages?: number;      // default 1
  aspectRatio?: string;    // "16:9" | "1:1" | "9:16" | "4:3"
  outputMimeType?: string; // "image/jpeg" | "image/png"
}

export interface GeneratedImageResult {
  base64: string;   // Base64-encoded image data (no data URL prefix)
  mimeType: string; // "image/jpeg" | "image/png"
}

export interface ImageProvider {
  readonly name: string;
  generateImages(params: GenerateImageParams): Promise<GeneratedImageResult[]>;
}
