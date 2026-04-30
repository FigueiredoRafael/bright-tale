import { OpenAI } from "openai";
import type { AIProvider, GenerateContentParams, AgentType, TokenUsage, ToolCall } from "../provider.js";

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
    signal,
    tools,
    toolExecutor,
  }: GenerateContentParams): Promise<any> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const hasTools = tools && tools.length > 0 && toolExecutor;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: userMessage },
    ];

    const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = hasTools
      ? tools.map(t => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters as Record<string, unknown>,
            strict: t.strict ?? false,
          },
        }))
      : undefined;

    const MAX_TOOL_TURNS = 10;
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            messages,
            temperature: this.temperature,
            ...(openaiTools
              ? { tools: openaiTools, tool_choice: "auto" as const }
              : { response_format: { type: "json_object" as const } }),
          },
          { signal },
        );

        this.lastUsage = {
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
        };

        const choice = response.choices[0];

        if (choice.finish_reason === "tool_calls" && hasTools) {
          const toolCalls = choice.message.tool_calls ?? [];
          messages.push(choice.message as OpenAI.Chat.ChatCompletionMessageParam);

          const calls: ToolCall[] = toolCalls
            .filter((tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === 'function')
            .map(tc => ({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
            }));

          const results = await toolExecutor(calls);

          for (const result of results) {
            messages.push({
              role: "tool",
              tool_call_id: result.toolCallId,
              content: result.content,
            });
          }
          continue;
        }

        const content = choice.message?.content;
        if (!content) throw new Error("No content generated from OpenAI");

        const parsed = JSON.parse(content);
        if (schema && typeof (schema as { parse?: unknown }).parse === "function") {
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

    throw new Error("OpenAI tool call loop exceeded maximum turns");
  }
}

// Satisfy AgentType import (used transitively)
export type { AgentType };
