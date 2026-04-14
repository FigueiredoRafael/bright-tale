/**
 * Ollama (local) provider.
 * Talks to a local Ollama server (default http://localhost:11434) — zero cost
 * and works offline. Best paired with llama3.1:8b or qwen2.5:7b for JSON output.
 */
import yaml from 'js-yaml';
import type { AIProvider, GenerateContentParams, AgentType } from '../provider.js';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
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
        options: {
          temperature: this.model.includes('tinyllama') ? 0.3 : this.temperature,
          num_predict: 4096,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama ${res.status}: ${body || res.statusText}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content;
    if (!text) throw new Error('No content generated from Ollama');

    console.log(`[Ollama] Raw response (${this.model}, ${text.length} chars):\n${text.slice(0, 1000)}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Attempt to repair truncated JSON (small models run out of tokens mid-output)
      console.warn(`[Ollama] JSON parse failed, attempting repair for ${this.model}...`);
      const repaired = repairTruncatedJson(text);
      if (repaired) {
        console.log(`[Ollama] JSON repaired successfully`);
        parsed = repaired;
      } else {
        console.error(`[Ollama] JSON repair failed. Raw text:\n${text.slice(0, 2000)}`);
        throw new Error(`Ollama returned invalid JSON from ${this.model}. Model may be too small for structured output.`);
      }
    }

    if (schema && typeof (schema as { parse?: unknown }).parse === 'function') {
      return (schema as { parse: (v: unknown) => unknown }).parse(parsed);
    }
    return parsed;
  }

  private buildPrompt(agentType: AgentType, input: unknown): string {
    const inputObj = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
    const topic = (inputObj.topic as string) ?? '';
    const isSmallModel = this.model.includes('tinyllama') || this.model.includes(':1b') || this.model.includes(':3b');

    if (isSmallModel) {
      return this.buildSimplePrompt(agentType, topic, inputObj);
    }

    const yamlInput = yaml.dump(input, { lineWidth: -1 });
    return `You are a ${agentType} agent. Generate structured output based on the following input:\n\n${yamlInput}\n\nRespond ONLY with a valid JSON object (no markdown, no commentary). Keep output concise to avoid truncation.`;
  }

  /**
   * Simplified prompt for tiny models (<3B params).
   * Uses few-shot example so model understands the exact output shape.
   */
  private buildSimplePrompt(agentType: AgentType, topic: string, input: Record<string, unknown>): string {
    if (agentType === 'brainstorm') {
      const count = (input.ideasRequested as number) ?? 3;
      return `Generate ${count} content ideas about "${topic}".

Example output:
{"ideas":[{"title":"Example Title","core_tension":"Why this matters","target_audience":"Who cares","verdict":"viable"}]}

Rules:
- Return ONLY a JSON object with an "ideas" array
- Each idea needs: title, core_tension, target_audience, verdict (viable/weak/experimental)
- Keep each field under 30 words
- No markdown, no explanation`;
    }

    if (agentType === 'research') {
      return `Research the topic "${topic}". Find evidence for or against it.

Return JSON: {"cards":[{"title":"Finding","summary":"What was found","source":"Where from","credibility":"high/medium/low"}]}

Keep it short. Max 3 cards. No markdown.`;
    }

    if (agentType === 'review') {
      return `Review this content and score it 0-100.

Return JSON: {"overall_verdict":"approved","blog_review":{"score":85,"strengths":["good"],"critical_issues":[],"minor_issues":["fix typo"]}}

No markdown.`;
    }

    // Generic fallback
    return `You are a ${agentType} agent. Topic: "${topic}". Return a short JSON object with your output. No markdown.`;
  }
}

/**
 * Attempt to repair JSON truncated mid-output (common with small models).
 * Strategy: close all open brackets/braces/strings from right to left.
 */
function repairTruncatedJson(text: string): unknown | null {
  let s = text.trim();

  // Remove trailing incomplete key-value (e.g., `"key": "incomplete`)
  s = s.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
  s = s.replace(/,\s*"[^"]*"\s*$/, '');
  s = s.replace(/,\s*$/, '');

  // Count open vs close brackets
  const opens = { '{': 0, '[': 0 };
  const closes: Record<string, string> = { '{': '}', '[': ']' };
  let inString = false;
  let escape = false;

  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') opens['{']++;
    if (ch === '}') opens['{']--;
    if (ch === '[') opens['[']++;
    if (ch === ']') opens['[']--;
  }

  // Close unclosed string
  if (inString) s += '"';

  // Append missing closing brackets in reverse order
  // Track what was opened in order to close in reverse
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  while (stack.length > 0) {
    const open = stack.pop()!;
    s += closes[open];
  }

  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
