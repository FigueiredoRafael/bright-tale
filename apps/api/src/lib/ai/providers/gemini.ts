import { GoogleGenAI } from '@google/genai';
import type { Content, Part, Tool } from '@google/genai';
import type { AIProvider, GenerateContentParams, TokenUsage, ToolCall } from '../provider.js';

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
    tools,
    toolExecutor,
  }: GenerateContentParams): Promise<unknown> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const hasTools = tools && tools.length > 0 && toolExecutor;

    const geminiTools: Tool[] | undefined = hasTools
      ? [{
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.parameters,
          })),
        }]
      : undefined;

    const contents: Content[] = [
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const MAX_TOOL_TURNS = 10;
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          temperature: this.temperature,
          systemInstruction: systemPrompt || undefined,
          ...(geminiTools
            ? { tools: geminiTools }
            : { responseMimeType: 'application/json' }),
        },
      });

      const meta = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
      this.lastUsage = {
        inputTokens: meta?.promptTokenCount,
        outputTokens: meta?.candidatesTokenCount,
      };

      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0 && hasTools) {
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) contents.push(modelContent);

        const calls: ToolCall[] = functionCalls.map(fc => ({
          id: fc.id ?? '',
          name: fc.name ?? '',
          arguments: (fc.args ?? {}) as Record<string, unknown>,
        }));

        const results = await toolExecutor(calls);
        const resultById = new Map(results.map(r => [r.toolCallId, r.content]));

        const responseParts: Part[] = functionCalls.map(fc => ({
          functionResponse: {
            name: fc.name ?? '',
            id: fc.id,
            response: { result: resultById.get(fc.id ?? '') ?? '{}' },
          },
        }));

        contents.push({ role: 'user', parts: responseParts });
        continue;
      }

      const text = response.text;
      if (!text) throw new Error('No content generated from Gemini');

      const parsed = JSON.parse(text);
      if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
        return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
      }
      return parsed;
    }

    throw new Error('Gemini tool call loop exceeded maximum turns');
  }
}
