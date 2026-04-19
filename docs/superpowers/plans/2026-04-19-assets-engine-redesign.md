# Assets Engine Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Assets pipeline stage with three progressive-disclosure flows (Full AI / Semi-automated / Fully Manual), add a new `POST /generate-asset-prompts` backend route that wraps the existing `agent-5-assets` with manual-provider support, and replace the legacy `ManualModePanel` with the `ManualOutputDialog` pattern used by every other engine.

**Architecture:**

- One new backend route in `apps/api/src/routes/content-drafts.ts` that reuses the existing `BC_ASSETS_INPUT` builder (factored out into a helper), the existing `agent-5-assets` system prompt (already seeded via `scripts/generate-seed.ts`), and the existing `generateWithFallback` router.
- Client-side markdown section splitter in `apps/app/src/lib/assets/section-splitter.ts`.
- Full refactor of `apps/app/src/components/engines/AssetsEngine.tsx` into three phases: Briefs → Refine → Images, with the Images phase having two sub-modes (brief vs no-briefs).

**Tech Stack:** Fastify + Zod on the API side, React 19 + shadcn/ui on the app side, Vitest 4 for tests. Shared ModelPicker + ManualOutputDialog components already exist.

**Spec reference:** `docs/superpowers/specs/2026-04-19-assets-engine-redesign-design.md`.

---

## File Structure

**Create:**

- `apps/api/src/lib/ai/prompts/assets.ts` — `buildAssetsMessage()` builder (mirrors `prompts/review.ts`).
- `apps/api/src/lib/ai/prompts/__tests__/assets.test.ts` — unit tests for the builder.
- `apps/app/src/lib/assets/section-splitter.ts` — `splitDraftBySections()` helper.
- `apps/app/src/lib/assets/__tests__/section-splitter.test.ts` — splitter unit tests.

**Modify:**

- `apps/api/src/routes/content-drafts.ts` — extract `buildAssetsInput()` helper, add `POST /:id/generate-asset-prompts` route, refactor existing `POST /:id/asset-prompts` to reuse the helper.
- `apps/api/src/__tests__/routes/content-drafts.test.ts` — tests for new route.
- `apps/app/src/components/engines/AssetsEngine.tsx` — full phase/UI rework.

**Delete (cleanup):**

- Import of `ManualModePanel` from `AssetsEngine.tsx`.
- Unused handler `handleGenerateAll` and its "Auto Generate All" tab (targets non-existent endpoint).

Do NOT delete the `ManualModePanel` component file — grep shows other possible consumers; leave it unless all callers are gone.

---

## Task 1: Factor out `buildAssetsInput()` helper

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts` (around `:1650-1746`, the existing `POST /:id/asset-prompts` route).

The existing `asset-prompts` route inlines all the BC_ASSETS_INPUT construction logic. We're going to call the same logic from the new `generate-asset-prompts` route, so lift it into a local function inside the file (not a separate module — it's tightly coupled to `loadDraft` / Supabase helpers that already live in this file).

- [ ] **Step 1: Open the file and locate the helper-definition area**

Read `apps/api/src/routes/content-drafts.ts`. Find the block just above `export async function contentDraftsRoutes` — it already contains local helpers (`loadDraft`, `getOrgId`, etc.). We'll add `buildAssetsInput` next to them.

- [ ] **Step 2: Add the `buildAssetsInput` helper**

Insert this function just below `loadIdeaContext` (search for `async function loadIdeaContext`; add directly after its closing brace):

```typescript
/**
 * Build BC_ASSETS_INPUT from a draft row. Shared between the data-only
 * /asset-prompts route and the LLM-powered /generate-asset-prompts route.
 */
