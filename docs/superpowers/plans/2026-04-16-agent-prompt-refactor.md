# Agent Prompt Architecture Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate static agent instructions (system prompt) from dynamic runtime data (user message) with shared prompt builders, making all providers thin JSON transport layers.

**Architecture:** New `prompts/` directory with per-agent builder functions. `GenerateContentParams` gains `userMessage` field (Phase 1: optional alongside `input`, Phase 3: required, `input` removed). Providers lose all `buildPrompt` methods and YAML parsing. Agent DB prompts get refactored to output-contract-only with field quality guidance.

**Tech Stack:** TypeScript, Vitest, Supabase (agent_prompts table), Fastify

---

## Phase 1 — Brainstorm + Interface Change

### Task 1: Update GenerateContentParams interface

**Files:**
- Modify: `apps/api/src/lib/ai/provider.ts`

- [ ] **Step 1: Add `userMessage` field to GenerateContentParams**

```typescript
// apps/api/src/lib/ai/provider.ts — replace the interface (around line 10)
export interface GenerateContentParams {
  agentType: AgentType;
  input?: unknown;
  schema?: unknown;
  systemPrompt?: string;
  /** Pre-built user message from prompts/ builders. When set, providers use this
   *  instead of building their own prompt from `input`. */
  userMessage?: string;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors (field is optional, all existing callers still work)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/ai/provider.ts
git commit -m "refactor(ai): add userMessage field to GenerateContentParams"
```

---

### Task 2: Create brainstorm prompt builder

**Files:**
- Create: `apps/api/src/lib/ai/prompts/brainstorm.ts`
- Create: `apps/api/src/lib/ai/__tests__/prompts-brainstorm.test.ts`

- [ ] **Step 1: Write tests for buildBrainstormMessage**

```typescript
// apps/api/src/lib/ai/__tests__/prompts-brainstorm.test.ts
import { describe, it, expect } from 'vitest';
import { buildBrainstormMessage } from '../prompts/brainstorm.js';

describe('buildBrainstormMessage', () => {
  it('builds message with topic only', () => {
    const msg = buildBrainstormMessage({ topic: 'AI in healthcare' });
    expect(msg).toContain('AI in healthcare');
    expect(msg).toContain('5'); // default count
    expect(msg).toContain('JSON');
  });

  it('includes ideas count', () => {
    const msg = buildBrainstormMessage({ topic: 'test', ideasRequested: 3 });
    expect(msg).toContain('3');
  });

  it('includes fine-tuning context', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      fineTuning: {
        niche: 'technology',
        audience: 'developers',
        tone: 'casual',
        goal: 'engage',
        constraints: 'avoid clickbait',
      },
    });
    expect(msg).toContain('technology');
    expect(msg).toContain('developers');
    expect(msg).toContain('casual');
    expect(msg).toContain('engage');
    expect(msg).toContain('avoid clickbait');
  });

  it('includes channel context', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      channel: {
        name: 'BrightCurios',
        niche: 'Science',
        language: 'pt-BR',
        tone: 'Curious',
      },
    });
    expect(msg).toContain('BrightCurios');
    expect(msg).toContain('pt-BR');
  });

  it('omits empty fine-tuning fields', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      fineTuning: { niche: '', tone: '', audience: '', goal: '', constraints: '' },
    });
    expect(msg).not.toContain('Niche:');
    expect(msg).not.toContain('Tone:');
  });

  it('includes reference URL when provided', () => {
    const msg = buildBrainstormMessage({
      topic: 'test',
      referenceUrl: 'https://example.com/article',
    });
    expect(msg).toContain('https://example.com/article');
  });

  it('handles no topic gracefully', () => {
    const msg = buildBrainstormMessage({});
    expect(msg).toContain('content ideas');
    expect(msg).toContain('JSON');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-brainstorm.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement buildBrainstormMessage**

```typescript
// apps/api/src/lib/ai/prompts/brainstorm.ts

export interface BrainstormInput {
  topic?: string;
  ideasRequested?: number;
  fineTuning?: {
    niche?: string;
    tone?: string;
    audience?: string;
    goal?: string;
    constraints?: string;
  };
  referenceUrl?: string;
  channel?: {
    name?: string;
    niche?: string;
    language?: string;
    tone?: string;
  };
}

