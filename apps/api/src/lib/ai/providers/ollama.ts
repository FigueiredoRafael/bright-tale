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
    userMessage,
  }: GenerateContentParams): Promise<unknown> {
    const userPrompt = userMessage ?? this.buildPrompt(agentType, input);
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_200_000); // 20 min

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

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
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

    // Use structured prompts for known agent types — all Ollama models
    // need explicit output examples to produce the right JSON shape.
    if (agentType === 'brainstorm') {
      return this.buildBrainstormPrompt(topic, inputObj);
    }

    const isSmallModel = this.model.includes('tinyllama') || this.model.includes(':1b') || this.model.includes(':3b');
    if (isSmallModel) {
      return this.buildSimplePrompt(agentType, topic, inputObj);
    }

    const yamlInput = yaml.dump(input, { lineWidth: -1 });
    return `You are a ${agentType} agent. Generate structured output based on the following input:\n\n${yamlInput}\n\nRespond ONLY with a valid JSON object (no markdown, no commentary). Keep output concise to avoid truncation.`;
  }

  private buildBrainstormPrompt(topic: string, input: Record<string, unknown>): string {
    const count = (input.ideasRequested as number) ?? 5;
    const ft = input.fineTuning as Record<string, string> | undefined;
    const channel = input.channel as Record<string, string> | undefined;

    let context = `Generate ${count} content ideas about "${topic}".`;
    if (ft) {
      const parts: string[] = [];
      if (ft.niche) parts.push(`Niche: ${ft.niche}`);
      if (ft.audience) parts.push(`Target audience: ${ft.audience}`);
      if (ft.tone) parts.push(`Tone: ${ft.tone}`);
      if (ft.goal) parts.push(`Goal: ${ft.goal}`);
      if (ft.constraints) parts.push(`Constraints: ${ft.constraints}`);
      if (parts.length > 0) context += '\n\n' + parts.join('\n');
    }
    if (channel) {
      const parts: string[] = [];
      if (channel.name) parts.push(`Channel: ${channel.name}`);
      if (channel.niche) parts.push(`Channel niche: ${channel.niche}`);
      if (channel.language) parts.push(`Language: ${channel.language}`);
      if (parts.length > 0) context += '\n\n' + parts.join('\n');
    }

    return `${context}

Return a JSON object with an "ideas" array and a "recommendation" object.

Example output:
{"ideas":[{"title":"Idea Title","angle":"Unique perspective","core_tension":"Why this matters","target_audience":"Who cares","search_intent":"What people search for","primary_keyword":{"term":"keyword","difficulty":"low","monthly_volume_estimate":"1000"},"scroll_stopper":"Hook line","curiosity_gap":"What makes them click","monetization":{"affiliate_angle":"Product tie-in","product_fit":"How it fits","sponsor_appeal":"Brand appeal"},"repurpose_potential":{"blog_angle":"Blog version","video_angle":"Video version","shorts_hooks":["Hook 1"],"podcast_angle":"Podcast version"},"risk_flags":["Flag 1"],"verdict":"viable","verdict_rationale":"Why this verdict"}],"recommendation":{"pick":"Idea Title","rationale":"Why this is the best pick"}}

Rules:
- Return ONLY a valid JSON object, no markdown, no commentary, no thinking
- Each idea needs ALL fields shown above
- verdict must be one of: viable, weak, experimental
- recommendation.pick must match one idea's title
- Be a skeptical content strategist — label weak ideas as "weak"
- Keep each text field under 20 words to avoid truncation
- Keep shorts_hooks to max 2 items
- Keep risk_flags to max 2 items`;
  }

  /**
   * Simplified prompt for tiny models (<3B params).
   * Uses few-shot example so model understands the exact output shape.
   */
  private buildSimplePrompt(agentType: AgentType, topic: string, input: Record<string, unknown>): string {
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
