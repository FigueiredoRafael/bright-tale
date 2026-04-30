/**
 * AI Provider Interface
 *
 * Standardized interface for all AI providers (OpenAI, Anthropic, etc.)
 * Supports content generation with schema validation
 */

export type AgentType = "brainstorm" | "research" | "production" | "review" | "assets";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  strict?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export type ToolExecutor = (calls: ToolCall[]) => Promise<ToolResult[]>;

export interface GenerateContentParams {
  agentType: AgentType;
  systemPrompt: string;
  userMessage: string;
  schema?: unknown;
  signal?: AbortSignal;
  tools?: ToolDefinition[];
  toolExecutor?: ToolExecutor;
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
