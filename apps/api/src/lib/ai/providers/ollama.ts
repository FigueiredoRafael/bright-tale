/**
 * Ollama (local) provider.
 * Talks to a local Ollama server (default http://localhost:11434) — zero cost
 * and works offline. Best paired with llama3.1:8b or qwen2.5:7b for JSON output.
 */
import yaml from 'js-yaml';
import type { AIProvider, GenerateContentParams, AgentType, TokenUsage } from '../provider.js';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  lastUsage?: TokenUsage;
  private model: string;
  private baseUrl: string;
  private temperature: number;

  constructor(config?: { model?: string; baseUrl?: string; temperature?: number }) {
    this.model = config?.model ?? 'llama3.1:8b';
    this.baseUrl = config?.baseUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
    this.temperature = config?.temperature ?? 0.7;
  }

  async generateContent({
    agentType,
    input,
    schema,
    systemPrompt,
  }: GenerateContentParams): Promise<unknown> {
    const userPrompt = this.buildPrompt(agentType, input);
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        format: 'json', // Ollama coerces output to valid JSON when set
        options: { temperature: this.temperature },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama ${res.status}: ${body || res.statusText}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    this.lastUsage = {
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
    };
    const text = data.message?.content;
    if (!text) throw new Error('No content generated from Ollama');

    const parsed = JSON.parse(text);
    if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
      return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
    }
    return parsed;
  }

  private buildPrompt(agentType: AgentType, input: unknown): string {
    const yamlInput = yaml.dump(input, { lineWidth: -1 });
    return `You are a ${agentType} agent. Generate structured output based on the following input:\n\n${yamlInput}\n\nRespond ONLY with a valid JSON object (no markdown, no commentary). Be thorough.`;
  }
}
