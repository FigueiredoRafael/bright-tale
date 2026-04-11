import mockAdapter from "./mock";
import { ProviderAIAdapter } from "./providerAdapter";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { createServiceClient } from "@/lib/supabase";
import { decrypt } from "@/lib/crypto";
import type { AIAdapter } from "./adapter";

/**
 * Get AI Adapter based on environment or database config
 *
 * Priority:
 * 1. If AI_ENABLED=false → mock adapter
 * 2. If AI_PROVIDER env var set → use that provider
 * 3. Otherwise → fetch active provider from database
 */
export async function getAIAdapter(): Promise<AIAdapter> {
  // Check if AI is disabled
  if (process.env.AI_ENABLED === "false") {
    return mockAdapter;
  }

  // Check for env-based provider
  const envProvider = process.env.AI_PROVIDER;
  if (envProvider === "mock") {
    return mockAdapter;
  }

  if (envProvider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "AI_PROVIDER=openai but OPENAI_API_KEY not set, falling back to mock",
      );
      return mockAdapter;
    }
    const provider = new OpenAIProvider(apiKey);
    return new ProviderAIAdapter(provider);
  }

  if (envProvider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn(
        "AI_PROVIDER=anthropic but ANTHROPIC_API_KEY not set, falling back to mock",
      );
      return mockAdapter;
    }
    const provider = new AnthropicProvider(apiKey);
    return new ProviderAIAdapter(provider);
  }

  // Fetch from database
  try {
    const sb = createServiceClient();
    const { data: config, error } = await sb
      .from('ai_provider_configs')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Error fetching AI provider config:", error.message);
      return mockAdapter;
    }

    if (!config) {
      console.warn(
        "No active AI provider config found in database, falling back to mock",
      );
      return mockAdapter;
    }

    // Decrypt API key
    const apiKey = decrypt(config.api_key);

    // Parse optional config JSON
    const providerConfig = config.config_json
      ? JSON.parse(config.config_json)
      : {};

    // Create provider based on type
    switch (config.provider) {
      case "openai":
        const openaiProvider = new OpenAIProvider(apiKey, providerConfig);
        return new ProviderAIAdapter(openaiProvider);

      case "anthropic":
        const anthropicProvider = new AnthropicProvider(apiKey, providerConfig);
        return new ProviderAIAdapter(anthropicProvider);

      default:
        console.warn(
          `Unknown provider type: ${config.provider}, falling back to mock`,
        );
        return mockAdapter;
    }
  } catch (error) {
    console.error("Error loading AI provider from database:", error);
    return mockAdapter;
  }
}

/**
 * Synchronous version that returns mock adapter
 * Use getAIAdapter() for production
 */
export function getAIAdapterSync(): AIAdapter {
  return mockAdapter;
}
