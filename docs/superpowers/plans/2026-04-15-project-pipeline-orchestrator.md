# Project Pipeline Orchestrator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pipeline page logic into reusable engine components, build a project pipeline orchestrator that composes them inline with context passing, auto-mode, and import from library.

**Architecture:** Six engine components extracted from existing pages, composed by a PipelineOrchestrator on the project detail page. Standalone channel-scoped pages become thin wrappers around the same engines. Pipeline state persists in `projects.pipeline_state_json`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase, Zod, shadcn/ui, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-15-project-pipeline-orchestrator-design.md`

---

## File Structure

### New files to create

```
apps/app/src/components/engines/types.ts              — Shared types: PipelineContext, StageResult, EngineProps, PipelineState
apps/app/src/components/engines/ContextBanner.tsx      — Upstream context display for each engine
apps/app/src/components/engines/BrainstormEngine.tsx   — Brainstorm generate + import modes
apps/app/src/components/engines/ResearchEngine.tsx     — Research generate + import modes
apps/app/src/components/engines/DraftEngine.tsx        — Draft generate + import modes
apps/app/src/components/engines/ReviewEngine.tsx       — Review (always fresh evaluation)
apps/app/src/components/engines/AssetsEngine.tsx       — Assets generate + import modes
apps/app/src/components/engines/PublishEngine.tsx      — Publish to WordPress
apps/app/src/components/engines/ImportPicker.tsx       — Reusable library browser with search/filter
apps/app/src/components/pipeline/PipelineOrchestrator.tsx — State machine, mode toggle, stage transitions
apps/app/src/components/pipeline/CompletedStageSummary.tsx — Collapsed card for finished stages
apps/app/src/components/pipeline/AutoModeControls.tsx  — Pause/resume, progress, iteration display
supabase/migrations/20260415100000_project_pipeline_state.sql — Add pipeline_state_json column
```

### Existing files to modify

```
apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/new/page.tsx       — Thin wrapper around BrainstormEngine
apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/[sessionId]/page.tsx — Thin wrapper, pre-loaded results
apps/app/src/app/[locale]/(app)/channels/[id]/research/new/page.tsx          — Thin wrapper around ResearchEngine
apps/app/src/app/[locale]/(app)/channels/[id]/research/[sessionId]/page.tsx  — Thin wrapper, pre-loaded results
apps/app/src/app/[locale]/(app)/channels/[id]/drafts/new/page.tsx            — Thin wrapper around DraftEngine
apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx      — Tabs wrapper around engines
apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx                       — Rewritten to use PipelineOrchestrator
```

---

## Phase 1: Foundation — Types & Context Banner

### Task 1: Engine types and interfaces

**Files:**
- Create: `apps/app/src/components/engines/types.ts`

- [ ] **Step 1: Create the types file with all shared interfaces**

```typescript
// apps/app/src/components/engines/types.ts

export type PipelineStage =
  | 'brainstorm'
  | 'research'
  | 'draft'
  | 'review'
  | 'assets'
  | 'publish';

export const PIPELINE_STAGES: PipelineStage[] = [
  'brainstorm', 'research', 'draft', 'review', 'assets', 'publish',
];

/** Accumulated context passed from completed stages to downstream engines. */
export interface PipelineContext {
  // Brainstorm output
  ideaId?: string;
  ideaTitle?: string;
  ideaVerdict?: string;
  ideaCoreTension?: string;
  brainstormSessionId?: string;

  // Research output
  researchSessionId?: string;
  approvedCardsCount?: number;
  researchLevel?: string;

  // Draft output
  draftId?: string;
  draftTitle?: string;
  draftType?: string;
  canonicalCoreJson?: Record<string, unknown>;

  // Review output
  reviewScore?: number;
  reviewVerdict?: string;
  iterationCount?: number;
  feedbackJson?: Record<string, unknown>;

  // Assets output
  assetIds?: string[];
  featuredImageUrl?: string;

  // Publish output
  wordpressPostId?: number;
  publishedUrl?: string;

  // Project metadata
  projectId?: string;
  projectTitle?: string;
  channelId?: string;
}

/** Result payload each engine passes to onComplete. */
export interface BrainstormResult {
  ideaId: string;
  ideaTitle: string;
  ideaVerdict: string;
  ideaCoreTension: string;
  brainstormSessionId?: string;
}

export interface ResearchResult {
  researchSessionId: string;
  approvedCardsCount: number;
  researchLevel: string;
}

export interface DraftResult {
  draftId: string;
  draftTitle: string;
  draftContent: string;
}

export interface ReviewResult {
  score: number;
  verdict: string;
  feedbackJson: Record<string, unknown>;
  iterationCount: number;
}

export interface AssetsResult {
  assetIds: string[];
  featuredImageUrl?: string;
}

export interface PublishResult {
  wordpressPostId: number;
  publishedUrl: string;
}

export type StageResult =
  | BrainstormResult
  | ResearchResult
  | DraftResult
  | ReviewResult
  | AssetsResult
  | PublishResult;

/** Common props all engines receive. */
export interface BaseEngineProps {
  mode: 'generate' | 'import';
  channelId: string;
  context: PipelineContext;
  onComplete: (result: StageResult) => void;
  onBack?: (targetStage?: PipelineStage) => void;
}

/** Persisted pipeline state on the project record. */
export interface PipelineState {
  mode: 'step-by-step' | 'auto';
  currentStage: PipelineStage;
  stageResults: {
    brainstorm?: BrainstormResult & { completedAt: string };
    research?: ResearchResult & { completedAt: string };
    draft?: DraftResult & { completedAt: string };
    review?: ReviewResult & { completedAt: string };
    assets?: AssetsResult & { completedAt: string };
    publish?: PublishResult & { completedAt: string };
  };
  autoConfig: {
    maxReviewIterations: number;
    targetScore: number;
    pausedAt?: PipelineStage;
  };
}

