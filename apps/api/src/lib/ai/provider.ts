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

export interface AIProvider {
  name: string;
  generateContent(params: GenerateContentParams): Promise<any>;
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
