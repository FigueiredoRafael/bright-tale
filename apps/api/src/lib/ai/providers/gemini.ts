/**
 * Gemini text provider.
 * Uses @google/genai SDK. Free tier covers gemini-2.5-flash with generous
 * limits, ideal for brainstorm/research stages.
 */
import { GoogleGenAI } from '@google/genai';
import yaml from 'js-yaml';
import type { AIProvider, GenerateContentParams, AgentType } from '../provider.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;
  private model: string;
  private temperature: number;

  constructor(apiKey: string, config?: { model?: string; temperature?: number }) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = config?.model ?? 'gemini-2.5-flash';
    this.temperature = config?.temperature ?? 0.7;
  }

  async generateContent({
    agentType,
    input,
    schema,
    systemPrompt,
  }: GenerateContentParams): Promise<unknown> {
    const userPrompt = this.buildPrompt(agentType, input);
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: fullPrompt,
      config: {
        temperature: this.temperature,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) throw new Error('No content generated from Gemini');

    const parsed = JSON.parse(text);
    if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
      return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
    }
    return parsed;
  }

  private buildPrompt(agentType: AgentType, input: unknown): string {
    const yamlInput = yaml.dump(input, { lineWidth: -1 });
    return `You are a ${agentType} agent. Generate structured output based on the following input:\n\n${yamlInput}\n\nRespond with a valid JSON object only, matching the schema described above. Be thorough.`;
  }
}