export const DEFAULT_PIPELINE_STATE: PipelineState = {
  mode: 'step-by-step',
  currentStage: 'brainstorm',
  stageResults: {},
  autoConfig: {
    maxReviewIterations: 5,
    targetScore: 90,
  },
};
```

- [ ] **Step 2: Align PipelineStages.tsx key naming**

The existing `PipelineStages.tsx` uses `'production'` as the step key but labels it "Draft". Update it to use `'draft'` as the key (matching the new engine types). Also update the `PipelineStep` type export:

In `apps/app/src/components/pipeline/PipelineStages.tsx`, change:
- `'production'` → `'draft'` in the `PipelineStep` type union
- `{ key: 'production', label: 'Draft', ... }` → `{ key: 'draft', label: 'Draft', ... }`
- In `buildStepUrl`, rename `case 'production':` → `case 'draft':`

Then update all call sites that pass `currentStep="production"` to use `currentStep="draft"`:
- `channels/[id]/drafts/new/page.tsx`
- `channels/[id]/drafts/[draftId]/page.tsx`
- `projects/[id]/page.tsx`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | grep engines/types || echo "OK"`
Expected: OK (no errors from this file)

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/types.ts
git add apps/app/src/components/pipeline/PipelineStages.tsx
git commit -m "feat(engines): add shared pipeline types, align PipelineStages key naming"
```

---

### Task 2: ContextBanner component

**Files:**
- Create: `apps/app/src/components/engines/ContextBanner.tsx`

- [ ] **Step 1: Create the ContextBanner component**

```typescript
// apps/app/src/components/engines/ContextBanner.tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, Search, FileText, ArrowLeft } from 'lucide-react';
import type { PipelineContext, PipelineStage } from './types';

interface ContextBannerProps {
  stage: PipelineStage;
  context: PipelineContext;
  onBack?: (targetStage?: PipelineStage) => void;
}

/**
 * Shows upstream pipeline context at the top of each engine.
 * Research shows the selected idea, Draft shows idea + research, etc.
 */