export function buildBrainstormMessage(input: BrainstormInput): string {
  const count = input.ideasRequested ?? 5;
  const topic = input.topic?.trim();

  const lines: string[] = [];

  // Main instruction
  if (topic) {
    lines.push(`Generate ${count} content ideas about "${topic}".`);
  } else {
    lines.push(`Generate ${count} content ideas.`);
  }

  // Fine-tuning context
  if (input.fineTuning) {
    const ft = input.fineTuning;
    const parts: string[] = [];
    if (ft.audience) parts.push(`- Audience: ${ft.audience}`);
    if (ft.niche) parts.push(`- Niche: ${ft.niche}`);
    if (ft.tone) parts.push(`- Tone: ${ft.tone}`);
    if (ft.goal) parts.push(`- Goal: ${ft.goal}`);
    if (ft.constraints) parts.push(`- Constraints: ${ft.constraints}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push('Context:');
      lines.push(...parts);
    }
  }

  // Reference URL
  if (input.referenceUrl) {
    lines.push('');
    lines.push(`Reference content to model from: ${input.referenceUrl}`);
  }

  // Channel context
  if (input.channel) {
    const ch = input.channel;
    const parts: string[] = [];
    if (ch.name) parts.push(`Channel: ${ch.name}`);
    if (ch.niche) parts.push(`Niche: ${ch.niche}`);
    if (ch.language) parts.push(`Language: ${ch.language}`);
    if (ch.tone) parts.push(`Tone: ${ch.tone}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push(parts.join('\n'));
    }
  }

  // Output instruction
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-brainstorm.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/prompts/brainstorm.ts apps/api/src/lib/ai/__tests__/prompts-brainstorm.test.ts
git commit -m "feat(ai): add brainstorm prompt builder with tests"
```

---

### Task 3: Update providers to use userMessage when available

**Files:**
- Modify: `apps/api/src/lib/ai/providers/openai.ts`
- Modify: `apps/api/src/lib/ai/providers/anthropic.ts`
- Modify: `apps/api/src/lib/ai/providers/gemini.ts`
- Modify: `apps/api/src/lib/ai/providers/ollama.ts`

- [ ] **Step 1: Update OpenAI provider**

In `apps/api/src/lib/ai/providers/openai.ts`, in `generateContent`, replace the line that calls `buildPrompt` (around line 28):

```typescript
// BEFORE:
const userPrompt = this.buildPrompt(agentType, input);

// AFTER:
const userPrompt = userMessage ?? this.buildPrompt(agentType, input);
```

Also update the method signature destructuring to include `userMessage`:

```typescript
// BEFORE:
async generateContent({ agentType, input, schema, systemPrompt }: GenerateContentParams): Promise<unknown> {

// AFTER:
async generateContent({ agentType, input, schema, systemPrompt, userMessage }: GenerateContentParams): Promise<unknown> {
```

- [ ] **Step 2: Update Anthropic provider**

In `apps/api/src/lib/ai/providers/anthropic.ts`, same pattern. Update destructuring and the prompt line:

```typescript
// BEFORE:
async generateContent({ agentType, input, schema, systemPrompt }: GenerateContentParams): Promise<unknown> {
  // ...
  const userPrompt = this.buildPrompt(agentType, input);

// AFTER:
async generateContent({ agentType, input, schema, systemPrompt, userMessage }: GenerateContentParams): Promise<unknown> {
  // ...
  const userPrompt = userMessage ?? this.buildPrompt(agentType, input);
```

Additionally, when `userMessage` is provided, skip YAML parsing and parse JSON instead. Find the response parsing section (after the API call, around line 55-70):

```typescript
// AFTER the API call, replace the YAML extraction/parsing block:
const rawText = response.content
  .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
  .map((block) => block.text)
  .join('\n');

let parsed: unknown;
if (userMessage) {
  // New path: JSON response
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Try extracting JSON from markdown blocks
    const jsonMatch = rawText.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Anthropic returned invalid JSON: ${rawText.slice(0, 200)}`);
    }
  }
} else {
  // Legacy path: YAML response
  const yamlText = this.extractYaml(rawText);
  parsed = yaml.load(yamlText);
}
```

- [ ] **Step 3: Update Gemini provider**

In `apps/api/src/lib/ai/providers/gemini.ts`, update destructuring and prompt line:

```typescript
// BEFORE:
async generateContent({ agentType, input, schema, systemPrompt }: GenerateContentParams): Promise<unknown> {
  const userPrompt = this.buildPrompt(agentType, input);

// AFTER:
async generateContent({ agentType, input, schema, systemPrompt, userMessage }: GenerateContentParams): Promise<unknown> {
  const userPrompt = userMessage ?? this.buildPrompt(agentType, input);
```

- [ ] **Step 4: Update Ollama provider**

In `apps/api/src/lib/ai/providers/ollama.ts`, update destructuring and prompt line:

```typescript
// BEFORE:
async generateContent({
  agentType,
  input,
  schema,
  systemPrompt,
}: GenerateContentParams): Promise<unknown> {
  const userPrompt = this.buildPrompt(agentType, input);

// AFTER:
async generateContent({
  agentType,
  input,
  schema,
  systemPrompt,
  userMessage,
}: GenerateContentParams): Promise<unknown> {
  const userPrompt = userMessage ?? this.buildPrompt(agentType, input);
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/ai/providers/openai.ts apps/api/src/lib/ai/providers/anthropic.ts apps/api/src/lib/ai/providers/gemini.ts apps/api/src/lib/ai/providers/ollama.ts
git commit -m "refactor(ai): providers use userMessage when available, fallback to buildPrompt"
```

---

### Task 4: Update engine log to handle new params shape

**Files:**
- Modify: `apps/api/src/lib/ai/router.ts`

- [ ] **Step 1: Update logEngineCall input field in generateWithFallback**

In `apps/api/src/lib/ai/router.ts`, the success log (around line 276) and failure log (around line 317) reference `params.input`. Update both to handle the new shape:

```typescript
// Replace this in BOTH log calls (success ~line 282 and failure ~line 323):
// BEFORE:
input: { agentType: params.agentType, systemPrompt: params.systemPrompt, inputData: params.input },

// AFTER:
input: {
  agentType: params.agentType,
  systemPrompt: params.systemPrompt,
  ...(params.userMessage ? { userMessage: params.userMessage } : { inputData: params.input }),
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/lib/ai/router.ts
git commit -m "refactor(ai): engine log handles userMessage in params"
```

---

### Task 5: Wire brainstorm job to use prompt builder

**Files:**
- Modify: `apps/api/src/jobs/brainstorm-generate.ts`

- [ ] **Step 1: Add import at top of file**

```typescript
// Add after existing imports (around line 6):
import { buildBrainstormMessage } from '../lib/ai/prompts/brainstorm.js';
```

- [ ] **Step 2: Build userMessage before the call-provider step**

Find the `call-provider` step (around line 107). Add the message builder before the `generateWithFallback` call, and pass `userMessage` in params:

```typescript
const result = (await step.run('call-provider', async () => {
  const userMessage = buildBrainstormMessage({
    topic: (inputJson.topic as string) ?? undefined,
    ideasRequested: (inputJson.ideasRequested as number) ?? undefined,
    fineTuning: inputJson.fineTuning as BrainstormInput['fineTuning'],
    referenceUrl: (inputJson.referenceUrl as string) ?? undefined,
    channel: channelContext as BrainstormInput['channel'],
  });

  const call = await generateWithFallback(
    'brainstorm',
    modelTier,
    {
      agentType: 'brainstorm',
      systemPrompt: systemPrompt ?? '',
      userMessage,
    },
    {
      provider,
      model,
      logContext: {
        userId,
        orgId,
        channelId,
        sessionId,
        sessionType: 'brainstorm',
      },
    },
  );
  await logUsage({
    orgId, userId, channelId,
    stage: 'brainstorm',
    sessionId, sessionType: 'brainstorm',
    provider: call.providerName, model: call.model,
    usage: call.usage,
  });
  return call.result;
})) as unknown;
```

Also add the type import:

```typescript
import type { BrainstormInput } from '../lib/ai/prompts/brainstorm.js';
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/brainstorm-generate.ts
git commit -m "feat(ai): brainstorm job uses shared prompt builder"
```

---

### Task 6: Wire brainstorm route (regenerate) to use prompt builder

**Files:**
- Modify: `apps/api/src/routes/brainstorm.ts`

- [ ] **Step 1: Find the regenerate endpoint's generateWithFallback call**

In `apps/api/src/routes/brainstorm.ts`, find the `POST /sessions/:id/regenerate` handler. It has a `generateWithFallback` call. Add the import and update the call:

```typescript
// Add import at top:
import { buildBrainstormMessage } from '../lib/ai/prompts/brainstorm.js';
import type { BrainstormInput } from '../lib/ai/prompts/brainstorm.js';
```

In the regenerate handler, build the userMessage from the original session's `input_json` before calling `generateWithFallback`:

```typescript
const userMessage = buildBrainstormMessage({
  topic: (inputJson.topic as string) ?? undefined,
  ideasRequested: (inputJson.ideasRequested as number) ?? undefined,
  fineTuning: inputJson.fineTuning as BrainstormInput['fineTuning'],
  referenceUrl: (inputJson.referenceUrl as string) ?? undefined,
  channel: channelContext as BrainstormInput['channel'],
});

// Update the generateWithFallback call to use:
{
  agentType: 'brainstorm',
  systemPrompt: systemPrompt ?? '',
  userMessage,
}
// instead of:
{
  agentType: 'brainstorm',
  input: { ... },
  schema: null,
  systemPrompt,
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/brainstorm.ts
git commit -m "feat(ai): brainstorm regenerate route uses shared prompt builder"
```

---

### Task 7: Update brainstorm agent prompt in DB

**Files:**
- Create: `supabase/migrations/20260416200000_refactor_brainstorm_prompt.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Refactor brainstorm agent prompt: remove input schema, add field quality
-- guidance and filled example. Keep role, principles, output contract, rules.
UPDATE public.agent_prompts
SET instructions = E'# Agent 1: Brainstorm Agent\n\
\n\
## Role\n\
\n\
You are a skeptical content strategist and growth operator.\n\
Your job is to surface ideas worth validating and kill weak ones early.\n\
You generate and validate content ideas only — never write full content.\n\
\n\
## Guiding Principles\n\
\n\
- Default to skepticism over optimism\n\
- Optimize for tension, relevance, and repurposability\n\
- Prefer rejecting ideas early rather than polishing weak ones\n\
- Never confuse creativity with viability\n\
\n\
## Output Contract\n\
\n\
Return a JSON object with this exact structure:\n\
\n\
```json\n\
{\n\
  "ideas": [\n\
    {\n\
      "idea_id": "BC-IDEA-001",\n\
      "title": "Why Your Morning Routine Is Sabotaging Your Productivity",\n\
      "core_tension": "The conflict between popular morning routine advice and actual neuroscience on peak performance windows",\n\
      "target_audience": "Knowledge workers and remote professionals aged 25-40",\n\
      "search_intent": "People searching for evidence-based productivity methods",\n\
      "primary_keyword": {\n\
        "term": "morning routine productivity",\n\
        "difficulty": "medium",\n\
        "monthly_volume_estimate": "2400"\n\
      },\n\
      "scroll_stopper": "That 5 AM wake-up destroying your focus? Science says you are right to hate it.",\n\
      "curiosity_gap": "What if the most productive hours are not when you think they are?",\n\
      "monetization": {\n\
        "affiliate_angle": "Oura Ring, Rise app for circadian tracking",\n\
        "product_fit": "Chronotype assessment tool or energy mapping template",\n\
        "sponsor_appeal": "Wellness brands, productivity SaaS"\n\
      },\n\
      "repurpose_potential": {\n\
        "blog_angle": "Deep dive into chronobiology research with actionable takeaways",\n\
        "video_angle": "Before/after experiment tracking energy levels for 7 days",\n\
        "shorts_hooks": ["Stop waking up at 5 AM", "Your peak hours are wrong"],\n\
        "podcast_angle": "Interview with a sleep researcher on chronotypes"\n\
      },\n\
      "risk_flags": ["Contrarian angle may alienate morning routine enthusiasts"],\n\
      "verdict": "viable",\n\
      "verdict_rationale": "Strong tension, high search volume, excellent repurpose potential across all formats, concrete monetization angles"\n\
    }\n\
  ],\n\
  "recommendation": {\n\
    "pick": "Why Your Morning Routine Is Sabotaging Your Productivity",\n\
    "rationale": "Strongest tension and highest search intent among all ideas"\n\
  }\n\
}\n\
```\n\
\n\
## Field Quality Guidance\n\
\n\
- **title**: Specific and tension-driven. Bad: "AI Tips". Good: "Why Your AI Strategy Is Already Obsolete"\n\
- **core_tension**: The conflict that makes someone stop and think. Must have two opposing forces.\n\
- **scroll_stopper**: 1-line hook. Must provoke curiosity or challenge a belief. Written as if it appears in a social feed.\n\
- **curiosity_gap**: The question the reader cannot ignore. Must feel personal and unresolved.\n\
- **search_intent**: What real people type into Google. Be specific.\n\
- **primary_keyword.term**: Actual keyword phrase people search. Not a topic label.\n\
- **primary_keyword.difficulty**: low/medium/high. Be realistic about competition.\n\
- **monetization**: Concrete product/brand names when possible. Not "some product" but "Notion, Obsidian".\n\
- **repurpose_potential**: Each angle must be genuinely different, not the same content reformatted.\n\
- **verdict**: Be brutally honest. "viable" = would bet money on it. "weak" = kill it now. "experimental" = interesting but unproven.\n\
- **verdict_rationale**: Explain WHY, referencing specific strengths/weaknesses.\n\
\n\
## Rules\n\
\n\
- Output JSON only. No commentary outside the JSON object.\n\
- Do not add, remove, or rename keys in the output schema.\n\
- Generate exactly the number of ideas requested in the user message.\n\
- Always include a recommendation.pick matching one idea title exactly.\n\
- If audience, market, or monetization details are not provided, infer them from the topic and context.\n\
- ALL output text must be in the language specified in the user message. If no language specified, default to English.\n\
- Adapt cultural references, idioms, and examples for the specified region/audience.'
WHERE slug = 'brainstorm';
```

- [ ] **Step 2: Apply migration**

Run: `npm run db:push:dev`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416200000_refactor_brainstorm_prompt.sql
git commit -m "refactor(db): brainstorm agent prompt — output-only contract with field guidance"
```

---

### Task 8: End-to-end test brainstorm with Ollama

- [ ] **Step 1: Restart API server**

Kill running dev processes and restart: `npm run dev`

- [ ] **Step 2: Test via curl with Ollama**

```bash
curl -s http://localhost:3001/brainstorm/sessions \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: 0ccd918fffd34ae7d181bbd86b13d95881829b8fc0fe3ec96b0dcf009a628d65" \
  -H "X-User-Id: 5feae97f-86a5-4996-96c1-fc2ed459fa7f" \
  -d '{"inputMode":"fine_tuned","topic":"productivity for developers","provider":"ollama","model":"gemma4:e4b","ideasRequested":3,"fineTuning":{"niche":"tech","audience":"senior devs","tone":"casual","goal":"engage"}}' | python3 -m json.tool
```

Expected: 202 with sessionId. Then check Inngest logs for the job completing with parsed ideas.

- [ ] **Step 3: Verify engine logs show userMessage instead of raw input**

Check the admin engine logs panel at `http://localhost:3002/admin/engine-logs` — the input should show `userMessage` field with the formatted prompt, not the raw `inputData` YAML.

- [ ] **Step 4: Test via curl with Gemini**

```bash
curl -s http://localhost:3001/brainstorm/sessions \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: 0ccd918fffd34ae7d181bbd86b13d95881829b8fc0fe3ec96b0dcf009a628d65" \
  -H "X-User-Id: 5feae97f-86a5-4996-96c1-fc2ed459fa7f" \
  -d '{"inputMode":"blind","topic":"AI ethics","provider":"gemini","model":"gemini-2.5-flash","ideasRequested":5}' | python3 -m json.tool
```

Expected: 202 with sessionId. Job completes with 5 parsed ideas.

---

## Phase 2 — Migrate Remaining Agents

### Task 9: Create research prompt builder

**Files:**
- Create: `apps/api/src/lib/ai/prompts/research.ts`
- Create: `apps/api/src/lib/ai/__tests__/prompts-research.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// apps/api/src/lib/ai/__tests__/prompts-research.test.ts
import { describe, it, expect } from 'vitest';
import { buildResearchMessage } from '../prompts/research.js';

describe('buildResearchMessage', () => {
  it('builds message with idea context', () => {
    const msg = buildResearchMessage({
      ideaId: 'BC-IDEA-001',
      ideaTitle: 'AI in healthcare',
      level: 'standard',
    });
    expect(msg).toContain('AI in healthcare');
    expect(msg).toContain('standard');
    expect(msg).toContain('JSON');
  });

  it('includes instruction when provided', () => {
    const msg = buildResearchMessage({
      ideaTitle: 'test',
      instruction: 'Focus on European market data',
    });
    expect(msg).toContain('Focus on European market data');
  });

  it('includes channel context', () => {
    const msg = buildResearchMessage({
      ideaTitle: 'test',
      channel: { name: 'BrightCurios', language: 'pt-BR' },
    });
    expect(msg).toContain('pt-BR');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-research.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement buildResearchMessage**

```typescript
// apps/api/src/lib/ai/prompts/research.ts

export interface ResearchInput {
  ideaId?: string;
  ideaTitle?: string;
  coreTension?: string;
  targetAudience?: string;
  level?: string;
  instruction?: string;
  channel?: {
    name?: string;
    niche?: string;
    language?: string;
    tone?: string;
  };
}

export function buildResearchMessage(input: ResearchInput): string {
  const lines: string[] = [];

  lines.push(`Research the following content idea:`);
  if (input.ideaTitle) lines.push(`Title: "${input.ideaTitle}"`);
  if (input.ideaId) lines.push(`ID: ${input.ideaId}`);
  if (input.coreTension) lines.push(`Core tension: ${input.coreTension}`);
  if (input.targetAudience) lines.push(`Target audience: ${input.targetAudience}`);

  if (input.level) {
    lines.push('');
    lines.push(`Research depth: ${input.level}`);
  }

  if (input.instruction) {
    lines.push('');
    lines.push(`Additional instruction: ${input.instruction}`);
  }

  if (input.channel) {
    const ch = input.channel;
    const parts: string[] = [];
    if (ch.name) parts.push(`Channel: ${ch.name}`);
    if (ch.language) parts.push(`Language: ${ch.language}`);
    if (ch.niche) parts.push(`Niche: ${ch.niche}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push(parts.join('\n'));
    }
  }

  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-research.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/prompts/research.ts apps/api/src/lib/ai/__tests__/prompts-research.test.ts
git commit -m "feat(ai): add research prompt builder with tests"
```

---

### Task 10: Create production prompt builder

**Files:**
- Create: `apps/api/src/lib/ai/prompts/production.ts`
- Create: `apps/api/src/lib/ai/__tests__/prompts-production.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// apps/api/src/lib/ai/__tests__/prompts-production.test.ts
import { describe, it, expect } from 'vitest';
import { buildCanonicalCoreMessage, buildProduceMessage, buildReproduceMessage } from '../prompts/production.js';

describe('buildCanonicalCoreMessage', () => {
  it('includes title and type', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'blog',
      title: 'AI Ethics Deep Dive',
      ideaId: 'BC-IDEA-001',
    });
    expect(msg).toContain('AI Ethics Deep Dive');
    expect(msg).toContain('blog');
    expect(msg).toContain('canonical core');
  });

  it('includes research cards when provided', () => {
    const msg = buildCanonicalCoreMessage({
      type: 'video',
      title: 'test',
      researchCards: [{ title: 'Finding 1', summary: 'Important data' }],
    });
    expect(msg).toContain('Finding 1');
  });
});

describe('buildProduceMessage', () => {
  it('includes canonical core reference', () => {
    const msg = buildProduceMessage({
      type: 'blog',
      title: 'test',
      canonicalCore: { thesis: 'AI changes everything' },
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('canonical core');
  });
});

describe('buildReproduceMessage', () => {
  it('includes review feedback', () => {
    const msg = buildReproduceMessage({
      type: 'blog',
      title: 'test',
      reviewFeedback: {
        overall_verdict: 'revision_required',
        critical_issues: ['Missing sources'],
      },
    });
    expect(msg).toContain('Missing sources');
    expect(msg).toContain('revision_required');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-production.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement production prompt builders**

```typescript
// apps/api/src/lib/ai/prompts/production.ts
import yaml from 'js-yaml';

export interface CanonicalCoreInput {
  type: string;
  title: string;
  ideaId?: string;
  researchCards?: unknown[];
  productionParams?: unknown;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ProduceInput {
  type: string;
  title: string;
  canonicalCore: unknown;
  researchSessionId?: string;
  productionParams?: unknown;
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export interface ReproduceInput {
  type: string;
  title: string;
  canonicalCore?: unknown;
  previousDraft?: unknown;
  reviewFeedback: {
    overall_verdict?: string;
    score?: number | null;
    critical_issues?: string[];
    minor_issues?: string[];
    strengths?: string[];
  };
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

function channelBlock(ch?: { name?: string; niche?: string; language?: string; tone?: string }): string {
  if (!ch) return '';
  const parts: string[] = [];
  if (ch.name) parts.push(`Channel: ${ch.name}`);
  if (ch.language) parts.push(`Language: ${ch.language}`);
  if (ch.niche) parts.push(`Niche: ${ch.niche}`);
  if (ch.tone) parts.push(`Tone: ${ch.tone}`);
  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

export function buildCanonicalCoreMessage(input: CanonicalCoreInput): string {
  const lines: string[] = [];
  lines.push(`Generate a canonical core for a ${input.type} content piece.`);
  lines.push(`Title: "${input.title}"`);
  if (input.ideaId) lines.push(`Idea ID: ${input.ideaId}`);

  if (input.researchCards && Array.isArray(input.researchCards) && input.researchCards.length > 0) {
    lines.push('');
    lines.push('Approved research cards:');
    lines.push(yaml.dump(input.researchCards, { lineWidth: -1 }));
  }

  if (input.productionParams) {
    lines.push('');
    lines.push('Production parameters:');
    lines.push(yaml.dump(input.productionParams, { lineWidth: -1 }));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}

export function buildProduceMessage(input: ProduceInput): string {
  const lines: string[] = [];
  lines.push(`Produce a ${input.type} draft from the canonical core below.`);
  lines.push(`Title: "${input.title}"`);
  lines.push('');
  lines.push('Canonical core:');
  lines.push(typeof input.canonicalCore === 'string' ? input.canonicalCore : JSON.stringify(input.canonicalCore, null, 2));

  if (input.productionParams) {
    lines.push('');
    lines.push('Production parameters:');
    lines.push(yaml.dump(input.productionParams, { lineWidth: -1 }));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}

export function buildReproduceMessage(input: ReproduceInput): string {
  const lines: string[] = [];
  lines.push(`Revise the ${input.type} draft based on review feedback.`);
  lines.push(`Title: "${input.title}"`);
  lines.push('');
  lines.push(`Review verdict: ${input.reviewFeedback.overall_verdict ?? 'unknown'}`);
  if (input.reviewFeedback.score != null) lines.push(`Score: ${input.reviewFeedback.score}`);
  if (input.reviewFeedback.critical_issues?.length) {
    lines.push('');
    lines.push('Critical issues to fix:');
    input.reviewFeedback.critical_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.minor_issues?.length) {
    lines.push('');
    lines.push('Minor issues to fix:');
    input.reviewFeedback.minor_issues.forEach((i) => lines.push(`- ${i}`));
  }
  if (input.reviewFeedback.strengths?.length) {
    lines.push('');
    lines.push('Strengths to keep:');
    input.reviewFeedback.strengths.forEach((s) => lines.push(`- ${s}`));
  }

  if (input.canonicalCore) {
    lines.push('');
    lines.push('Canonical core:');
    lines.push(typeof input.canonicalCore === 'string' ? input.canonicalCore : JSON.stringify(input.canonicalCore, null, 2));
  }

  if (input.previousDraft) {
    lines.push('');
    lines.push('Previous draft:');
    lines.push(typeof input.previousDraft === 'string' ? input.previousDraft : JSON.stringify(input.previousDraft, null, 2));
  }

  lines.push(channelBlock(input.channel));
  lines.push('');
  lines.push('Fix the issues, keep the strengths. Respond with a JSON object matching the output contract. No markdown, no commentary.');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-production.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/prompts/production.ts apps/api/src/lib/ai/__tests__/prompts-production.test.ts
git commit -m "feat(ai): add production prompt builders (canonical-core, produce, reproduce) with tests"
```

---

### Task 11: Create review prompt builder

**Files:**
- Create: `apps/api/src/lib/ai/prompts/review.ts`
- Create: `apps/api/src/lib/ai/__tests__/prompts-review.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// apps/api/src/lib/ai/__tests__/prompts-review.test.ts
import { describe, it, expect } from 'vitest';
import { buildReviewMessage } from '../prompts/review.js';

describe('buildReviewMessage', () => {
  it('includes draft type and title', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'AI Ethics Post',
      draftJson: { content: 'draft text...' },
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('AI Ethics Post');
    expect(msg).toContain('JSON');
  });

  it('includes canonical core when provided', () => {
    const msg = buildReviewMessage({
      type: 'video',
      title: 'test',
      draftJson: {},
      canonicalCore: { thesis: 'important claim' },
    });
    expect(msg).toContain('important claim');
  });

  it('includes content types requested', () => {
    const msg = buildReviewMessage({
      type: 'blog',
      title: 'test',
      draftJson: {},
      contentTypesRequested: ['blog', 'video'],
    });
    expect(msg).toContain('blog');
    expect(msg).toContain('video');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-review.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement buildReviewMessage**

```typescript
// apps/api/src/lib/ai/prompts/review.ts

export interface ReviewInput {
  type: string;
  title: string;
  draftJson: unknown;
  canonicalCore?: unknown;
  idea?: unknown;
  research?: unknown;
  contentTypesRequested?: string[];
  channel?: { name?: string; niche?: string; language?: string; tone?: string };
}

export function buildReviewMessage(input: ReviewInput): string {
  const lines: string[] = [];

  lines.push(`Review the following ${input.type} draft.`);
  lines.push(`Title: "${input.title}"`);

  if (input.contentTypesRequested?.length) {
    lines.push(`Content types to review: ${input.contentTypesRequested.join(', ')}`);
  }

  lines.push('');
  lines.push('Draft to review:');
  lines.push(typeof input.draftJson === 'string' ? input.draftJson : JSON.stringify(input.draftJson, null, 2));

  if (input.canonicalCore) {
    lines.push('');
    lines.push('Canonical core (reference):');
    lines.push(typeof input.canonicalCore === 'string' ? input.canonicalCore : JSON.stringify(input.canonicalCore, null, 2));
  }

  if (input.idea) {
    lines.push('');
    lines.push('Original idea:');
    lines.push(typeof input.idea === 'string' ? input.idea : JSON.stringify(input.idea, null, 2));
  }

  if (input.research) {
    lines.push('');
    lines.push('Research data:');
    lines.push(typeof input.research === 'string' ? input.research : JSON.stringify(input.research, null, 2));
  }

  if (input.channel) {
    const ch = input.channel;
    const parts: string[] = [];
    if (ch.name) parts.push(`Channel: ${ch.name}`);
    if (ch.language) parts.push(`Language: ${ch.language}`);
    if (ch.niche) parts.push(`Niche: ${ch.niche}`);
    if (parts.length > 0) {
      lines.push('');
      lines.push(parts.join('\n'));
    }
  }

  lines.push('');
  lines.push('Respond with a JSON object matching the output contract. No markdown, no commentary.');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/src/lib/ai/__tests__/prompts-review.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/prompts/review.ts apps/api/src/lib/ai/__tests__/prompts-review.test.ts
git commit -m "feat(ai): add review prompt builder with tests"
```

---

### Task 12: Wire research job + route to use prompt builder

**Files:**
- Modify: `apps/api/src/jobs/research-generate.ts`
- Modify: `apps/api/src/routes/research-sessions.ts`

- [ ] **Step 1: Update research job**

In `apps/api/src/jobs/research-generate.ts`, add import and update the `call-provider` step:

```typescript
// Add import:
import { buildResearchMessage } from '../lib/ai/prompts/research.js';
import type { ResearchInput } from '../lib/ai/prompts/research.js';
```

Update the `generateWithFallback` call (around line 106):

```typescript
const userMessage = buildResearchMessage({
  ideaId: (inputJson.ideaId as string) ?? undefined,
  ideaTitle: (inputJson.ideaTitle as string) ?? (inputJson.title as string) ?? undefined,
  coreTension: (inputJson.coreTension as string) ?? undefined,
  targetAudience: (inputJson.targetAudience as string) ?? undefined,
  level,
  instruction: (inputJson.instruction as string) ?? undefined,
  channel: channelContext as ResearchInput['channel'],
});

const call = await generateWithFallback(
  'research',
  modelTier,
  {
    agentType: 'research',
    systemPrompt: systemPrompt ?? '',
    userMessage,
  },
  // ... options unchanged
);
```

- [ ] **Step 2: Update research routes**

In `apps/api/src/routes/research-sessions.ts`, add the import and update both `generateWithFallback` calls (the create endpoint around line 207 and the regenerate endpoint around line 628) with the same pattern.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/research-generate.ts apps/api/src/routes/research-sessions.ts
git commit -m "feat(ai): research job + routes use shared prompt builder"
```

---

### Task 13: Wire production job + route to use prompt builder

**Files:**
- Modify: `apps/api/src/jobs/production-generate.ts`
- Modify: `apps/api/src/routes/content-drafts.ts`

- [ ] **Step 1: Update production job**

In `apps/api/src/jobs/production-generate.ts`, add import:

```typescript
import { buildCanonicalCoreMessage, buildProduceMessage } from '../lib/ai/prompts/production.js';
```

Update the `generate-core` step (around line 100) to build `userMessage`:

```typescript
const userMessage = buildCanonicalCoreMessage({
  type,
  title: draft.title as string,
  ideaId: draft.idea_id as string,
  researchCards: approvedCards,
  productionParams: productionParams ?? undefined,
  channel: channelContext as CanonicalCoreInput['channel'],
});

const call = await generateWithFallback('production', modelTier, {
  agentType: 'production',
  systemPrompt: coreSystemPrompt ?? '',
  userMessage,
}, /* options */);
```

Update the `generate-produce` step (around line 163) similarly with `buildProduceMessage`.

- [ ] **Step 2: Update content-drafts route**

In `apps/api/src/routes/content-drafts.ts`, add imports:

```typescript
import { buildCanonicalCoreMessage, buildProduceMessage, buildReproduceMessage } from '../lib/ai/prompts/production.js';
import { buildReviewMessage } from '../lib/ai/prompts/review.js';
```

Update all 4 `generateWithFallback` calls:
- Canonical-core call (around line 432) → use `buildCanonicalCoreMessage`
- Produce call (around line 608) → use `buildProduceMessage`
- Review call (around line 736) → use `buildReviewMessage`
- Reproduce call (around line 1173) → use `buildReproduceMessage`

Each follows the same pattern: build `userMessage`, pass `{ agentType, systemPrompt, userMessage }`.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/production-generate.ts apps/api/src/routes/content-drafts.ts
git commit -m "feat(ai): production + review calls use shared prompt builders"
```

---

## Phase 3 — Cleanup

### Task 14: Make userMessage required, remove legacy code

**Files:**
- Modify: `apps/api/src/lib/ai/provider.ts`
- Modify: `apps/api/src/lib/ai/providers/openai.ts`
- Modify: `apps/api/src/lib/ai/providers/anthropic.ts`
- Modify: `apps/api/src/lib/ai/providers/gemini.ts`
- Modify: `apps/api/src/lib/ai/providers/ollama.ts`

- [ ] **Step 1: Make userMessage required in GenerateContentParams**

```typescript
// apps/api/src/lib/ai/provider.ts
export interface GenerateContentParams {
  agentType: AgentType;
  systemPrompt: string;
  userMessage: string;
  schema?: unknown;
}
```

- [ ] **Step 2: Remove buildPrompt from OpenAI provider**

In `apps/api/src/lib/ai/providers/openai.ts`:
- Change `const userPrompt = userMessage ?? this.buildPrompt(agentType, input);` to `const userPrompt = userMessage;`
- Delete the `buildPrompt` method entirely
- Remove `yaml` import if no longer used
- Remove `input` from destructuring

- [ ] **Step 3: Remove buildPrompt and extractYaml from Anthropic provider**

In `apps/api/src/lib/ai/providers/anthropic.ts`:
- Change `const userPrompt = userMessage ?? this.buildPrompt(agentType, input);` to `const userPrompt = userMessage;`
- Remove the legacy YAML parsing path — keep only the JSON path
- Delete `buildPrompt` method
- Delete `extractYaml` method
- Remove `yaml` import
- Remove `input` from destructuring

- [ ] **Step 4: Remove buildPrompt from Gemini provider**

In `apps/api/src/lib/ai/providers/gemini.ts`:
- Change `const userPrompt = userMessage ?? this.buildPrompt(agentType, input);` to `const userPrompt = userMessage;`
- Delete `buildPrompt` method
- Remove `yaml` import
- Remove `input` from destructuring

- [ ] **Step 5: Remove buildPrompt, buildBrainstormPrompt, buildSimplePrompt from Ollama provider**

In `apps/api/src/lib/ai/providers/ollama.ts`:
- Change `const userPrompt = userMessage ?? this.buildPrompt(agentType, input);` to `const userPrompt = userMessage;`
- Delete `buildPrompt` method
- Delete `buildBrainstormPrompt` method
- Delete `buildSimplePrompt` method
- Remove `yaml` import
- Remove `input` from destructuring

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors — all callers already pass `userMessage`

- [ ] **Step 7: Run all tests**

Run: `npm run test:api`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/ai/provider.ts apps/api/src/lib/ai/providers/
git commit -m "refactor(ai): remove legacy buildPrompt from all providers, userMessage now required"
```

---

### Task 15: Update remaining agent prompts in DB

**Files:**
- Create: `supabase/migrations/20260416210000_refactor_remaining_agent_prompts.sql`

- [ ] **Step 1: Write migration for research, production, review prompts**

Follow the same pattern as brainstorm (Task 7): remove input schemas, add field quality guidance and filled examples for each agent. The specific content of each prompt should be adapted from the current instructions in the `agent_prompts` table, keeping the role/principles/output-contract/rules but removing `BC_*_INPUT` schemas and adding field quality guidance.

- [ ] **Step 2: Apply migration**

Run: `npm run db:push:dev`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416210000_refactor_remaining_agent_prompts.sql
git commit -m "refactor(db): research, production, review agent prompts — output-only with field guidance"
```

---

### Task 16: Final end-to-end verification

- [ ] **Step 1: Restart full dev environment**

```bash
npm run dev
```

- [ ] **Step 2: Test brainstorm with Ollama via UI**

Open `http://localhost:3000`, go to a channel's brainstorm page, select Ollama / Gemma 4, generate 3 ideas. Verify:
- Floating progress widget appears
- Ideas appear after generation
- No schema echoing in output

- [ ] **Step 3: Test brainstorm with Gemini via UI**

Same flow, select Gemini / Gemini 2.5 Flash, generate 5 ideas.

- [ ] **Step 4: Check engine logs**

Open `http://localhost:3002/admin/engine-logs`. Verify the logged input shows `userMessage` (formatted natural language) instead of raw YAML-dumped objects.

- [ ] **Step 5: Run full test suite**

```bash
npm run test
npm run typecheck
```

Expected: All pass
