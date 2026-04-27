/**
 * OpenAI Provider Implementation
 *
 * Implements AIProvider interface for OpenAI's GPT models
 * Supports structured JSON output with schema validation
 */

import { OpenAI } from "openai";
import type { AIProvider, GenerateContentParams, AgentType, TokenUsage } from "../provider.js";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  lastUsage?: TokenUsage;
  private client: OpenAI;
  private model: string;
  private temperature: number;

  constructor(
    apiKey: string,
    config?: { model?: string; temperature?: number },
  ) {
    this.client = new OpenAI({ apiKey });
    this.model = config?.model || "gpt-4o";
    this.temperature = config?.temperature ?? 0.7;
  }

  async generateContent({
    schema,
    systemPrompt,
    userMessage,
  }: GenerateContentParams): Promise<any> {
    try {
      // Use provided user message
      const userPrompt = userMessage;

      // Call OpenAI with JSON mode
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          ...(systemPrompt
            ? [{ role: "system" as const, content: systemPrompt }]
            : []),
          { role: "user" as const, content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: this.temperature,
      });

      this.lastUsage = {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      };

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content generated from OpenAI");
      }

      // Parse JSON response
      const parsed = JSON.parse(content);

      // Validate with Zod schema only when caller provided one — schema is
      // optional per GenerateContentParams; some agents validate downstream.
      if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
        return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
      }
      return parsed;
    } catch (error: any) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API Error: ${error.message}`);
      }
      throw error;
    }
  }

}