export function ContextBanner({ stage, context, onBack }: ContextBannerProps) {
  if (stage === 'brainstorm') return null; // first stage, no upstream context

  const items: { icon: typeof Lightbulb; label: string; detail: string; backTo: PipelineStage }[] = [];

  if (context.ideaTitle) {
    items.push({
      icon: Lightbulb,
      label: 'Idea',
      detail: `${context.ideaTitle}${context.ideaVerdict ? ` (${context.ideaVerdict})` : ''}`,
      backTo: 'brainstorm',
    });
  }

  if (stage !== 'research' && context.researchSessionId) {
    items.push({
      icon: Search,
      label: 'Research',
      detail: `${context.approvedCardsCount ?? 0} cards approved · ${context.researchLevel ?? 'unknown'} depth`,
      backTo: 'research',
    });
  }

  if (['review', 'assets', 'publish'].includes(stage) && context.draftTitle) {
    items.push({
      icon: FileText,
      label: 'Draft',
      detail: context.draftTitle,
      backTo: 'draft',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-3 text-sm"
          >
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-xs text-muted-foreground">{item.label}:</span>
            <span className="truncate flex-1">{item.detail}</span>
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => onBack(item.backTo)}
              >
                <ArrowLeft className="h-3 w-3 mr-1" /> Change
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | grep ContextBanner || echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/engines/ContextBanner.tsx
git commit -m "feat(engines): add ContextBanner for upstream pipeline context display"
```

---

## Phase 2: Extract Engine Components

### Task 3: BrainstormEngine

**Files:**
- Create: `apps/app/src/components/engines/BrainstormEngine.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/new/page.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/[sessionId]/page.tsx`

- [ ] **Step 1: Create BrainstormEngine component**

Extract from `brainstorm/new/page.tsx` (lines 54-543) and `brainstorm/[sessionId]/page.tsx` (lines 40-218). The engine handles:

- **Generate mode**: Settings form (input mode, model picker, topic, advanced settings), AI/Manual tabs, progress indicator, idea cards with selection, "Selected" badge for project-linked idea
- **Import mode**: Search/filter interface over ideas library, idea cards with selection
- **Pre-loaded results**: When `initialSession` and `initialIdeas` props are provided (for session detail pages), skip generation and show results directly

Key props beyond BaseEngineProps:
```typescript
interface BrainstormEngineProps extends BaseEngineProps {
  initialSession?: Session;          // Pre-loaded session (for /[sessionId] pages)
  initialIdeas?: Idea[];             // Pre-loaded ideas
  preSelectedIdeaId?: string;        // Idea already chosen for this project
}
```

The component must:
1. Copy all state variables from brainstorm/new: `mode, provider, model, recommended, topic, niche, tone, audience, goal, constraints, referenceUrl, running, ideas, selectedIdeaId, elapsed, generationMode`
2. Copy `handleRun()` (POST /api/brainstorm/sessions), `handleManualImport()` (parse JSON, POST /api/ideas/library)
3. Copy all UI sections: mode selector, input fields, AI/Manual tabs, progress card, idea cards, sticky footer
4. Replace `router.push(...)` in "Next: Research" handler with `onComplete({ ideaId, ideaTitle, ideaVerdict, ideaCoreTension, brainstormSessionId })`
5. Replace `router.push(...)` in regenerate handler with internal state update (reload ideas)
6. Add import mode: fetch `GET /api/ideas/library` with search/filter params, render same idea cards, call `onComplete` on selection
7. When `initialSession` + `initialIdeas` provided: skip to results view, pre-select `preSelectedIdeaId`
8. Render `ContextBanner` at top (will be empty for brainstorm since it's stage 1)

File should be ~450 lines (combines new + session detail logic, minus routing/PipelineStages).

- [ ] **Step 2: Rewire brainstorm/new/page.tsx as thin wrapper**

Replace the full page content (~550 lines) with:

```typescript
// apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/new/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import type { BrainstormResult } from '@/components/engines/types';

export default function BrainstormNewPage() {
  const { id: channelId } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div>
      <PipelineStages currentStep="brainstorm" channelId={channelId} />
      <div className="p-6 max-w-4xl mx-auto">
        <BrainstormEngine
          mode="generate"
          channelId={channelId}
          context={{}}
          onComplete={(result) => {
            const r = result as BrainstormResult;
            if (r.brainstormSessionId) {
              router.push(`/channels/${channelId}/brainstorm/${r.brainstormSessionId}`);
            }
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewire brainstorm/[sessionId]/page.tsx as thin wrapper**

Replace the full page content (~265 lines) with:

```typescript
// apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/[sessionId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { PipelineStages } from '@/components/pipeline/PipelineStages';
import { BrainstormEngine } from '@/components/engines/BrainstormEngine';
import type { BrainstormResult, PipelineContext } from '@/components/engines/types';

export default function BrainstormSessionPage() {
  const { id: channelId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [ideas, setIdeas] = useState<Record<string, unknown>[]>([]);
  const [pipeline, setPipeline] = useState<PipelineContext>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/brainstorm/sessions/${sessionId}`);
        const json = await res.json();
        if (json.data) {
          setSession(json.data.session);
          setIdeas(json.data.ideas ?? []);
          const projectId = json.data.session?.project_id;
          if (projectId) {
            const pRes = await fetch(`/api/projects/${projectId}/pipeline`);
            const pJson = await pRes.json();
            if (pJson.data) {
              const ctx: PipelineContext = {
                projectId,
                projectTitle: pJson.data.project?.title,
                researchSessionId: pJson.data.researchSessions?.[0]?.id,
                draftId: pJson.data.contentDrafts?.[0]?.id,
              };
              const projIdea = pJson.data.ideas?.[0];
              if (projIdea) ctx.ideaId = projIdea.id;
              setPipeline(ctx);
            }
          }
        }
      } finally { setLoading(false); }
    })();
  }, [sessionId]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading session...</div>;
  if (!session) return <div className="p-6 text-red-500">Session not found.</div>;

  return (
    <div>
      <PipelineStages
        currentStep="brainstorm"
        channelId={channelId}
        brainstormSessionId={sessionId}
        researchSessionId={pipeline.researchSessionId}
        draftId={pipeline.draftId}
        projectId={pipeline.projectId}
        projectTitle={pipeline.projectTitle}
      />
      <div className="p-6 max-w-4xl mx-auto">
        <BrainstormEngine
          mode="generate"
          channelId={channelId}
          context={pipeline}
          initialSession={session}
          initialIdeas={ideas}
          preSelectedIdeaId={pipeline.ideaId}
          onComplete={(result) => {
            const r = result as BrainstormResult;
            router.push(
              `/channels/${channelId}/research/new?ideaId=${r.ideaId}&projectId=${pipeline.projectId ?? ''}`,
            );
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify standalone brainstorm flow works**

Run: `npm run dev` and test:
1. Navigate to `/channels/{id}/brainstorm/new` → settings form renders, generation works, ideas display
2. Navigate to `/channels/{id}/brainstorm/{sessionId}` → session ideas load, selection works, "Next: Research" navigates correctly
3. Manual mode tab works in both pages

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/BrainstormEngine.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/new/page.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/brainstorm/\\[sessionId\\]/page.tsx
git commit -m "feat(engines): extract BrainstormEngine, rewire standalone pages as thin wrappers"
```

---

### Task 4: ResearchEngine

**Files:**
- Create: `apps/app/src/components/engines/ResearchEngine.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/research/new/page.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/research/[sessionId]/page.tsx`

- [ ] **Step 1: Create ResearchEngine component**

Extract from `research/new/page.tsx` (lines 55-470) and `research/[sessionId]/page.tsx` (lines 50-231). The engine handles:

- **Generate mode**: Topic field (pre-filled from context.ideaTitle), depth selector (surface/medium/deep), focus tags checkboxes, AI/Manual tabs, progress, research cards with approval checkboxes, pivot recommendation banner
- **Import mode**: Browse existing research sessions filtered by idea or channel. Session list with level/card count/status. Preview cards before importing.
- **Pre-loaded results**: When `initialSession` and `initialCards` provided, skip generation and show cards.

Key props beyond BaseEngineProps:
```typescript
interface ResearchEngineProps extends BaseEngineProps {
  initialSession?: Session;
  initialCards?: Card[];
  initialApproved?: Set<number>;
}
```

The component must:
1. Copy state from research/new: `topic, level, focusTags, provider, model, recommended, running, genMode, sessionId, cards, approved`
2. Copy `handleRun()` (POST /api/research-sessions), `handleManualResearchImport()`, `toggleFocus()`, `toggleApproval()`, `handleApprove()`
3. Copy all UI: linked idea banner (from ContextBanner), config card, research cards with checkboxes
4. Replace `router.push(...)` in approve handler with `onComplete({ researchSessionId, approvedCardsCount, researchLevel })`
5. Replace regenerate navigation with internal reload
6. Render `ContextBanner` showing selected idea from `context`
7. In import mode: `GET /api/research-sessions?channel_id={channelId}` (or new endpoint), show session list, preview cards, call `onComplete` on selection

File should be ~400 lines.

- [ ] **Step 2: Rewire research/new/page.tsx as thin wrapper (~20 lines)**

Same pattern as brainstorm: PipelineStages + ResearchEngine with `onComplete` navigating to `/channels/{id}/research/{sessionId}` or `/channels/{id}/drafts/new`.

- [ ] **Step 3: Rewire research/[sessionId]/page.tsx as thin wrapper (~40 lines)**

Fetch session + pipeline context, pass as `initialSession`/`initialCards` to ResearchEngine. `onComplete` navigates to drafts/new with query params.

- [ ] **Step 4: Verify standalone research flow works**

Test: navigate to `/channels/{id}/research/new?ideaId={id}` → context banner shows idea, generation works, cards display with approval, approve navigates to drafts/new.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/engines/ResearchEngine.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/research/new/page.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/research/\\[sessionId\\]/page.tsx
git commit -m "feat(engines): extract ResearchEngine, rewire standalone pages"
```

---

### Task 5: DraftEngine

**Files:**
- Create: `apps/app/src/components/engines/DraftEngine.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/new/page.tsx`

- [ ] **Step 1: Create DraftEngine component**

Extract from `drafts/new/page.tsx` (lines 56-420). The engine handles:

- **Generate mode**: Title input (pre-filled from context.ideaTitle), format selector (blog only for now), 2-step pipeline (canonical core → produce), AI/Manual tabs at each sub-step, markdown preview of result
- **Import mode**: Browse existing content_drafts filtered by channel/status. Preview draft content. Pick one.
- **Pre-loaded results**: When `initialDraft` provided, show content preview + edit actions.

Key props beyond BaseEngineProps:
```typescript
interface DraftEngineProps extends BaseEngineProps {
  initialDraft?: Record<string, unknown>;
}
```

The component must:
1. Copy state from drafts/new: `type, title, draftId, step, busy, producedContent, genMode, linkedIdea, researchSummary`
2. Copy `handleStart()` (POST /api/content-drafts → POST canonical-core → POST produce)
3. Copy manual import handler (parse BC_CANONICAL_CORE, POST draft, PATCH with content)
4. Copy UI: pipeline context card (replaced by ContextBanner), setup card, progress stepper, preview
5. Replace navigation calls with `onComplete({ draftId, draftTitle, draftContent })`
6. Fetch idea and research context from `context` prop instead of URL params
7. Render `ContextBanner` showing idea + research from `context`

File should be ~350 lines.

- [ ] **Step 2: Rewire drafts/new/page.tsx as thin wrapper (~25 lines)**

PipelineStages + DraftEngine with `onComplete` navigating to `/channels/{id}/drafts/{draftId}`.

- [ ] **Step 3: Verify standalone draft flow works**

Test: navigate to `/channels/{id}/drafts/new?researchSessionId={id}&ideaId={id}` → context shows, generation works, preview displays, buttons navigate correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/DraftEngine.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/drafts/new/page.tsx
git commit -m "feat(engines): extract DraftEngine, rewire standalone page"
```

---

### Task 6: ReviewEngine

**Files:**
- Create: `apps/app/src/components/engines/ReviewEngine.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx` (review tab extraction)

- [ ] **Step 1: Create ReviewEngine component**

Extract from `drafts/[draftId]/page.tsx` review tab section (lines 273-401). The engine handles:

- AI review submission (POST /content-drafts/{id}/review)
- ReviewFeedbackPanel display (score gauge, verdict, issues)
- Manual review via ManualModePanel
- AI revision (POST /content-drafts/{id}/reproduce)
- Iteration history display
- Action buttons based on verdict: AI Revision, Edit Manually, Regenerate Research, Pick Different Idea, Override Approve

Key props beyond BaseEngineProps:
```typescript
interface ReviewEngineProps extends Omit<BaseEngineProps, 'mode'> {
  draftId: string;
  draft: Draft;
  onDraftUpdated: (draft: Draft) => void;  // After revision updates the draft
}
```

No import mode — always fresh evaluation.

The component must:
1. Copy `handleSubmitForReview()` (PATCH status → POST review)
2. Copy `handleRevise()` handler (POST revise with edited draftJson)
3. Copy AI reproduce handler (POST reproduce with feedback)
4. Show ReviewFeedbackPanel when feedback exists
5. Show ManualModePanel for manual review import
6. Call `onComplete({ score, verdict, feedbackJson, iterationCount })` when approved
7. Call `onBack('research')` or `onBack('brainstorm')` for back-reference actions
8. Render `ContextBanner` showing draft title + iteration count

File should be ~250 lines.

- [ ] **Step 2: Update drafts/[draftId]/page.tsx to use ReviewEngine in the review tab**

Replace the inline review tab content with `<ReviewEngine>`. The page keeps its Tabs wrapper and other tabs (content, assets, publish).

- [ ] **Step 3: Verify review flow works**

Test: open draft detail → Review tab → Submit for Review → score displays → revision options work.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/ReviewEngine.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/drafts/\\[draftId\\]/page.tsx
git commit -m "feat(engines): extract ReviewEngine from draft detail page"
```

---

### Task 7: AssetsEngine

**Files:**
- Create: `apps/app/src/components/engines/AssetsEngine.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx` (assets tab extraction)

- [ ] **Step 1: Create AssetsEngine component**

Extract from `drafts/[draftId]/page.tsx` assets tab. Wraps the existing `AssetGallery` component with:

- Generate mode: uses existing AssetGallery with onGenerateAll, onUpload, onRegenerate, onDelete handlers
- Import mode: file upload UI + browse existing assets from library
- ContextBanner showing draft title

Key props beyond BaseEngineProps:
```typescript
interface AssetsEngineProps extends BaseEngineProps {
  draftId: string;
  draftStatus: string;
}
```

The component must:
1. Fetch assets via `GET /api/assets?draft_id={draftId}`
2. Handle generate all, upload, regenerate, delete actions
3. Call `onComplete({ assetIds, featuredImageUrl })` when user is done
4. Render ContextBanner + AssetGallery

File should be ~150 lines.

- [ ] **Step 2: Update drafts/[draftId]/page.tsx to use AssetsEngine in assets tab**

- [ ] **Step 3: Verify assets flow works**

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/AssetsEngine.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/drafts/\\[draftId\\]/page.tsx
git commit -m "feat(engines): extract AssetsEngine from draft detail page"
```

---

### Task 8: PublishEngine

**Files:**
- Create: `apps/app/src/components/engines/PublishEngine.tsx`
- Modify: `apps/app/src/app/[locale]/(app)/channels/[id]/drafts/[draftId]/page.tsx` (publish tab extraction)

- [ ] **Step 1: Create PublishEngine component**

Extract from `drafts/[draftId]/page.tsx` publish tab. Wraps existing `PublishPanel` component with:

- WordPress config selection
- Mode selection (draft/publish/schedule)
- Category/tag input
- ContextBanner showing draft title + review score + asset count

Key props beyond BaseEngineProps:
```typescript
interface PublishEngineProps extends Omit<BaseEngineProps, 'mode'> {
  draftId: string;
  draft: Draft;
  assetCount: number;
}
```

No import mode — always fresh publish action.

The component must:
1. Copy `handlePublish()` (POST /api/wordpress/publish-draft)
2. Render ContextBanner + PublishPanel
3. Call `onComplete({ wordpressPostId, publishedUrl })` on success

File should be ~100 lines.

- [ ] **Step 2: Update drafts/[draftId]/page.tsx to use PublishEngine in publish tab**

- [ ] **Step 3: Verify publish flow works**

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/engines/PublishEngine.tsx
git add apps/app/src/app/[locale]/(app)/channels/[id]/drafts/\\[draftId\\]/page.tsx
git commit -m "feat(engines): extract PublishEngine from draft detail page"
```

---

## Phase 3: Pipeline Orchestrator

### Task 9: Database migration for pipeline_state_json

**Files:**
- Create: `supabase/migrations/20260415100000_project_pipeline_state.sql`

- [ ] **Step 1: Create migration**

```sql
-- 20260415100000_project_pipeline_state.sql
-- Add pipeline orchestrator state to projects table.

ALTER TABLE public.projects
  ADD COLUMN pipeline_state_json jsonb DEFAULT '{}';
```

- [ ] **Step 2: Push migration**

Run: `npm run db:push:dev`
Expected: migration applied successfully

- [ ] **Step 3: Regenerate types**

Run: `npm run db:types`
Expected: `packages/shared/src/types/database.ts` updated with `pipeline_state_json` column

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415100000_project_pipeline_state.sql
git add packages/shared/src/types/database.ts
git commit -m "feat(db): add pipeline_state_json to projects table"
```

---

### Task 10: CompletedStageSummary component

**Files:**
- Create: `apps/app/src/components/pipeline/CompletedStageSummary.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/app/src/components/pipeline/CompletedStageSummary.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Lightbulb, Search, FileText, CheckCircle, Image, Globe,
  ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react';
import type { PipelineStage, PipelineState } from '@/components/engines/types';

const STAGE_META: Record<PipelineStage, { icon: typeof Lightbulb; label: string; color: string }> = {
  brainstorm: { icon: Lightbulb, label: 'Idea', color: 'text-yellow-500' },
  research: { icon: Search, label: 'Research', color: 'text-blue-500' },
  draft: { icon: FileText, label: 'Draft', color: 'text-purple-500' },
  review: { icon: CheckCircle, label: 'Review', color: 'text-green-500' },
  assets: { icon: Image, label: 'Assets', color: 'text-pink-500' },
  publish: { icon: Globe, label: 'Published', color: 'text-emerald-500' },
};

interface CompletedStageSummaryProps {
  stage: PipelineStage;
  stageResults: PipelineState['stageResults'];
  onRevisit: (stage: PipelineStage) => void;
}

export function CompletedStageSummary({ stage, stageResults, onRevisit }: CompletedStageSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = STAGE_META[stage];
  const Icon = meta.icon;

  const result = stageResults[stage];
  if (!result) return null;

  function getSummary(): string {
    switch (stage) {
      case 'brainstorm': {
        const r = stageResults.brainstorm;
        return r ? `${r.ideaTitle} (${r.ideaVerdict})` : '';
      }
      case 'research': {
        const r = stageResults.research;
        return r ? `${r.approvedCardsCount} cards approved · ${r.researchLevel} depth` : '';
      }
      case 'draft': {
        const r = stageResults.draft;
        return r ? r.draftTitle : '';
      }
      case 'review': {
        const r = stageResults.review;
        return r ? `Score: ${r.score}/100 · ${r.verdict} · ${r.iterationCount} iteration(s)` : '';
      }
      case 'assets': {
        const r = stageResults.assets;
        return r ? `${r.assetIds.length} assets` : '';
      }
      case 'publish': {
        const r = stageResults.publish;
        return r ? `Published: ${r.publishedUrl}` : '';
      }
      default:
        return '';
    }
  }

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Icon className={`h-4 w-4 ${meta.color} shrink-0`} />
          <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600 dark:text-green-400">
            Done
          </Badge>
          <span className="text-sm font-medium">{meta.label}</span>
          <span className="text-xs text-muted-foreground truncate flex-1">{getSummary()}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onRevisit(stage)}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/pipeline/CompletedStageSummary.tsx
git commit -m "feat(pipeline): add CompletedStageSummary for collapsed finished stages"
```

---

### Task 11: AutoModeControls component

**Files:**
- Create: `apps/app/src/components/pipeline/AutoModeControls.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/app/src/components/pipeline/AutoModeControls.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Pause, Play, Loader2 } from 'lucide-react';
import type { PipelineState, PipelineStage } from '@/components/engines/types';

const STAGE_LABELS: Record<PipelineStage, string> = {
  brainstorm: 'Idea', research: 'Research', draft: 'Draft',
  review: 'Review', assets: 'Assets', publish: 'Publish',
};

interface AutoModeControlsProps {
  pipelineState: PipelineState;
  isRunning: boolean;
  onToggleMode: (mode: 'step-by-step' | 'auto') => void;
  onPause: () => void;
  onResume: () => void;
}

export function AutoModeControls({
  pipelineState,
  isRunning,
  onToggleMode,
  onPause,
  onResume,
}: AutoModeControlsProps) {
  const isAuto = pipelineState.mode === 'auto';
  const isPaused = !!pipelineState.autoConfig.pausedAt;

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="auto-mode" className="text-xs text-muted-foreground">
          Step-by-step
        </Label>
        <Switch
          id="auto-mode"
          checked={isAuto}
          onCheckedChange={(checked) => onToggleMode(checked ? 'auto' : 'step-by-step')}
        />
        <Label htmlFor="auto-mode" className="text-xs text-muted-foreground">
          Auto-pilot
        </Label>
      </div>

      {isAuto && isPaused && (
        <>
          <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600">
            Paused at {STAGE_LABELS[pipelineState.autoConfig.pausedAt!]}
          </Badge>
          <Button variant="outline" size="sm" onClick={onResume}>
            <Play className="h-3 w-3 mr-1" /> Resume
          </Button>
        </>
      )}

      {isAuto && isRunning && !isPaused && (
        <>
          <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600 gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running {STAGE_LABELS[pipelineState.currentStage]}...
          </Badge>
          <Button variant="outline" size="sm" onClick={onPause}>
            <Pause className="h-3 w-3 mr-1" /> Pause
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/pipeline/AutoModeControls.tsx
git commit -m "feat(pipeline): add AutoModeControls for pause/resume/mode toggle"
```

---

### Task 12: ImportPicker component

**Files:**
- Create: `apps/app/src/components/engines/ImportPicker.tsx`

- [ ] **Step 1: Create component**

Reusable library browser that fetches and displays items from any entity table. Props:

```typescript
interface ImportPickerProps<T> {
  entityType: 'ideas' | 'research-sessions' | 'content-drafts' | 'content-assets';
  channelId?: string;
  filters?: Record<string, string>;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  searchPlaceholder?: string;
}
```

The component:
1. Fetches from the appropriate API endpoint with search/filter params
2. Renders a search input + filter badges + scrollable list
3. Uses `renderItem` callback for custom display per entity type
4. Calls `onSelect(item)` when user picks one

Endpoint mapping:
- `ideas` → `GET /api/ideas/library?search={q}&channel_id={id}`
- `research-sessions` → `GET /api/research-sessions?channel_id={id}`
- `content-drafts` → `GET /api/content-drafts?channel_id={id}`
- `content-assets` → `GET /api/assets?channel_id={id}`

File should be ~120 lines.

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/engines/ImportPicker.tsx
git commit -m "feat(engines): add ImportPicker reusable library browser"
```

---

### Task 13: PipelineOrchestrator

**Files:**
- Create: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

- [ ] **Step 1: Create the orchestrator component**

This is the core conductor. It must:

1. Accept `projectId` and `channelId` as props
2. Fetch pipeline state from `GET /api/projects/{id}` (reads `pipeline_state_json`)
3. Maintain `PipelineState` in React state, synced to DB via `PATCH /api/projects/{id}` on every transition
4. Build accumulated `PipelineContext` from `stageResults`
5. Render: project header + AutoModeControls + PipelineStages stepper + CompletedStageSummary cards + active engine
6. Show "Generate Fresh / Import Existing" picker before rendering active engine (except review/publish)
7. Handle `onComplete` from engines: save result, advance stage, collapse completed
8. Handle `onBack` from engines: clear downstream results, set currentStage back, unlink downstream entities
9. Handle auto mode: when `mode === 'auto'`, auto-start next engine after onComplete (except publish: always pause)
10. Handle review loop in auto mode: if score < targetScore and iterations < max, trigger reproduce → re-review
11. Save pipeline state to DB after every transition: `PATCH /api/projects/{id}` with `{ pipeline_state_json: state }`

Key state:
```typescript
const [pipelineState, setPipelineState] = useState<PipelineState>(DEFAULT_PIPELINE_STATE);
const [engineMode, setEngineMode] = useState<'generate' | 'import' | null>(null); // null = show picker
const [isRunning, setIsRunning] = useState(false);
```

Stage transition handler:
```typescript
async function handleStageComplete(stage: PipelineStage, result: StageResult) {
  const newState = { ...pipelineState };
  newState.stageResults[stage] = { ...result, completedAt: new Date().toISOString() };
  
  // Advance to next stage
  const nextIndex = PIPELINE_STAGES.indexOf(stage) + 1;
  if (nextIndex < PIPELINE_STAGES.length) {
    newState.currentStage = PIPELINE_STAGES[nextIndex];
  }
  
  // Save to DB
  await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipeline_state_json: newState }),
  });
  
  setPipelineState(newState);
  setEngineMode(null); // show picker for next stage
  
  // Auto mode: start next stage automatically
  if (newState.mode === 'auto' && !newState.autoConfig.pausedAt) {
    if (newState.currentStage === 'publish') {
      // Always pause before publish
      newState.autoConfig.pausedAt = 'publish';
      setPipelineState({ ...newState });
    } else {
      setEngineMode('generate');
    }
  }
}
```

Back/revisit handler:
```typescript
async function handleRevisit(targetStage: PipelineStage) {
  const targetIndex = PIPELINE_STAGES.indexOf(targetStage);
  const newState = { ...pipelineState, currentStage: targetStage };
  
  // Clear downstream results and unlink entities
  for (const stage of PIPELINE_STAGES.slice(targetIndex + 1)) {
    delete newState.stageResults[stage];
  }
  
  // TODO: PATCH entities to unlink project_id (optional, keeps them in library)
  
  await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipeline_state_json: newState }),
  });
  
  setPipelineState(newState);
  setEngineMode(null);
}
```

File should be ~350 lines.

- [ ] **Step 2: Verify orchestrator renders correctly with mock data**

Manually test by navigating to a project page with the orchestrator, stepping through brainstorm → research → draft.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "feat(pipeline): add PipelineOrchestrator state machine with stage transitions"
```

---

### Task 14: Rewrite project detail page

**Files:**
- Modify: `apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx`
- Delete: `apps/app/src/app/[locale]/(app)/projects/[id]/discovery/page.tsx`

- [ ] **Step 1: Rewrite project detail page**

Replace the current ~236 line read-only dashboard with:

```typescript
// apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PipelineOrchestrator } from '@/components/pipeline/PipelineOrchestrator';

export default function ProjectPipelinePage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const json = await res.json();
        if (json.data) setProject(json.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project...
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-red-500">Project not found.</div>;
  }

  const channelId = (project.channel_id as string) || '';

  return (
    <div>
      <div className="px-6 pt-4">
        <button
          onClick={() => router.push('/projects')}
          className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back to projects
        </button>
      </div>
      <PipelineOrchestrator
        projectId={projectId}
        channelId={channelId}
        projectTitle={(project.title as string) ?? 'Untitled Project'}
        initialPipelineState={project.pipeline_state_json as Record<string, unknown> | undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete discovery placeholder page**

```bash
rm apps/app/src/app/[locale]/(app)/projects/[id]/discovery/page.tsx
```

- [ ] **Step 3: Verify project pipeline works end-to-end**

Test:
1. Navigate to `/projects` → click a project → orchestrator renders
2. Brainstorm engine generates ideas, select one → research engine appears
3. Research generates cards, approve → draft engine appears
4. Generate draft → review engine appears
5. Review scores → if approved, assets engine appears
6. Stepper navigation works, clicking completed stages shows summary
7. "Change" button on completed stages goes back correctly

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/app/[locale]/(app)/projects/[id]/page.tsx
git rm apps/app/src/app/[locale]/(app)/projects/[id]/discovery/page.tsx
git commit -m "feat(projects): rewrite project page with PipelineOrchestrator"
```

---

## Phase 4: Import Mode

### Task 15: Add import mode to engines

**Files:**
- Modify: `apps/app/src/components/engines/BrainstormEngine.tsx`
- Modify: `apps/app/src/components/engines/ResearchEngine.tsx`
- Modify: `apps/app/src/components/engines/DraftEngine.tsx`
- Modify: `apps/app/src/components/engines/AssetsEngine.tsx`

- [ ] **Step 1: Add import mode to BrainstormEngine**

When `mode="import"`, render `ImportPicker` with `entityType="ideas"`. The `renderItem` callback renders the same idea card UI (title, verdict badge, core tension). `onSelect` calls engine's `onComplete` with the selected idea's data.

- [ ] **Step 2: Add import mode to ResearchEngine**

When `mode="import"`, render `ImportPicker` with `entityType="research-sessions"`. The `renderItem` callback shows session level, card count, status. `onSelect` fetches full session cards and calls `onComplete`.

- [ ] **Step 3: Add import mode to DraftEngine**

When `mode="import"`, render `ImportPicker` with `entityType="content-drafts"`. The `renderItem` shows draft title, type, status. `onSelect` calls `onComplete` with draft data.

- [ ] **Step 4: Add import mode to AssetsEngine**

When `mode="import"`, add file upload dropzone + `ImportPicker` with `entityType="content-assets"`. `onSelect` links selected assets to current draft.

- [ ] **Step 5: Verify import mode works in pipeline orchestrator**

Test: on project page, click "Import Existing" at brainstorm stage → library shows ideas → pick one → moves to research.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/engines/*.tsx
git commit -m "feat(engines): add import mode to all engines (library browser)"
```

---

## Phase 5: Auto Mode

### Task 16: Auto mode logic in PipelineOrchestrator

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`

- [ ] **Step 1: Add auto-mode stage runner**

When mode is `auto` and engine completes, the orchestrator:

1. For brainstorm: auto-pick the first viable idea from results
2. For research: auto-approve all cards, use deep level
3. For draft: auto-generate blog with default settings
4. For review: check score — if < 90 and iterations < max, call reproduce with feedback, re-run review. If < 40, pause. If ≥ 90, continue.
5. For assets: auto-generate featured + body images
6. For publish: always pause, show preview

Add `autoRunStage()` function:
```typescript
async function autoRunStage(stage: PipelineStage) {
  setIsRunning(true);
  // The engine component handles the actual generation
  // Auto mode just means we auto-start it without waiting for user to click "Generate"
  // and auto-handle the onComplete with AI decisions
  setEngineMode('generate');
}
```

Add `autoHandleComplete()` that wraps `handleStageComplete` with auto-decisions (e.g., auto-select viable idea, auto-approve cards).

- [ ] **Step 2: Add review loop auto-iteration**

When review returns `revision_required` in auto mode:
```typescript
if (pipelineState.mode === 'auto' && verdict === 'revision_required') {
  const iterations = pipelineState.stageResults.review?.iterationCount ?? 0;
  if (iterations < pipelineState.autoConfig.maxReviewIterations) {
    // Auto-trigger revision
    await fetch(`/api/content-drafts/${draftId}/reproduce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackJson }),
    });
    // Re-run review
    await fetch(`/api/content-drafts/${draftId}/review`, { method: 'POST' });
    // Update state with new review results
  } else {
    // Max iterations reached, pause
    handlePause();
  }
}
```

- [ ] **Step 3: Add pause triggers**

Implement all pause conditions from spec:
- No viable ideas → pause at brainstorm
- Score < 40 → pause at review
- Max iterations reached → pause at review
- API error → pause at current stage
- Publish stage → always pause

- [ ] **Step 4: Verify auto mode works**

Test:
1. Toggle to auto-pilot on project page
2. System runs brainstorm → picks idea → researches → drafts → reviews
3. If score < 90, verify it auto-revises and re-reviews
4. Verify it pauses at publish
5. Click "Pause" mid-pipeline → verify it stops
6. Click "Resume" → verify it continues

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git commit -m "feat(pipeline): add auto-mode with review loop iteration and pause triggers"
```

---

## Phase 6: Pipeline Persistence

### Task 17: Save/restore pipeline state

**Files:**
- Modify: `apps/app/src/components/pipeline/PipelineOrchestrator.tsx`
- Modify: `apps/api/src/routes/projects.ts`

- [ ] **Step 1: Add PATCH endpoint for pipeline_state_json**

In `apps/api/src/routes/projects.ts`, ensure the existing PATCH `/:id` endpoint accepts `pipeline_state_json` in the update body. If it doesn't, add it to the update schema.

Check current PATCH schema and add `pipeline_state_json` as optional jsonb field.

- [ ] **Step 2: Save state on every transition in orchestrator**

Every call to `handleStageComplete`, `handleRevisit`, `onToggleMode`, `onPause`, `onResume` must persist state:

```typescript
async function savePipelineState(newState: PipelineState) {
  setPipelineState(newState);
  await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipelineStateJson: newState }),
  });
}
```

- [ ] **Step 3: Restore state on page load**

When orchestrator mounts, read `initialPipelineState` prop (from project fetch). If it has data, restore:
- Set `pipelineState` from persisted JSON
- Fetch actual entities from DB using IDs in stageResults to verify they still exist
- If an entity was deleted, clear that stage result

- [ ] **Step 4: Verify persistence across page reloads**

Test:
1. Start pipeline, complete brainstorm + research
2. Refresh page → orchestrator shows brainstorm + research as completed, draft as active
3. Close browser, reopen → same state

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/pipeline/PipelineOrchestrator.tsx
git add apps/api/src/routes/projects.ts
git commit -m "feat(pipeline): persist and restore pipeline state across sessions"
```

---

## Phase 7: Documentation

### Task 18: Update project documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: docs-site pages as applicable

- [ ] **Step 1: Update CLAUDE.md architecture section**

Add to the Architecture section after "4-Agent Content Workflow":

```markdown
### Pipeline Orchestrator

The project pipeline orchestrates 6 engine components through a multi-stage content workflow:

**Engine components** (`apps/app/src/components/engines/`):
- `BrainstormEngine` — Generate or import ideas, select one
- `ResearchEngine` — Generate or import research, approve cards
- `DraftEngine` — Generate canonical core + produce content, or import existing draft
- `ReviewEngine` — AI review with scoring (always fresh, no import)
- `AssetsEngine` — Generate or import/upload images
- `PublishEngine` — WordPress publish (always requires confirmation)

**Orchestrator** (`apps/app/src/components/pipeline/`):
- `PipelineOrchestrator` — State machine on project page, composes engines inline
- Modes: step-by-step (user drives) or auto-pilot (AI drives, user can pause)
- Review loop: iterates until score ≥ 90 or max iterations
- Context passing: accumulated results flow to downstream engines via `PipelineContext`
- State persisted in `projects.pipeline_state_json`

**Standalone pages** (`channels/[id]/brainstorm|research|drafts/`):
- Thin wrappers around the same engine components
- Work independently without a project for ad-hoc content creation
```

- [ ] **Step 2: Update README.md with pipeline feature section**

Add a "Content Pipeline" section to README features:

```markdown
## Content Pipeline

Orchestrated multi-stage workflow for producing publication-ready content:

1. **Idea** — Brainstorm with AI or import from library
2. **Research** — Deep research with card approval
3. **Draft** — Canonical core + format-specific production
4. **Review** — AI scoring with iterative revision loop (target: 90+)
5. **Assets** — AI image generation or manual upload
6. **Publish** — WordPress integration with scheduling

Run step-by-step or in auto-pilot mode. Each stage can import existing material from the library.
```

- [ ] **Step 3: Review and update docs-site if applicable**

Check `apps/docs-site` for any pipeline or architecture pages that need updating with the new engine/orchestrator architecture. Add Mermaid diagrams for:
- Pipeline flow (brainstorm → research → draft → review loop → assets → publish)
- Engine component architecture (engines + standalone wrappers + orchestrator)
- Auto-mode flow with pause triggers

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git add docs/ apps/docs-site/ 2>/dev/null || true
git commit -m "docs: update architecture docs with pipeline orchestrator and engine components"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Standalone brainstorm flow works: `/channels/{id}/brainstorm/new` → generate → select → research
- [ ] Standalone research flow works: `/channels/{id}/research/new` → generate → approve → drafts
- [ ] Standalone draft flow works: `/channels/{id}/drafts/new` → generate → preview → editor
- [ ] Draft detail tabs work: content, review, assets, publish
- [ ] Project pipeline step-by-step: `/projects/{id}` → brainstorm → research → draft → review → assets → publish
- [ ] Project pipeline import mode: import existing idea, research, draft at each stage
- [ ] Project pipeline auto mode: runs all stages, pauses at publish, pauses on failure
- [ ] Review loop: iterates until ≥ 90, pauses at max iterations
- [ ] Stage reversal: going back clears downstream, unlinks entities
- [ ] Persistence: pipeline state survives page reload
- [ ] Context banners: each engine shows upstream context correctly
- [ ] Stepper navigation: clicking completed steps shows summaries
- [ ] Documentation: CLAUDE.md, README.md updated with architecture diagrams
