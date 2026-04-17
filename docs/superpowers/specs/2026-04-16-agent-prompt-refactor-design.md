# Agent Prompt Architecture Refactor — Design Spec

**Date:** 2026-04-16
**Status:** Draft
**Scope:** All 4 agents (brainstorm, research, production, review)

## Problem

The current architecture has a disconnect between what agent system prompts expect and what providers actually send to LLMs:

1. **System prompts define `BC_*_INPUT` schemas** that are never sent in that format. The API sends `{topic, fineTuning, ideasRequested}` — a completely different shape. Local models (gemma4) echo the input schema instead of generating output.

2. **Each provider builds prompts differently.** Anthropic asks for YAML, OpenAI/Gemini ask for JSON, Ollama has agent-specific logic. The same system prompt gets wildly different user messages depending on provider.

3. **Prompt construction logic lives inside providers.** Domain knowledge (what a brainstorm needs) is mixed with transport logic (how to call the Gemini API). Changes to one agent require editing 4 providers.

## Architecture

### Separation of Concerns

```
┌─────────────────────────────────────┐
│ System Prompt (static, in DB)       │
│ - Role, personality, principles     │
│ - OUTPUT contract with filled       │
│   example (not empty strings)       │
│ - Field quality guidance            │
│ - Rules                             │
│                                     │
│ NO input schema.                    │
│ NO channel context instructions.    │
│ NO handoff details.                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Prompt Builder (per agent)          │
│ apps/api/src/lib/ai/prompts/       │
│                                     │
│ Maps app fields → user message:     │
│  topic → natural language context   │
│  fineTuning → structured context    │
│  channel → language/audience info   │
│  ideasRequested → instruction       │
│                                     │
│ Pure function. No DB. No side       │
│ effects. Same for ALL providers.    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Provider (transport only)           │
│ - Receives systemPrompt + userMsg   │
│ - Calls provider API               │
│ - Enforces JSON response format     │
│ - Parses JSON response              │
│ - NO prompt building                │
│ - NO domain knowledge               │
└─────────────────────────────────────┘
```

### Interface Change

```typescript
// provider.ts — BEFORE
export interface GenerateContentParams {
  agentType: AgentType;
  input: any;
  schema: any;
  systemPrompt?: string;
}

// provider.ts — AFTER
export interface GenerateContentParams {
  agentType: AgentType;
  systemPrompt: string;      // Required (from agent_prompts DB)
  userMessage: string;        // Required (from prompts/xxx.ts builder)
  schema?: unknown;           // Future: Zod validation
}
```

### New Files

```
apps/api/src/lib/ai/prompts/
├── brainstorm.ts    → buildBrainstormMessage(input)
├── research.ts      → buildResearchMessage(input)
├── production.ts    → buildCanonicalCoreMessage(input)
│                      buildProduceMessage(input)
└── review.ts        → buildReviewMessage(input)
```

Each builder is a pure function: takes typed input, returns a string.

### Prompt Builder Example — Brainstorm

```typescript
interface BrainstormInput {
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

export function buildBrainstormMessage(input: BrainstormInput): string
```

Output example:
```
Generate 5 content ideas about "AI in healthcare".

Context:
- Audience: young professionals
- Niche: technology
- Tone: casual
- Goal: engage
- Constraints: avoid clickbait

Channel: BrightCurios
Language: pt-BR

Respond with a JSON object matching the output contract. No markdown, no commentary.
```

### Provider Simplification

All 4 providers become thin transport layers:

| Provider | Changes |
|----------|---------|
| Anthropic | Remove `buildPrompt`, remove YAML parsing (`extractYaml`), switch to JSON output |
| OpenAI | Remove `buildPrompt`, already uses `response_format: json_object` |
| Gemini | Remove `buildPrompt`, already uses `responseMimeType: json` |
| Ollama | Remove `buildPrompt`, `buildBrainstormPrompt`, `buildSimplePrompt`. Keep streaming, degenerate detection, JSON repair |

Deleted from all providers:
- `buildPrompt()` method
- `buildSimplePrompt()` / `buildBrainstormPrompt()` (Ollama)
- `extractYaml()` (Anthropic)
- `yaml` import (where no longer needed)

Kept:
- API call logic, auth, timeouts
- JSON response format enforcement
- Ollama streaming + degenerate detection + JSON repair
- Token usage tracking
- Error handling

### Agent Prompt Refactor (DB)

System prompts restructured. Using brainstorm as template:

**Removed:**
- `BC_BRAINSTORM_INPUT` schema — user message handles dynamic data
- Handoff to Research section — implementation detail
- Channel Context instructions — prompt builder injects channel data

