/**
 * Anthropic Provider Implementation
 *
 * Implements AIProvider interface for Anthropic's Claude models
 * Parses YAML responses and validates with schema
 */

import { Anthropic } from "@anthropic-ai/sdk";
import yaml from "js-yaml";
import type { AIProvider, GenerateContentParams, AgentType, TokenUsage } from "../provider.js";

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
    agentType,
    input,
    schema,
    systemPrompt,
    userMessage,
  }: GenerateContentParams): Promise<any> {
    try {
      // Build prompt from input
      const userPrompt = userMessage ?? this.buildPrompt(agentType, input);

      // Call Anthropic API
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
      });

      this.lastUsage = {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      };

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }

      let parsed: any;

      // If userMessage was provided, parse as JSON; otherwise parse as YAML
      if (userMessage) {
        // Try to parse as JSON (from markdown blocks or direct)
        parsed = this.extractAndParseJson(content.text);
      } else {
        // Extract YAML from response (Claude often wraps it in markdown)
        const yamlContent = this.extractYaml(content.text);
        // Parse YAML
        parsed = yaml.load(yamlContent) as any;
      }

      // Validate with Zod schema
      const validated = (schema as any).parse(parsed);

      return validated;
    } catch (error: any) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API Error: ${error.message}`);
      }
      throw error;
    }
  }

  private buildPrompt(agentType: AgentType, input: any): string {
    // Convert input to YAML
    const yamlInput = yaml.dump(input, { lineWidth: -1 });

    return `You are a ${agentType} agent. Generate structured YAML output based on the following input:

${yamlInput}

Return your response as valid YAML. Be thorough and creative. Format your response properly with correct YAML syntax.`;
  }

  private extractYaml(text: string): string {
    // Try to extract YAML from markdown code blocks
    const yamlBlockMatch = text.match(/```ya?ml\n([\s\S]*?)\n```/);
    if (yamlBlockMatch) {
      return yamlBlockMatch[1];
    }

    // Try to extract from generic code blocks
    const codeBlockMatch = text.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }

    // Return as-is if no code blocks found
    return text;
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
