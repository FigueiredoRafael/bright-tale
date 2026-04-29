/**
 * Anthropic Provider Implementation
 *
 * Implements AIProvider interface for Anthropic's Claude models
 * Parses YAML responses and validates with schema
 */

import { Anthropic } from "@anthropic-ai/sdk";
import type { AIProvider, GenerateContentParams, TokenUsage } from "../provider.js";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  lastUsage?: TokenUsage;
  private client: Anthropic;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(
    apiKey: string,
    config?: { model?: string; temperature?: number; maxTokens?: number },
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = config?.model || "claude-3-5-sonnet-20241022";
    this.temperature = config?.temperature ?? 0.7;
    this.maxTokens = config?.maxTokens || 4096;
  }

  async generateContent({
    schema,
    systemPrompt,
    userMessage,
    signal,
  }: GenerateContentParams): Promise<any> {
    try {
      // Pre-call fail-fast guard: check if already aborted
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Use provided user message
      const userPrompt = userMessage;

      // Call Anthropic API with signal support (SDK >= 0.20)
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }, { signal });

      this.lastUsage = {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      };

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }

      // Parse JSON from response
      const parsed = this.extractAndParseJson(content.text);

      // Validate with Zod schema only when caller provided one — schema is
      // optional per GenerateContentParams.
      if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
        return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
      }
      return parsed;
    } catch (error: any) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API Error: ${error.message}`);
      }
      throw error;
    }
  }


  private extractAndParseJson(text: string): any {
    // Try to parse as direct JSON first
    try {
      return JSON.parse(text);
    } catch {
      // Fall through to markdown extraction
    }

    // Try to extract JSON from markdown code blocks
    const jsonBlockMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch {
        // Fall through to generic code blocks
      }
    }

    // Try to extract from generic code blocks
    const codeBlockMatch = text.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        // Fall through to raw text
      }
    }

    // Last resort: try to parse the raw text as JSON
    return JSON.parse(text);
  }
}