**Kept:**
- Role, personality, guiding principles
- Rules

**Added:**
- Output contract with **filled example** (not empty strings) — critical for local models
- Field quality guidance — explains what makes each field good vs bad

Example field guidance:
```
## Field Quality Guidance

- title: Specific, tension-driven. Bad: "AI Tips". Good: "Why Your AI Strategy Is Already Obsolete"
- core_tension: The conflict that makes someone stop and think. Must have two opposing forces.
- scroll_stopper: 1-line hook. Must provoke curiosity or challenge a belief.
- curiosity_gap: The question the reader can't ignore. Must feel personal.
- verdict: Be brutally honest. "viable" = would bet money on it. "weak" = kill it now.
- primary_keyword.difficulty: low/medium/high based on competition.
- monetization: Concrete product/brand names when possible, not generic.
```

Same pattern applies to research, production, review agents.

### Job File Changes

Each job changes from:

```typescript
// Before
const result = await generateWithFallback('brainstorm', tier, {
  agentType: 'brainstorm',
  input: { ...inputJson, channel: channelContext },
  schema: null,
  systemPrompt: systemPrompt ?? undefined,
}, options);
```

To:

```typescript
// After
import { buildBrainstormMessage } from '../lib/ai/prompts/brainstorm.js';

const userMessage = buildBrainstormMessage({
  topic: inputJson.topic,
  ideasRequested: inputJson.ideasRequested,
  fineTuning: inputJson.fineTuning,
  referenceUrl: inputJson.referenceUrl,
  channel: channelContext,
});

const result = await generateWithFallback('brainstorm', tier, {
  agentType: 'brainstorm',
  systemPrompt,
  userMessage,
}, options);
```

**Files affected:**

| File | Agent |
|------|-------|
| `jobs/brainstorm-generate.ts` | brainstorm |
| `routes/brainstorm.ts` | brainstorm (regenerate endpoint) |
| `jobs/research-generate.ts` | research |
| `routes/research-sessions.ts` | research |
| `jobs/production-generate.ts` | production |
| `routes/content-drafts.ts` | production |
| `jobs/content-generate.ts` | production |

### Output Standardization

All providers output JSON. No more YAML from Anthropic.

| Provider | Before | After |
|----------|--------|-------|
| Anthropic | Returns YAML, parsed with regex | Returns JSON, parsed with `JSON.parse` |
| OpenAI | Returns JSON | Returns JSON (unchanged) |
| Gemini | Returns JSON | Returns JSON (unchanged) |
| Ollama | Returns JSON | Returns JSON (unchanged) |

## Migration Strategy

### Phase 1 — New code alongside old (brainstorm only)

1. Create `prompts/` directory with `brainstorm.ts`
2. Add `userMessage` field to `GenerateContentParams` (optional, alongside existing `input`)
3. Providers check: if `userMessage` exists, use it; otherwise fall back to old `buildPrompt`
4. Convert brainstorm job + route to use new pattern
5. Test brainstorm end-to-end with Ollama, Gemini, OpenAI, Anthropic

### Phase 2 — Migrate remaining agents

6. Create `research.ts`, `production.ts`, `review.ts` in `prompts/`
7. Convert research, production, review jobs + routes
8. Update agent prompts in DB (remove input schemas, add field guidance, add filled examples)
9. DB migration: update `agent_prompts` rows

### Phase 3 — Cleanup

10. Make `userMessage` required, remove `input` from `GenerateContentParams`
11. Delete all `buildPrompt` methods from providers
12. Delete Anthropic YAML parsing code (`extractYaml`)
13. Remove `yaml` dependency from providers that no longer need it

Each phase is independently shippable and testable.

## What Does NOT Change

- `generateWithFallback` router logic (tier routing, fallback chain, retry logic)
- `loadAgentPrompt` loader (5-min cache from DB)
- `channelContext.ts` builder (stays as-is, prompt builders receive channel object)
- `logEngineCall` engine logging
- Credit debit logic
- SSE job events / progress tracking
- Frontend (BrainstormEngine, etc.) — no changes needed

## Success Criteria

1. Brainstorm generates valid ideas with all providers (Ollama, Gemini, OpenAI, Anthropic)
2. Ollama/gemma4 no longer echoes input schema — produces actual ideas
3. All providers return JSON (no more YAML parsing)
4. Adding a new provider requires zero prompt logic — just API transport
5. Changing brainstorm prompt behavior requires editing one file (`prompts/brainstorm.ts`) + DB prompt, not 4 providers
