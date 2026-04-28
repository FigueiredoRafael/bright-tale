/**
 * Image Provider Factory
 *
 * Resolves an image generation provider. Callers can request a specific
 * provider per request (gemini | openai); falling back to the env/DB
 * priority chain when no preference is given.
 *
 * Priority (no preference):
 *   1. IMAGE_PROVIDER=mock     → mock provider (dev/testing)
 *   2. IMAGE_PROVIDER=gemini   → Gemini via env key
 *   3. IMAGE_PROVIDER=openai   → OpenAI via env key
 *   4. Any GEMINI_API_KEY/GOOGLE_AI_KEY env present → Gemini
 *   5. OPENAI_API_KEY env present → OpenAI
 *   6. Active ImageGeneratorConfig row → DB-backed provider
 *   7. Mock fallback with console warning
 */

import { mockImageProvider } from "./providers/mock-imagen.js";
import { GeminiImagenProvider } from "./providers/gemini-imagen.js";
import { OpenAIImageProvider } from "./providers/openai-imagen.js";
import { createServiceClient } from "../supabase/index.js";
import { decrypt } from "../crypto.js";
import type { ImageProvider } from "./imageProvider.js";

export type ImageProviderId = "gemini" | "openai";

function buildGeminiFromEnv(): ImageProvider | null {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_KEY;
  if (!key) return null;
  const model = process.env.IMAGE_GENERATION_MODEL ?? "gemini-2.5-flash-image";
  return new GeminiImagenProvider(key, model);
}

function buildOpenAIFromEnv(): ImageProvider | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  return new OpenAIImageProvider(key, model);
}

async function buildFromDb(requested?: ImageProviderId): Promise<ImageProvider | null> {
  try {
    const sb = createServiceClient();
    let query = sb
      .from('image_generator_configs')
      .select('*')
      .eq('is_active', true);
    if (requested) query = query.eq('provider', requested);

    const { data: config, error } = await query
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Error fetching image provider config:", error.message);
      return null;
    }
    if (!config) return null;

    const apiKey = decrypt(config.api_key);
    const providerConfig = config.config_json ? JSON.parse(config.config_json) : {};

    switch (config.provider) {
      case "gemini":
        return new GeminiImagenProvider(apiKey, config.model, providerConfig);
      case "openai":
        return new OpenAIImageProvider(apiKey, config.model, providerConfig);
      default:
        console.warn(`Unknown image provider type: ${config.provider}`);
        return null;
    }
  } catch (error) {
    console.error("Error loading image provider from database:", error);
    return null;
  }
}

export async function getImageProvider(requested?: ImageProviderId): Promise<ImageProvider> {
  // Per-request override: try env first for the requested provider, then DB.
  if (requested === "gemini") {
    return buildGeminiFromEnv() ?? (await buildFromDb("gemini")) ?? mockImageProvider;
  }
  if (requested === "openai") {
    return buildOpenAIFromEnv() ?? (await buildFromDb("openai")) ?? mockImageProvider;
  }

  const envProvider = process.env.IMAGE_PROVIDER;
  if (envProvider === "mock") return mockImageProvider;

  if (envProvider === "gemini") {
    const p = buildGeminiFromEnv();
    if (p) return p;
    console.warn("IMAGE_PROVIDER=gemini but neither GEMINI_API_KEY nor GOOGLE_AI_KEY is set, falling back to mock");
    return mockImageProvider;
  }

  if (envProvider === "openai") {
    const p = buildOpenAIFromEnv();
    if (p) return p;
    console.warn("IMAGE_PROVIDER=openai but OPENAI_API_KEY is not set, falling back to mock");
    return mockImageProvider;
  }

  // No explicit IMAGE_PROVIDER set: prefer Gemini → OpenAI → DB → mock.
  const gemini = buildGeminiFromEnv();
  if (gemini) return gemini;
  const openai = buildOpenAIFromEnv();
  if (openai) return openai;

  const dbProvider = await buildFromDb();
  if (dbProvider) return dbProvider;

  console.warn("No active ImageGeneratorConfig found in database, falling back to mock");
  return mockImageProvider;
}
