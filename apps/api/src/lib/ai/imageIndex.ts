/**
 * Image Provider Factory
 *
 * Resolves the active image generation provider using the same priority
 * pattern as the text AI provider factory (src/lib/ai/index.ts):
 *
 * 1. IMAGE_PROVIDER=mock  → mock provider (dev/testing)
 * 2. IMAGE_PROVIDER=gemini + GEMINI_API_KEY env → use ENV key
 * 3. Otherwise → fetch active ImageGeneratorConfig from DB, decrypt key
 * 4. Fallback → mock provider with console warning
 */

import { mockImageProvider } from "./providers/mock-imagen";
import { GeminiImagenProvider } from "./providers/gemini-imagen";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { ImageProvider } from "./imageProvider";

export async function getImageProvider(): Promise<ImageProvider> {
  const envProvider = process.env.IMAGE_PROVIDER;

  if (envProvider === "mock") {
    return mockImageProvider;
  }

  if (envProvider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("IMAGE_PROVIDER=gemini but GEMINI_API_KEY not set, falling back to mock");
      return mockImageProvider;
    }
    const model = process.env.IMAGE_GENERATION_MODEL ?? "gemini-2.5-flash-image";
    return new GeminiImagenProvider(apiKey, model);
  }

  // Fetch from database
  try {
    const config = await prisma.imageGeneratorConfig.findFirst({
      where: { is_active: true },
      orderBy: { updated_at: "desc" },
    });

    if (!config) {
      console.warn("No active ImageGeneratorConfig found in database, falling back to mock");
      return mockImageProvider;
    }

    const apiKey = decrypt(config.api_key);
    const providerConfig = config.config_json ? JSON.parse(config.config_json) : {};

    switch (config.provider) {
      case "gemini":
        return new GeminiImagenProvider(apiKey, config.model, providerConfig);

      default:
        console.warn(`Unknown image provider type: ${config.provider}, falling back to mock`);
        return mockImageProvider;
    }
  } catch (error) {
    console.error("Error loading image provider from database:", error);
    return mockImageProvider;
  }
}
