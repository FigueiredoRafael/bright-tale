/**
 * OpenAI Provider Implementation
 *
 * Implements AIProvider interface for OpenAI's GPT models
 * Supports structured JSON output with schema validation
 */

import { OpenAI } from "openai";
import yaml from "js-yaml";
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
    agentType,
    input,
    schema,
    systemPrompt,
  }: GenerateContentParams): Promise<any> {
    try {
      // Build prompt from input
      const userPrompt = this.buildPrompt(agentType, input);

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

      // Validate with Zod schema
      const validated = (schema as any).parse(parsed);

      return validated;
    } catch (error: any) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API Error: ${error.message}`);
      }
      throw error;
    }
  }

  private buildPrompt(agentType: AgentType, input: any): string {
    // Convert input to YAML for better readability
    const yamlInput = yaml.dump(input, { lineWidth: -1 });

    return `You are a ${agentType} agent. Generate structured output based on the following input:

${yamlInput}

Return your response as a valid JSON object that matches the expected schema. Be thorough and creative.`;
  }
}
