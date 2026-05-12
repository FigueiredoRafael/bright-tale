/**
 * Ollama (local) provider.
 * Talks to a local Ollama server (default http://localhost:11434) — zero cost
 * and works offline. Best paired with llama3.1:8b or qwen2.5:7b for JSON output.
 */
import { NonRetriableError } from 'inngest';
import type { AIProvider, GenerateContentParams, TokenUsage } from '../provider.js';

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
    schema,
    systemPrompt,
    userMessage,
    signal,
  }: GenerateContentParams): Promise<unknown> {
    // Pre-call fail-fast guard: check if already aborted
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userMessage });

    // Merge external signal with internal timeout controller
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_200_000); // 20 min

    // If external signal aborts, abort our controller too
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          format: 'json',
          options: {
            temperature: this.model.includes('tinyllama') ? 0.3 : this.temperature,
            num_predict: 8192,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 404) {
          throw new NonRetriableError(
            `Ollama model "${this.model}" is not installed locally. ` +
            `Run \`ollama pull ${this.model}\` to install it, or reconfigure the provider in your pipeline settings.`,
          );
        }
        throw new Error(`Ollama ${res.status}: ${body || res.statusText}`);
      }

      // Stream response — accumulate content and detect degenerate output
      let text = '';
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;
      let degenerateCount = 0;
      const MAX_DEGENERATE = 20; // abort after 20 consecutive repeated tokens

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body from Ollama');
      const decoder = new TextDecoder();

      let lastChunk = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
              prompt_eval_count?: number;
              eval_count?: number;
            };

            const content = data.message?.content ?? '';
            text += content;

            // Detect degenerate output (repeated commas, spaces, etc.)
            if (content.trim() === lastChunk.trim() && content.trim().length <= 2) {
              degenerateCount++;
              if (degenerateCount >= MAX_DEGENERATE) {
                console.warn(`[Ollama] Degenerate output detected after ${text.length} chars — aborting stream`);
                reader.cancel();
                // Strip trailing degenerate tokens
                text = text.replace(/[,\s]+$/, '');
                break;
              }
            } else {
              degenerateCount = 0;
            }
            lastChunk = content;

            if (data.done) {
              inputTokens = data.prompt_eval_count;
              outputTokens = data.eval_count;
            }
          } catch {
            // ignore malformed stream chunks
          }
        }

        if (degenerateCount >= MAX_DEGENERATE) break;
      }

      this.lastUsage = { inputTokens, outputTokens };

      if (!text) throw new Error('No content generated from Ollama');

      console.log(`[Ollama] Raw response (${this.model}, ${text.length} chars):\n${text.slice(0, 1000)}`);

      // Many local models wrap structured output in ```json ... ``` fences
      // despite the format=json request. Strip them before parsing.
      const unfenced = stripCodeFence(text);

      let parsed: unknown;
      try {
        parsed = JSON.parse(unfenced);
      } catch {
        // Attempt to repair truncated JSON (small models run out of tokens mid-output)
        console.warn(`[Ollama] JSON parse failed, attempting repair for ${this.model}...`);
        const repaired = repairTruncatedJson(unfenced);
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
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) so JSON.parse
 * can consume the inner payload. Returns the original text if no fence is found.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
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
