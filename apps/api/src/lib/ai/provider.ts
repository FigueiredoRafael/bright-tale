/**
 * AI Provider Interface
 *
 * Standardized interface for all AI providers (OpenAI, Anthropic, etc.)
 * Supports content generation with schema validation
 */

export type AgentType = "brainstorm" | "research" | "production" | "review";

export interface GenerateContentParams {
  agentType: AgentType;
  input: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  systemPrompt?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  name: string;
  generateContent(params: GenerateContentParams): Promise<any>;
  /** Populated best-effort after each generateContent call. Undefined for
   *  providers that don't report usage (e.g. Ollama). */
  lastUsage?: TokenUsage;
}

export interface AIProviderConfig {
  provider: string;
  apiKey: string;
  config?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
  };
}