async function buildAssetsInput(
  draft: Record<string, unknown>,
): Promise<{
  title: string;
  content_type: string;
  sections: Array<{ slot: string; section_title: string; key_points: string[] }>;
  channel_context: Record<string, unknown>;
  idea_context: IdeaContext | null;
}> {
  const sb = createServiceClient();
  const draftJson = (draft.draft_json ?? {}) as Record<string, unknown>;
  const coreJson = (draft.canonical_core_json ?? {}) as Record<string, unknown>;
  const contentType = (draft.type as string) ?? "blog";

  let outline: Array<{ h2: string; key_points: string[] }> = [];
  const blogData = draftJson.blog as Record<string, unknown> | undefined;
  if (blogData?.outline && Array.isArray(blogData.outline)) {
    outline = (blogData.outline as Array<Record<string, unknown>>).map((s) => ({
      h2: (s.h2 as string) ?? (s.heading as string) ?? "",
      key_points: Array.isArray(s.key_points) ? (s.key_points as string[]) : [],
    }));
  } else if (coreJson.argument_chain && Array.isArray(coreJson.argument_chain)) {
    outline = (coreJson.argument_chain as Array<Record<string, unknown>>).map((s) => ({
      h2: (s.claim as string) ?? (s.section as string) ?? "",
      key_points: Array.isArray(s.evidence) ? (s.evidence as string[]) : [],
    }));
  }

  const sections = [
    {
      slot: "featured",
      section_title: (draft.title as string) ?? "Untitled",
      key_points: [] as string[],
    },
    ...outline.map((s, i) => ({
      slot: `section_${i + 1}`,
      section_title: s.h2,
      key_points: s.key_points,
    })),
  ];

  let channelContext: Record<string, unknown> = {};
  if (draft.channel_id) {
    const { data: channel } = await sb
      .from("channels")
      .select("niche, niche_tags, tone, language, market, region")
      .eq("id", draft.channel_id as string)
      .maybeSingle();
    if (channel) {
      channelContext = {
        niche: channel.niche ?? "",
        niche_tags: channel.niche_tags ?? [],
        tone: channel.tone ?? "",
        language: channel.language ?? "English",
        market: channel.market ?? "global",
        region: channel.region ?? "",
      };
    }
  }

  const idea = draft.idea_id
    ? await loadIdeaContext(draft.idea_id as string)
    : null;

  return {
    title: (draft.title as string) ?? "Untitled",
    content_type: contentType,
    sections,
    channel_context: channelContext,
    idea_context: idea,
  };
}
```

- [ ] **Step 3: Refactor `POST /:id/asset-prompts` to call the helper**

Replace the handler body (lines around `:1658-1744`) with this:

```typescript
  fastify.post(
    "/:id/asset-prompts",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const draft = await loadDraft(id);
        const input = await buildAssetsInput(draft as Record<string, unknown>);
        return reply.send({ data: input, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/api`
Expected: PASS (no new errors).

- [ ] **Step 5: Run existing content-drafts tests**

Run: `npx vitest run apps/api/src/__tests__/routes/content-drafts.test.ts`
Expected: all existing tests still pass (no behavior change for `/asset-prompts`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/content-drafts.ts
git commit -m "refactor(content-drafts): extract buildAssetsInput helper"
```

---

## Task 2: Add `buildAssetsMessage` prompt builder + unit test

**Files:**
- Create: `apps/api/src/lib/ai/prompts/assets.ts`
- Create: `apps/api/src/lib/ai/prompts/__tests__/assets.test.ts`

The builder formats `BC_ASSETS_INPUT` into the user-message string the agent expects. Match the style of `apps/api/src/lib/ai/prompts/review.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/ai/prompts/__tests__/assets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildAssetsMessage } from '../assets';

describe('buildAssetsMessage', () => {
  it('wraps BC_ASSETS_INPUT in a JSON code block with clear instruction', () => {
    const msg = buildAssetsMessage({
      title: 'Sample Title',
      content_type: 'blog',
      sections: [
        { slot: 'featured', section_title: 'Sample Title', key_points: [] },
        { slot: 'section_1', section_title: 'Intro', key_points: ['a', 'b'] },
      ],
      channel_context: { niche: 'tech', tone: 'informative' },
      idea_context: null,
    });

    expect(msg).toContain('BC_ASSETS_INPUT');
    expect(msg).toContain('Sample Title');
    expect(msg).toContain('section_1');
    expect(msg).toContain('BC_ASSETS_OUTPUT');
    expect(msg).toMatch(/```json/);
  });

  it('includes idea context when present', () => {
    const msg = buildAssetsMessage({
      title: 'X',
      content_type: 'blog',
      sections: [],
      channel_context: {},
      idea_context: { id: 'idea-1', title: 'Idea', core_tension: 'tension' } as any,
    });
    expect(msg).toContain('idea_context');
    expect(msg).toContain('tension');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/lib/ai/prompts/__tests__/assets.test.ts`
Expected: FAIL with `Cannot find module '../assets'`.

- [ ] **Step 3: Implement the builder**

Create `apps/api/src/lib/ai/prompts/assets.ts`:

```typescript
/**
 * Builds the user message for the assets agent.
 * Wraps BC_ASSETS_INPUT in a JSON code block and instructs the model to
 * return BC_ASSETS_OUTPUT matching the contract in agents/agent-5-assets.md.
 */
export interface AssetsPromptInput {
  title: string;
  content_type: string;
  sections: Array<{ slot: string; section_title: string; key_points: string[] }>;
  channel_context: Record<string, unknown>;
  idea_context: unknown;
}

export function buildAssetsMessage(input: AssetsPromptInput): string {
  const payload = {
    BC_ASSETS_INPUT: {
      title: input.title,
      content_type: input.content_type,
      sections: input.sections,
      channel_context: input.channel_context,
      ...(input.idea_context ? { idea_context: input.idea_context } : {}),
    },
  };

  return [
    'Generate visual prompt briefs for every section of this content piece.',
    '',
    'Input:',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '',
    'Return a valid JSON object matching the BC_ASSETS_OUTPUT contract exactly: { "visual_direction": {...}, "slots": [...] }. Output JSON only.',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/lib/ai/prompts/__tests__/assets.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/prompts/assets.ts apps/api/src/lib/ai/prompts/__tests__/assets.test.ts
git commit -m "feat(ai-prompts): add buildAssetsMessage for agent-5-assets"
```

---

## Task 3: Add `POST /:id/generate-asset-prompts` route — AI path

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts`

- [ ] **Step 1: Add the import for the builder**

At the top of `apps/api/src/routes/content-drafts.ts`, find the block of `import { build* } from '../lib/ai/prompts/...'` lines (near line 30 where `buildReviewMessage` is imported). Add:

```typescript
import { buildAssetsMessage } from "../lib/ai/prompts/assets.js";
```

- [ ] **Step 2: Add the new route handler**

Insert this handler immediately after the `POST /:id/asset-prompts` route closes (after `);` for that `fastify.post`):

```typescript
  /**
   * POST /:id/generate-asset-prompts — Run agent-5-assets to produce
   * BC_ASSETS_OUTPUT (visual_direction + slot prompt briefs). AI path.
   * Manual-provider path is handled by the block below inside the same handler.
   */
  fastify.post(
    "/:id/generate-asset-prompts",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        if (!request.userId)
          throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
        const { id } = request.params as { id: string };
        const override = providerOverrideSchema.parse(request.body ?? {});
        const draft = await loadDraft(id);
        const orgId = await getOrgId(request.userId);

        const input = await buildAssetsInput(draft as Record<string, unknown>);

        let systemPrompt = (await loadAgentPrompt("assets")) ?? undefined;
        const channelContextStr = await buildChannelContext(
          draft.channel_id as string | null | undefined,
        );
        if (channelContextStr && systemPrompt) {
          systemPrompt = `${systemPrompt}\n\n${channelContextStr}`;
        }

        const userMessage = buildAssetsMessage(input);

        // Manual path handled in Task 4 — for now only AI path.
        const { result } = await generateWithFallback(
          "assets",
          (draft.model_tier as string) ?? "standard",
          {
            agentType: "assets",
            systemPrompt: systemPrompt ?? "",
            userMessage,
          },
          {
            provider: override.provider,
            model: override.model,
            logContext: {
              userId: request.userId!,
              orgId,
              channelId: (draft.channel_id as string) ?? undefined,
              sessionId: id,
              sessionType: "assets",
            },
          },
        );

        return reply.send({ data: result, error: null });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/content-drafts.ts
git commit -m "feat(content-drafts): add POST /:id/generate-asset-prompts (AI path)"
```

---

## Task 4: Add manual-provider path to the new route

**Files:**
- Modify: `apps/api/src/routes/content-drafts.ts`

- [ ] **Step 1: Add the manual short-circuit block**

Inside the `POST /:id/generate-asset-prompts` handler from Task 3, just above the `const { result } = await generateWithFallback(` line, insert:

```typescript
        if (override.provider === 'manual') {
          const combinedPrompt = systemPrompt
            ? `${systemPrompt}\n\n${userMessage}`
            : userMessage;

          logAiUsage({
            userId: request.userId,
            orgId,
            action: 'manual.awaiting',
            provider: 'manual',
            model: 'manual',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            status: 'awaiting_manual',
            metadata: {
              draftId: id,
              stage: 'assets',
              channelId: (draft.channel_id as string) ?? null,
              prompt: combinedPrompt,
              input,
            },
          });

          return reply.status(202).send({
            data: { draftId: id, status: 'awaiting_manual', prompt: combinedPrompt },
            error: null,
          });
        }
```

This mirrors the existing manual block in `POST /:id/review` (around `:1153`) — same Axiom emit pattern, no DB state change, 202 response.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/content-drafts.ts
git commit -m "feat(content-drafts): manual-provider path for generate-asset-prompts"
```

---

## Task 5: Tests for `POST /:id/generate-asset-prompts`

**Files:**
- Modify: `apps/api/src/__tests__/routes/content-drafts.test.ts`

The existing test file mocks `generateWithFallback`, `loadAgentPrompt`, Supabase, etc. We'll add three test cases.

- [ ] **Step 1: Locate the end of the file and add a new describe block**

Append the following block to `apps/api/src/__tests__/routes/content-drafts.test.ts`. Add any missing mocks — in particular, confirm the existing `vi.mock('@/lib/ai/router', ...)` mock's `generateWithFallback` can be overridden per-test (it already accepts any args). Check if `buildChannelContext` is already mocked; if not, add a mock.

Before the test block, inside the existing mock section (if not present), add:

```typescript
vi.mock('@/lib/ai/channelContext', () => ({
  buildChannelContext: vi.fn(async () => 'channel: test\n'),
}));
```

(Skip if already present — use Grep to check first.)

Then add the describe block at the end of the file:

```typescript
describe('POST /content-drafts/:id/generate-asset-prompts', () => {
  const DRAFT_ID = 'draft-1';
  const ORG_ID = 'org-1';

  beforeEach(() => {
    // loadDraft chain
    mockChain.single.mockImplementation(() => Promise.resolve({
      data: {
        id: DRAFT_ID,
        user_id: 'user-1',
        org_id: ORG_ID,
        channel_id: 'ch-1',
        type: 'blog',
        title: 'Sample',
        draft_json: { blog: { outline: [{ h2: 'Intro', key_points: ['a', 'b'] }] } },
        canonical_core_json: {},
        idea_id: null,
        model_tier: 'standard',
      },
      error: null,
    }));
    mockChain.maybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  });

  it('returns BC_ASSETS_OUTPUT on AI path', async () => {
    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockResolvedValueOnce({
      result: {
        visual_direction: { style: 'minimal', color_palette: ['#000'], mood: 'calm', constraints: [] },
        slots: [{ slot: 'featured', section_title: 'Sample', prompt_brief: 'x', style_rationale: 'y', aspect_ratio: '16:9' }],
      },
      providerName: 'gemini',
      model: 'gemini-2.5-flash',
      attempts: 1,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/generate-asset-prompts`,
      headers: AUTH_USER,
      payload: { provider: 'gemini' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.slots).toHaveLength(1);
    expect(body.data.visual_direction.style).toBe('minimal');
    expect(body.error).toBeNull();
  });

  it('returns 202 awaiting_manual on manual path without calling the router', async () => {
    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockClear();

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/generate-asset-prompts`,
      headers: AUTH_USER,
      payload: { provider: 'manual' },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('awaiting_manual');
    expect(typeof body.data.prompt).toBe('string');
    expect(body.data.prompt).toContain('BC_ASSETS_INPUT');
    expect((router.generateWithFallback as any).mock.calls.length).toBe(0);
  });

  it('surfaces LLM errors via the response envelope', async () => {
    const router = await import('@/lib/ai/router');
    (router.generateWithFallback as any).mockRejectedValueOnce(new Error('provider down'));

    const res = await app.inject({
      method: 'POST',
      url: `/content-drafts/${DRAFT_ID}/generate-asset-prompts`,
      headers: AUTH_USER,
      payload: { provider: 'gemini' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.payload);
    expect(body.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npx vitest run apps/api/src/__tests__/routes/content-drafts.test.ts -t "generate-asset-prompts"`
Expected: all three tests PASS.

- [ ] **Step 3: Run the full content-drafts test file to ensure no regression**

Run: `npx vitest run apps/api/src/__tests__/routes/content-drafts.test.ts`
Expected: entire file passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/routes/content-drafts.test.ts
git commit -m "test(content-drafts): cover generate-asset-prompts route"
```

---

## Task 6: Client-side section splitter + unit tests

**Files:**
- Create: `apps/app/src/lib/assets/section-splitter.ts`
- Create: `apps/app/src/lib/assets/__tests__/section-splitter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/app/src/lib/assets/__tests__/section-splitter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { splitDraftBySections } from '../section-splitter';

describe('splitDraftBySections', () => {
  it('extracts intro + H2 sections in order', () => {
    const markdown = [
      'Intro paragraph one.',
      '',
      'Intro paragraph two.',
      '',
      '## First Heading',
      '',
      'Content under first.',
      '',
      '## Second Heading',
      '',
      'Content under second.',
    ].join('\n');

    const result = splitDraftBySections(markdown);

    expect(result.intro).toContain('Intro paragraph one');
    expect(result.intro).toContain('Intro paragraph two');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe('First Heading');
    expect(result.sections[0].body).toContain('Content under first.');
    expect(result.sections[1].heading).toBe('Second Heading');
    expect(result.sections[1].body).toContain('Content under second.');
  });

  it('handles no intro (starts with H2)', () => {
    const markdown = '## Only Heading\n\nBody.';
    const result = splitDraftBySections(markdown);
    expect(result.intro).toBe('');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].heading).toBe('Only Heading');
    expect(result.sections[0].body).toBe('Body.');
  });

  it('handles draft with no H2 at all', () => {
    const markdown = 'Just a paragraph. No headings.';
    const result = splitDraftBySections(markdown);
    expect(result.intro).toBe('Just a paragraph. No headings.');
    expect(result.sections).toHaveLength(0);
  });

  it('returns empty structure for empty input', () => {
    const result = splitDraftBySections('');
    expect(result.intro).toBe('');
    expect(result.sections).toHaveLength(0);
  });

  it('trims surrounding whitespace on intro and section bodies', () => {
    const markdown = '   \n\nIntro.\n\n## H\n\n   Body.   \n\n';
    const result = splitDraftBySections(markdown);
    expect(result.intro).toBe('Intro.');
    expect(result.sections[0].body).toBe('Body.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/app/src/lib/assets/__tests__/section-splitter.test.ts`
Expected: FAIL with `Cannot find module '../section-splitter'`.

- [ ] **Step 3: Implement the splitter**

Create `apps/app/src/lib/assets/section-splitter.ts`:

```typescript
/**
 * Splits a markdown draft into an intro block + an ordered list of H2 sections.
 * Used by the Assets engine "no-briefs" flow so the user can read the actual
 * section body when picking an image.
 */
export interface DraftSection {
  heading: string;
  body: string;
}

export interface SplitDraft {
  intro: string;
  sections: DraftSection[];
}

export function splitDraftBySections(markdown: string): SplitDraft {
  if (!markdown || !markdown.trim()) {
    return { intro: '', sections: [] };
  }

  const lines = markdown.split(/\r?\n/);
  let intro = '';
  const sections: DraftSection[] = [];

  let current: DraftSection | null = null;
  const introBuf: string[] = [];

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      else intro = introBuf.join('\n').trim();
      current = { heading: match[1].trim(), body: '' };
      continue;
    }
    if (current) {
      current.body += (current.body ? '\n' : '') + line;
    } else {
      introBuf.push(line);
    }
  }

  if (current) sections.push(current);
  else intro = introBuf.join('\n').trim();

  for (const s of sections) {
    s.body = s.body.trim();
  }

  return { intro, sections };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/app/src/lib/assets/__tests__/section-splitter.test.ts`
Expected: all 5 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/assets/section-splitter.ts apps/app/src/lib/assets/__tests__/section-splitter.test.ts
git commit -m "feat(assets): client-side markdown section splitter"
```

---

## Task 7: Rework `AssetsEngine` state model — add flow + brief-source state

**Files:**
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

We need to extend component state so the three-phase flow can track whether briefs exist and which sub-mode the Images phase is in. Keep all other existing state (`existingAssets`, `pendingUploads`, etc.).

- [ ] **Step 1: Update the `AssetPhase` type + state**

Near the top of the component (around `:25`), replace:

```typescript
type AssetPhase = 'prompts' | 'refined' | 'upload' | 'done';
```

with:

```typescript
type AssetPhase = 'briefs' | 'refine' | 'images';
type ImagesMode = 'brief' | 'no-briefs';
```

Update all references accordingly. Inside the component:

- Replace `const [phase, setPhase] = useState<AssetPhase>('prompts');` with `useState<AssetPhase>('briefs')`.
- Remove `maxPhaseReached` and `goToPhase` — simpler stepper: the user can click any step they've reached, driven by derived state (see Step 2).
- Add `const [imagesMode, setImagesMode] = useState<ImagesMode>('brief');`.

- [ ] **Step 2: Derive stepper state from data, not a separate tracker**

Replace the `phaseOrder` / `phases` arrays and the stepper render with a data-driven stepper. The stepper uses three steps: `briefs`, `refine`, `images`. `refine` is disabled when `imagesMode === 'no-briefs'` or when `slotCards.length === 0`. Replace the existing stepper JSX (the block that maps over `phases` near `:545`) with:

```tsx
{/* Phase stepper */}
<div className="flex items-center gap-3">
  {([
    { key: 'briefs' as const, label: 'Briefs' },
    { key: 'refine' as const, label: 'Refine', disabled: imagesMode === 'no-briefs' || slotCards.length === 0 },
    { key: 'images' as const, label: 'Images' },
  ]).map((step, i, arr) => {
    const active = phase === step.key;
    const reached =
      step.key === 'briefs' ||
      (step.key === 'refine' && slotCards.length > 0) ||
      step.key === 'images';
    const canClick = reached && !step.disabled;
    return (
      <div key={step.key} className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canClick}
          onClick={() => canClick && setPhase(step.key)}
          className={`flex items-center gap-1.5 text-sm transition-colors ${
            active ? 'text-primary font-medium'
              : canClick ? 'text-muted-foreground hover:text-foreground cursor-pointer'
              : 'text-muted-foreground/40 cursor-not-allowed'
          }`}
        >
          {active ? (
            <div className="h-4 w-4 rounded-full border-2 border-primary flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
          ) : (
            <div className={`h-4 w-4 rounded-full border-2 ${canClick ? 'border-muted-foreground' : 'border-muted-foreground/30'}`} />
          )}
          {step.label}
        </button>
        {i < arr.length - 1 && <div className="h-px w-8 bg-border" />}
      </div>
    );
  })}
</div>
```

- [ ] **Step 3: Update `useEffect` for existing assets**

Find the mount effect that currently does `setPhase('done')` when assets exist (around `:205`). Replace:

```typescript
if (items.length > 0) {
  // …existing mapping…
  setExistingAssets(mapped);
  setPhase('done');
  setMaxPhaseReached('done');
}
```

with:

```typescript
if (items.length > 0) {
  // …existing mapping…
  setExistingAssets(mapped);
  setPhase('images');
  setImagesMode('no-briefs');
}
```

Rationale: briefs are not persisted (spec says so) — if assets already exist, drop user directly into Images in no-briefs mode so they can view and add more.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/app`
Expected: existing references to `'prompts' | 'refined' | 'upload' | 'done'` will now error — that's intentional, we fix them in the following tasks. For this commit, if the typecheck has errors only in `AssetsEngine.tsx`, that's expected. Do NOT commit until the rendering sections are also migrated.

**Note:** Because this task changes the phase enum and breaks rendering, combine Steps 1-3 with Tasks 8-11 into a single commit at the end of Task 11. Do not commit after Task 7.

---

## Task 8: Rewrite Phase 1 (Briefs) — provider picker + skip option

**Files:**
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

- [ ] **Step 1: Add new imports**

Near the top of the file, update the lucide-react import block to include `SkipForward` if not already present:

```typescript
import {
  Loader2, ArrowRight, Check, Upload, Image as ImageIcon,
  Sparkles, Palette, Trash2, Link2, ChevronDown, ChevronUp, Copy,
  ClipboardPaste, SkipForward,
} from 'lucide-react';
```

Ensure `ManualOutputDialog` is imported (added in a previous turn) and `ModelPicker`, `MODELS_BY_PROVIDER`, `ProviderId` are imported:

```typescript
import { ManualOutputDialog } from './ManualOutputDialog';
import { ModelPicker, MODELS_BY_PROVIDER, type ProviderId } from '@/components/ai/ModelPicker';
```

Remove the `ManualModePanel` import if still present, and remove the `Tabs`-family imports if they're no longer referenced (grep after this task completes).

- [ ] **Step 2: Add provider state**

Inside the component body, add:

```typescript
const ASSETS_PROVIDERS: ProviderId[] = ['gemini', 'openai', 'manual'];
const [provider, setProvider] = useState<ProviderId>('gemini');
const [model, setModel] = useState<string>(MODELS_BY_PROVIDER.gemini[0].id);
const [generatingBriefs, setGeneratingBriefs] = useState(false);
const [manualBriefsOpen, setManualBriefsOpen] = useState(false);
```

- [ ] **Step 3: Add the brief-generation handler**

Add this function next to `handleManualImport` (which stays — it's reused by the ManualOutputDialog):

```typescript
async function handleGenerateBriefs() {
  if (!draftId || generatingBriefs) return;
  setGeneratingBriefs(true);
  try {
    const body: Record<string, unknown> = { provider };
    if (model && provider !== 'manual') body.model = model;
    const res = await fetch(`/api/content-drafts/${draftId}/generate-asset-prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) {
      toast.error(json.error.message ?? 'Failed to generate briefs');
      return;
    }
    if (json.data?.status === 'awaiting_manual') {
      setManualBriefsOpen(true);
      return;
    }
    await handleManualImport(json.data);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Failed to generate briefs');
  } finally {
    setGeneratingBriefs(false);
  }
}

function handleSkipBriefs() {
  setImagesMode('no-briefs');
  setSlotCards([]);
  setVisualDirection(null);
  setPhase('images');
}
```

- [ ] **Step 4: Replace the Phase 1 render block**

Find the current `{phase === 'prompts' && (` block and replace with:

```tsx
{phase === 'briefs' && (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Step 1: Briefs</CardTitle>
      <p className="text-xs text-muted-foreground mt-1">
        Generate refined image prompts for each section, or skip briefs and pick images from the section content directly.
      </p>
    </CardHeader>
    <CardContent className="space-y-5">
      {/* Option 1: Generate briefs */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Generate briefs
        </Label>
        <ModelPicker
          providers={ASSETS_PROVIDERS}
          provider={provider}
          model={model}
          recommended={{ provider: null, model: null }}
          onProviderChange={(p) => {
            setProvider(p);
            if (p === 'manual') setModel('manual');
            else setModel(MODELS_BY_PROVIDER[p][0].id);
          }}
          onModelChange={setModel}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {provider === 'manual'
              ? 'Manual: a prompt will be emitted to Axiom. Paste the output JSON when ready.'
              : 'AI: runs the assets agent with the selected model.'}
          </p>
          <Button
            onClick={handleGenerateBriefs}
            disabled={generatingBriefs || !draftId}
            className="gap-2 shrink-0"
          >
            {generatingBriefs ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : provider === 'manual' ? (
              <ClipboardPaste className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {provider === 'manual' ? 'Get Manual Prompt' : 'Generate Briefs'}
          </Button>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Option 2: Skip briefs */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Skip briefs
          </Label>
          <p className="text-xs text-muted-foreground">
            Pick images yourself using each section&apos;s title + content as context.
          </p>
        </div>
        <Button variant="outline" className="gap-2 shrink-0" onClick={handleSkipBriefs}>
          <SkipForward className="h-4 w-4" />
          Skip Briefs
        </Button>
      </div>
    </CardContent>
  </Card>
)}

{/* Manual paste dialog for briefs */}
<ManualOutputDialog
  open={manualBriefsOpen}
  onOpenChange={(open) => setManualBriefsOpen(open)}
  title="Paste Asset Prompt Briefs"
  description="Retrieve the prompt from Axiom, run it in your AI tool, then paste the BC_ASSETS_OUTPUT JSON here."
  submitLabel="Import Briefs"
  onSubmit={async (parsed) => {
    await handleManualImport(parsed);
    setManualBriefsOpen(false);
  }}
/>
```

The existing `handleManualImport` already advances `phase` via `goToPhase('refined')`. Update `handleManualImport` to use the new phase name — replace `goToPhase('refined')` with:

```typescript
setPhase('refine');
setImagesMode('brief');
```

- [ ] **Step 5: Remove dead code**

Delete the old `handleGenerateAll` function and the removed `goToPhase` / `maxPhaseReached` bits. Remove the old `Tabs`-based UI (already replaced above). Also delete `inputContext` state + its `useEffect` — the new route takes the input server-side, so the client no longer needs it.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/app`
Expected: PASS for AssetsEngine.tsx Phase 1 block. Other phases may still error — fixed in subsequent tasks.

---

## Task 9: Rewrite Phase 2 (Refine)

**Files:**
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

- [ ] **Step 1: Replace the Phase 2 render block**

Find the current `{phase === 'refined' && (` block and replace with:

```tsx
{phase === 'refine' && (
  <div className="space-y-4">
    {/* Visual direction banner */}
    {visualDirection && (
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Palette className="h-5 w-5 text-purple-500 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">Visual Direction</div>
              {visualDirection.style && (
                <div className="text-xs text-muted-foreground">{visualDirection.style}</div>
              )}
              {visualDirection.mood && (
                <div className="text-xs text-muted-foreground">Mood: {visualDirection.mood}</div>
              )}
              {visualDirection.colorPalette.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  {visualDirection.colorPalette.map((color) => (
                    <div
                      key={color}
                      className="h-5 w-5 rounded border"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              )}
              {visualDirection.constraints.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Constraints: {visualDirection.constraints.join(' | ')}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )}

    {/* Per-slot prompt editors */}
    {slotCards.map((card, i) => (
      <Card key={card.slot}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Badge variant={card.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
              {card.slot}
            </Badge>
            <CardTitle className="text-sm">{card.sectionTitle}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Prompt Brief</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => {
                  const full = buildFullPrompt(card, visualDirection);
                  void navigator.clipboard.writeText(full);
                  toast.success(`Full image prompt copied for ${card.slot}`);
                }}
              >
                <Copy className="h-3 w-3" /> Copy Full Prompt
              </Button>
            </div>
            <Textarea
              value={card.promptBrief}
              onChange={(e) => {
                const updated = [...slotCards];
                updated[i] = { ...card, promptBrief: e.target.value };
                setSlotCards(updated);
              }}
              rows={3}
              className="text-sm"
            />
          </div>
          {card.styleRationale && (
            <div className="text-xs text-muted-foreground">{card.styleRationale}</div>
          )}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Aspect Ratio</Label>
            <select
              value={card.aspectRatio}
              onChange={(e) => {
                const updated = [...slotCards];
                updated[i] = { ...card, aspectRatio: e.target.value };
                setSlotCards(updated);
              }}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
              <option value="4:3">4:3</option>
            </select>
          </div>
        </CardContent>
      </Card>
    ))}

    {/* Actions */}
    <div className="flex items-center gap-3">
      <Button
        onClick={() => { setImagesMode('brief'); setPhase('images'); }}
        className="gap-2"
      >
        Continue to Images
        <ArrowRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" onClick={() => setPhase('briefs')}>
        Regenerate Briefs
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/app`
Expected: Phase 2 block has no errors. Phase 3 still pending.

---

## Task 10: Rewrite Phase 3 (Images) — brief mode

**Files:**
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

Phase 3 is rendered in two modes. Start with brief mode. (No-briefs mode in Task 11.)

- [ ] **Step 1: Replace the old `phase === 'upload'` block header**

Find the old `{phase === 'upload' && (` block and change the outer condition to `{phase === 'images' && imagesMode === 'brief' && (`. Inside:

```tsx
{phase === 'images' && imagesMode === 'brief' && (
  <div className="space-y-4">
    {slotCards.map((card) => {
      const role = slotToRole(card.slot);
      const existing = existingAssets.find((a) => a.role === role) ?? slotAssets[card.slot] ?? null;
      const pending = pendingUploads.find((p) => p.slot === card.slot);
      const isGeneratingThis = generatingSlot === card.slot;
      return (
        <BriefImageSlotCard
          key={card.slot}
          card={card}
          visualDirection={visualDirection}
          existingAsset={existing}
          pendingPreview={pending?.preview}
          generating={isGeneratingThis}
          generateDisabled={!!generatingSlot}
          onGenerate={() => handleGenerateSlot(card)}
          onFileStage={(file) => handleFileStage(card.slot, file)}
          onUrlStage={(url) => handleUrlStage(card.slot, url)}
          onDeletePending={() => handleDeletePending(card.slot)}
        />
      );
    })}

    {/* Actions */}
    <div className="flex items-center gap-3">
      <Button
        onClick={handleFinish}
        disabled={finishing}
        className="gap-2"
      >
        {finishing ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
        ) : (
          <><Check className="h-4 w-4" />Finish &amp; Save</>
        )}
      </Button>
      <Button
        variant="outline"
        onClick={() => setPhase('refine')}
        disabled={finishing}
      >
        Back to Refine
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Implement the `BriefImageSlotCard` sub-component**

Replace the existing `SlotUploadCard` sub-component at the bottom of the file with `BriefImageSlotCard`. Keep `SlotUploadCard` gone — the new component fully replaces it.

```tsx
interface BriefImageSlotCardProps {
  card: SlotCard;
  visualDirection: VisualDirection | null;
  existingAsset: ContentAsset | null;
  pendingPreview?: string;
  generating: boolean;
  generateDisabled: boolean;
  onGenerate: () => void;
  onFileStage: (file: File) => void;
  onUrlStage: (url: string) => void;
  onDeletePending: () => void;
}

function BriefImageSlotCard({
  card, visualDirection, existingAsset, pendingPreview,
  generating, generateDisabled,
  onGenerate, onFileStage, onUrlStage, onDeletePending,
}: BriefImageSlotCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = existingAsset?.url ?? pendingPreview;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={card.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
              {card.slot}
            </Badge>
            <span className="text-sm font-medium">{card.sectionTitle}</span>
            {preview && <Check className="h-3.5 w-3.5 text-green-500" />}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {expanded && (
          <div className="text-xs text-muted-foreground p-2 rounded bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Prompt:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px] gap-1"
                onClick={() => {
                  const full = buildFullPrompt(card, visualDirection);
                  void navigator.clipboard.writeText(full);
                  toast.success(`Copied full prompt for ${card.slot}`);
                }}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div>{card.promptBrief}</div>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={card.sectionTitle}
              className="w-full max-h-56 rounded-lg border object-cover"
            />
            {pendingPreview && !existingAsset && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onDeletePending}>
                <Trash2 className="h-3 w-3" /> Remove Staged
              </Button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onGenerate}
            disabled={generateDisabled}
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {existingAsset ? 'Regenerate with AI' : 'Generate with AI'}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileStage(file);
            }}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload File
          </Button>

          <div className="flex items-center gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="…or paste image URL"
              className="text-xs h-8 w-56"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={!urlInput.trim()}
              onClick={() => { onUrlStage(urlInput); setUrlInput(''); }}
            >
              <Link2 className="h-3.5 w-3.5" /> Add URL
            </Button>
          </div>
        </div>

        {/* Drag-drop zone when no preview yet */}
        {!preview && (
          <div
            className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) onFileStage(file);
              else toast.error('Drop an image file');
            }}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground/60" />
            <div className="text-xs text-muted-foreground mt-1">Drag & drop image here</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=@brighttale/app`
Expected: brief-mode block compiles. No-briefs mode pending.

---

## Task 11: Phase 3 no-briefs mode + slot derivation

**Files:**
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

When the user skipped briefs (or `existingAssets` loaded on mount), they enter `imagesMode === 'no-briefs'`. We still need per-slot cards, but the content shows section title + key points + expandable full section body instead of a refined prompt. The slots themselves come from `/asset-prompts` (data only) — if we don't already have them, fetch.

- [ ] **Step 1: Add state + effect to fetch slots for no-briefs mode**

Add below existing state:

```typescript
interface NoBriefSection {
  slot: string;
  sectionTitle: string;
  keyPoints: string[];
  body: string;
}
const [noBriefSections, setNoBriefSections] = useState<NoBriefSection[]>([]);
```

Add a new effect that fetches `/asset-prompts` and splits the draft when entering no-briefs mode and the sections aren't yet loaded:

```typescript
useEffect(() => {
  async function fetchNoBriefSections() {
    if (!draftId) return;
    if (imagesMode !== 'no-briefs') return;
    if (noBriefSections.length > 0) return;
    try {
      const [promptsRes, draftRes] = await Promise.all([
        fetch(`/api/content-drafts/${draftId}/asset-prompts`, { method: 'POST' }),
        fetch(`/api/content-drafts/${draftId}`),
      ]);
      const promptsJson = await promptsRes.json();
      const draftJson = await draftRes.json();

      const sections = (promptsJson.data?.sections ?? []) as Array<{
        slot: string; section_title: string; key_points: string[];
      }>;

      const fullDraft =
        (((draftJson.data?.draft_json ?? {}) as Record<string, unknown>).blog as Record<string, unknown> | undefined)?.full_draft as string | undefined
        ?? ((draftJson.data?.draft_json ?? {}) as Record<string, unknown>).full_draft as string | undefined
        ?? '';

      const { splitDraftBySections } = await import('@/lib/assets/section-splitter');
      const split = splitDraftBySections(fullDraft);

      // Map slots to bodies by order: featured -> intro; section_N -> sections[N-1]
      const mapped: NoBriefSection[] = sections.map((s, i) => ({
        slot: s.slot,
        sectionTitle: s.section_title,
        keyPoints: s.key_points,
        body:
          s.slot === 'featured'
            ? split.intro
            : (split.sections[i - 1]?.body ?? ''),
      }));

      setNoBriefSections(mapped);
    } catch {
      // non-fatal
    }
  }
  void fetchNoBriefSections();
}, [draftId, imagesMode, noBriefSections.length]);
```

- [ ] **Step 2: Add the no-briefs render block**

Just after the brief-mode block from Task 10, add:

```tsx
{phase === 'images' && imagesMode === 'no-briefs' && (
  <div className="space-y-4">
    {noBriefSections.length === 0 ? (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading sections…
        </CardContent>
      </Card>
    ) : noBriefSections.map((section) => {
      const role = slotToRole(section.slot);
      const existing = existingAssets.find((a) => a.role === role) ?? null;
      const pending = pendingUploads.find((p) => p.slot === section.slot);
      return (
        <NoBriefImageSlotCard
          key={section.slot}
          section={section}
          existingAsset={existing}
          pendingPreview={pending?.preview}
          onFileStage={(file) => handleFileStage(section.slot, file)}
          onUrlStage={(url) => handleUrlStage(section.slot, url)}
          onDeletePending={() => handleDeletePending(section.slot)}
        />
      );
    })}

    <div className="flex items-center gap-3">
      <Button onClick={handleFinish} disabled={finishing} className="gap-2">
        {finishing ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
        ) : (
          <><Check className="h-4 w-4" />Finish &amp; Save</>
        )}
      </Button>
      <Button variant="outline" onClick={() => setPhase('briefs')} disabled={finishing}>
        Back to Briefs
      </Button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Implement `NoBriefImageSlotCard` sub-component**

At the bottom of the file, below `BriefImageSlotCard`:

```tsx
interface NoBriefImageSlotCardProps {
  section: { slot: string; sectionTitle: string; keyPoints: string[]; body: string };
  existingAsset: ContentAsset | null;
  pendingPreview?: string;
  onFileStage: (file: File) => void;
  onUrlStage: (url: string) => void;
  onDeletePending: () => void;
}

function NoBriefImageSlotCard({
  section, existingAsset, pendingPreview,
  onFileStage, onUrlStage, onDeletePending,
}: NoBriefImageSlotCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preview = existingAsset?.url ?? pendingPreview;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={section.slot === 'featured' ? 'default' : 'outline'} className="text-[10px]">
              {section.slot}
            </Badge>
            <span className="text-sm font-medium">{section.sectionTitle}</span>
            {preview && <Check className="h-3.5 w-3.5 text-green-500" />}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} disabled={!section.body}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.keyPoints.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            {section.keyPoints.map((kp, i) => <li key={i}>{kp}</li>)}
          </ul>
        )}

        {expanded && section.body && (
          <div className="text-xs p-2 rounded bg-muted/50 space-y-2 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between sticky top-0 bg-muted/50 py-0.5">
              <span className="font-medium">Section content:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px] gap-1"
                onClick={() => {
                  void navigator.clipboard.writeText(section.body);
                  toast.success('Section content copied');
                }}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div className="whitespace-pre-wrap">{section.body}</div>
          </div>
        )}

        {preview && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={section.sectionTitle}
              className="w-full max-h-56 rounded-lg border object-cover"
            />
            {pendingPreview && !existingAsset && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onDeletePending}>
                <Trash2 className="h-3 w-3" /> Remove Staged
              </Button>
            )}
          </div>
        )}

        {/* Upload-only actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileStage(file);
            }}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload File
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="…or paste image URL"
              className="text-xs h-8 w-56"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={!urlInput.trim()}
              onClick={() => { onUrlStage(urlInput); setUrlInput(''); }}
            >
              <Link2 className="h-3.5 w-3.5" /> Add URL
            </Button>
          </div>
        </div>

        {!preview && (
          <div
            className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) onFileStage(file);
              else toast.error('Drop an image file');
            }}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground/60" />
            <div className="text-xs text-muted-foreground mt-1">Drag & drop image here</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Update `handleFinish` to clear required-featured gate**

Find `handleFinish` (existing in the file). Remove any guard that required a featured upload. The current code already checks `!featuredPending || finishing` on the button `disabled` — we removed that condition in Task 10's actions block. Also ensure `handleFinish` no longer throws when there are zero pending uploads: if `pendingUploads.length === 0` and `existingAssets.length > 0`, treat as a no-op upload phase and just advance. Wrap the existing for-loop with a guard:

```typescript
async function handleFinish() {
  if (inFlightRef.current) return;
  inFlightRef.current = true;
  setFinishing(true);
  try {
    tracker.trackStarted({ draftId, mode: 'upload' });
    if (pendingUploads.length === 0) {
      // Nothing to upload — just advance and report existing assets.
      const assetIds = existingAssets.map((a) => a.id);
      const featuredUrl = existingAssets.find((a) => a.role === 'featured_image')?.url;
      tracker.trackCompleted({ draftId, assetCount: existingAssets.length, assetIds, featuredImageUrl: featuredUrl });
      onComplete({ assetIds, featuredImageUrl: featuredUrl } as AssetsResult);
      return;
    }
    // …existing for-loop + finalisation logic stays…
```

Also update the finalisation path at the end of the for-loop: after `onComplete` is constructed, call `onComplete(...)` immediately instead of only advancing phase.

- [ ] **Step 5: Remove unused phase 'done' block**

Find and delete the remaining `{phase === 'done' && (` block entirely — the new flow calls `onComplete` directly from `handleFinish`. The previous "Add More Images" button is no longer needed: users can re-enter via the stepper.

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck --workspace=@brighttale/app`
Expected: full pass.

Run: `npm run lint --workspace=@brighttale/app`
Expected: no new errors.

- [ ] **Step 7: Commit tasks 7–11 together**

```bash
git add apps/app/src/components/engines/AssetsEngine.tsx
git commit -m "feat(assets-ui): redesign with 3 phases and no-briefs mode"
```

---

## Task 12: Manual smoke test + final commit

No automated tests for the composed UI — verify manually.

- [ ] **Step 1: Start the dev stack**

Run: `npm run dev`
Wait for `http://localhost:3000` and `http://localhost:3001` to be ready.

- [ ] **Step 2: Full-AI flow**

Navigate to a project with an existing draft that has no assets. Expected:
1. Land on Assets stage → Phase 1 (Briefs) card visible with ModelPicker + "Generate Briefs" + "Skip Briefs".
2. Select Gemini + default model, click "Generate Briefs". Expect advance to Phase 2 (Refine) with visual-direction banner and one card per outline H2 + featured.
3. Edit one prompt brief, click "Continue to Images". Expect Phase 3 brief mode with each slot showing "Generate with AI" / "Upload File" / "URL".
4. Click "Generate with AI" on the featured slot. Expect an inline image preview within ~10s.
5. Upload a file to another slot. Expect staged preview.
6. Click "Finish & Save". Expect toast + transition to Publish stage.

- [ ] **Step 3: Manual-provider brief flow**

Same starting state. Expected:
1. Phase 1: pick Manual provider, click "Get Manual Prompt".
2. Check Axiom dashboard — event with `action: manual.awaiting`, `stage: assets`, full combined prompt in metadata.
3. Run the combined prompt in ChatGPT externally. Paste the raw `BC_ASSETS_OUTPUT` JSON into the dialog. Submit.
4. Expect advance to Phase 2 with parsed briefs.

- [ ] **Step 4: Skip-briefs (fully manual) flow**

Fresh draft, Phase 1 → click "Skip Briefs". Expected:
1. Phase 3 no-briefs mode. Each slot shows section title + key points (bullets) + chevron for "Read full section".
2. Expand a section → markdown body renders. "Copy Section Content" button works.
3. Upload files/URLs per slot. No "Generate with AI" button present.
4. "Finish & Save" completes.

- [ ] **Step 5: Existing-assets mount**

Open the same draft again after it has assets. Expected: lands on Phase 3 no-briefs mode with existing assets rendered inline and "Finish & Save" enabled as a no-op forward.

- [ ] **Step 6: Final commit (if any fixes)**

If manual testing surfaced issues, fix them, then:

```bash
git add -A
git commit -m "fix(assets-ui): post-smoke-test corrections"
```

---

## Self-Review

**Spec coverage check:**

- ✅ New endpoint `POST /generate-asset-prompts` — Tasks 1–4.
- ✅ Agent definition already exists + seeded — no task needed.
- ✅ Client-side section splitter — Task 6.
- ✅ `ManualOutputDialog` replaces `ManualModePanel` — Task 8 Step 1 + Step 4.
- ✅ Three phases (Briefs / Refine / Images) — Tasks 7–11.
- ✅ Phase 1 two options (Generate / Skip) — Task 8.
- ✅ Phase 3 brief mode (AI gen / Upload mix) — Task 10.
- ✅ Phase 3 no-briefs mode (section title + key points + expandable body) — Task 11.
- ✅ All images optional — Task 11 Step 4 removes the featured-required gate.
- ✅ Tests for new route (AI path, manual path, error path) — Task 5.
- ✅ Tests for section splitter — Task 6.
- ✅ Tests for prompt builder — Task 2.
- ✅ Manual smoke test covering all three flows — Task 12.

**Placeholder scan:** No TBDs. Every code block is complete and self-contained.

**Type consistency:** `AssetPhase` enum updated everywhere. `ImagesMode` consistent. `ContentAsset` / `SlotCard` / `VisualDirection` unchanged — reused as-is. `ASSETS_PROVIDERS`, `buildAssetsMessage`, `buildAssetsInput` all referenced consistently between tasks.

**Out of scope (documented in spec, not touched here):** credits accounting, ChatGPT image provider, persisting briefs.
