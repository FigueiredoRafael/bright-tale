import { Anthropic } from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { AIProvider, GenerateContentParams, TokenUsage, ToolCall } from "../provider.js";

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
    tools,
    toolExecutor,
  }: GenerateContentParams): Promise<any> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const hasTools = tools && tools.length > 0 && toolExecutor;

    const anthropicTools: Tool[] | undefined = hasTools
      ? tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: {
            type: "object" as const,
            properties: t.parameters.properties,
            required: t.parameters.required ?? [],
          },
        }))
      : undefined;

    const messages: MessageParam[] = [{ role: "user", content: userMessage }];

    const MAX_TOOL_TURNS = 10;
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      try {
        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            system: systemPrompt,
            messages,
            ...(anthropicTools ? { tools: anthropicTools } : {}),
          },
          { signal },
        );

        this.lastUsage = {
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        };

        if (response.stop_reason === "tool_use" && hasTools) {
          const toolUseBlocks = response.content.filter(
            (b): b is ToolUseBlock => b.type === "tool_use",
          );
          messages.push({ role: "assistant", content: response.content });

          const calls: ToolCall[] = toolUseBlocks.map(b => ({
            id: b.id,
            name: b.name,
            arguments: b.input as Record<string, unknown>,
          }));

          const results = await toolExecutor(calls);

          const toolResults: ToolResultBlockParam[] = results.map(r => ({
            type: "tool_result" as const,
            tool_use_id: r.toolCallId,
            content: r.content,
          }));
          messages.push({ role: "user", content: toolResults });
          continue;
        }

        const textBlock = response.content.find(b => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("Unexpected response type from Anthropic");
        }

        const parsed = this.extractAndParseJson(textBlock.text);
        if (schema && typeof (schema as { parse?: unknown }).parse === "function") {
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

    throw new Error("Anthropic tool call loop exceeded maximum turns");
  }

  private extractAndParseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      // fall through
    }

    const jsonBlockMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      try { return JSON.parse(jsonBlockMatch[1]); } catch { /* fall through */ }
    }

    const codeBlockMatch = text.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1]); } catch { /* fall through */ }
    }

    return JSON.parse(text);
  }
}
