/**
 * Gemini text provider.
 * Uses @google/genai SDK. Free tier covers gemini-2.5-flash with generous
 * limits, ideal for brainstorm/research stages.
 */
import { GoogleGenAI } from '@google/genai';
import type { AIProvider, GenerateContentParams, TokenUsage } from '../provider.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  lastUsage?: TokenUsage;
  private client: GoogleGenAI;
  private model: string;
  private temperature: number;

  constructor(apiKey: string, config?: { model?: string; temperature?: number }) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = config?.model ?? 'gemini-2.5-flash';
    this.temperature = config?.temperature ?? 0.7;
  }

  async generateContent({
    schema,
    systemPrompt,
    userMessage,
    signal,
  }: GenerateContentParams): Promise<unknown> {
    // Pre-call fail-fast guard: check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userMessage}` : userMessage;

    // TODO: signal not threaded — GoogleGenAI SDK does not expose per-request signal in generateContent.
    // In-flight requests will not be cancelled until completion or SDK-level timeout.
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: fullPrompt,
      config: {
        temperature: this.temperature,
        responseMimeType: 'application/json',
      },
    });

    const meta = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
    this.lastUsage = {
      inputTokens: meta?.promptTokenCount,
      outputTokens: meta?.candidatesTokenCount,
    };

    const text = response.text;
    if (!text) throw new Error('No content generated from Gemini');

    const parsed = JSON.parse(text);
    if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
      return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
    }
    return parsed;
  }

}
