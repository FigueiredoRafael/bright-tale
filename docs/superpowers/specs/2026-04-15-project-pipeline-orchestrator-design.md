# Project Pipeline Orchestrator — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Scope:** Engine component extraction, pipeline orchestrator, auto-mode, import from library

---

## 1. Problem

Two disconnected flows exist today:

- **Standalone pages** (`/channels/{id}/brainstorm/new`, `/research/new`, `/drafts/new`, etc.) — full working pipeline with generation, results display, regeneration, and navigation. Each page is a monolithic ~300-500 line component mixing UI, data fetching, and routing.
- **Project page** (`/projects/{id}`) — a read-only dashboard that shows entity summary cards and a stepper. Clicking "Start Workflow" creates an empty project and lands on a blank page. Links out to channel-scoped pages for actual work.

The project page doesn't embed any pipeline capabilities. Users lose context when navigating between project and channel pages. There's no orchestrated flow that chains stages together with context passing.

---

## 2. Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│                        ENGINES                               │
│  Brainstorm · Research · Draft · Review · Assets · Publish   │
│  (reusable components that produce material)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ composed by
           ┌───────────┴───────────┐
           │                       │
  ┌────────▼────────┐   ┌─────────▼─────────┐
  │  Standalone Page │   │  Project Pipeline  │
  │  (ad-hoc work)   │   │  (orchestrated     │
  │  thin wrapper    │   │   multi-stage flow) │
  └──────────────────┘   └────────────────────┘
```

- **Engines** = self-contained React components that work in two contexts
- **Standalone pages** = thin wrappers for ad-hoc work (brainstorm without a project, research a topic, etc.)
- **Project pipeline** = conductor that composes engines inline, passes context between stages, tracks progress, and supports iteration

---

## 3. Engine Component Architecture

Each engine is a self-contained component that does NOT know if it's running standalone or inside a project:

```
┌─────────────────────────────────────────────────┐
│  Engine Component (e.g. <BrainstormEngine>)     │
│                                                  │
│  Props:                                          │
│  - mode: "generate" | "import"                   │
│  - channelId: string                             │
│  - projectId?: string                            │
│  - context: PipelineContext                       │
│  - onComplete: (result: StageResult) => void     │
│  - onBack?: (targetStage?: string) => void       │
│                                                  │
│  Internal state:                                 │
│  - Loading, generation progress, results         │
│  - Form state (settings, selections)             │
│                                                  │
│  Does NOT:                                       │
│  - Navigate (router.push)                        │
│  - Render PipelineStages                         │
│  - Know if it's standalone or in project context │
└─────────────────────────────────────────────────┘
```

### 3.1 Engine Inventory

| Engine | Generate Mode | Import Mode | onComplete Payload |
|--------|--------------|-------------|-------------------|
| `BrainstormEngine` | Run brainstorm agent, show ideas, user selects one | Browse ideas library, pick existing idea | `{ ideaId, ideaTitle, brainstormSessionId }` |
| `ResearchEngine` | Run research agent for selected idea, show cards, approve | Browse research sessions, pick existing | `{ researchSessionId, approvedCards }` |
| `DraftEngine` | Generate canonical core → produce content, show preview | Browse existing drafts, pick one | `{ draftId, draftContent }` |
| `ReviewEngine` | Run AI review, show score/issues, iterate | *(no import — always fresh evaluation)* | `{ verdict, score, feedbackJson }` |
| `AssetsEngine` | Generate images via AI | Upload manually or pick from assets library | `{ assetIds[] }` |
| `PublishEngine` | Configure WordPress settings, publish | *(no import — always fresh action)* | `{ wordpressPostId, publishedUrl }` |

### 3.2 Engine Detail

#### BrainstormEngine

**Generate mode:**
- Settings form: input mode (blind/fine-tuned/reference), model picker, topic, advanced settings (temporal mix, constraints, ideas requested)
- AI/Manual tabs (ManualModePanel for copy-paste workflow)
- Progress indicator during generation
- Results: idea cards with verdict badges, radio selection
- Action: select one idea → `onComplete`

**Import mode:**
- Search/filter over `idea_archives` table
- Filters: verdict, source type, tags, channel, search text
- Same idea card UI as generate results
- Action: pick one → `onComplete`

#### ResearchEngine

**Generate mode:**
- Context banner showing selected idea (title, verdict, core tension)
- Settings: depth (surface/medium/deep), focus tags, model picker
- AI/Manual tabs
- Results: research cards with checkboxes for approval
- Pivot recommendation banner if `refined_angle.should_pivot`
- Action: approve cards → `onComplete`

**Import mode:**
- Browse `research_sessions` filtered by idea or channel
- Session summaries (level, card count, status)
- Preview cards before importing
- Action: pick session → `onComplete`

#### DraftEngine

**Generate mode:**
- Context banner showing idea + research summary
- Settings: type (blog only for now), title (pre-filled from idea)
- 2-step: canonical core generation → format production
- AI/Manual tabs at each sub-step
- Results: markdown preview of produced content
- Action: content ready → `onComplete`

**Import mode:**
- Browse `content_drafts` filtered by channel/status
- Preview draft content before importing
- Action: pick draft → `onComplete`

#### ReviewEngine

**No import mode.** Always evaluates current content.

- Context banner showing draft title + iteration count
- AI review button → runs scoring agent
- Results: score gauge, verdict badge, critical/minor issues lists
- Iteration history (collapsible, shows score progression across rounds)
- Actions based on verdict:
  - Approved (≥90) → `onComplete({ verdict: 'approved', score })`
  - Revision required (<90) → user picks: AI revision, edit manually, go back to research, pick different idea
  - Rejected (<40) → same options with warning
- Manual review sub-tab: paste review output from external AI

#### AssetsEngine

**Generate mode:**
- Context banner showing draft title
- Role-based slots: featured image, body section images
- Generate button per slot (AI image generation)
- WebP conversion toggle
- Preview gallery

**Import mode:**
- Upload from local files
- Browse existing `content_assets` from library
- Drag-and-drop to assign roles

Action: assets ready → `onComplete`

#### PublishEngine

**No import mode.** Always fresh publish action.

- Context banner showing draft title + review score + asset count
- WordPress config selector
- Mode: draft / publish / schedule (with date picker)
- Category/tag input (freeform, resolved on publish)
- Preview of what gets sent to WordPress
- **Always requires user confirmation, even in auto mode**
- Action: publish confirmed → `onComplete`

### 3.3 Shared Engine Features

All engines share:
- `context` prop for upstream data display via `ContextBanner` component
- `onComplete(result)` callback — never navigate directly
- `onBack(targetStage?)` callback — request going to a previous stage
- Loading/error states handled internally
- ManualModePanel integration where applicable (brainstorm, research, draft, review)

---

## 4. Context Passing

The pipeline orchestrator maintains an accumulated context object that grows as each stage completes:

```
After Brainstorm → { ideaId, ideaTitle, brainstormSessionId }
After Research   → + { researchSessionId, approvedCards, researchSummary }
After Draft      → + { draftId, canonicalCore, draftContent }
After Review     → + { reviewScore, verdict, feedbackJson, iterationCount }
After Assets     → + { assetIds, featuredImageUrl }
After Publish    → + { wordpressPostId, publishedUrl }
```

Each engine receives the full accumulated context and renders a **ContextBanner** at top:

- `ResearchEngine`: "Researching: *{ideaTitle}*" + verdict badge + core tension
- `DraftEngine`: "Drafting from: *{ideaTitle}*" + "{approvedCards.length} research cards"
- `ReviewEngine`: "Reviewing: *{draftTitle}*" + iteration count if > 1

Each banner has a "Change" action that calls `onBack()` to revisit the source stage.

---

## 5. Pipeline Orchestrator

### 5.1 Layout

```
┌──────────────────────────────────────────────────┐
│  Project Header: title, status, mode toggle      │
│  [Step-by-step ○ ● Auto-pilot]                   │
├──────────────────────────────────────────────────┤
│  PipelineStages stepper (navigational)           │
│  ● Idea ── ● Research ── ○ Draft ── ○ Review ... │
├──────────────────────────────────────────────────┤
│  Completed Stages (collapsed, expandable)        │
│  ┌─ ✓ Idea: "How to Use AI Daily..." ─────────┐ │
│  │  verdict: viable · BC-IDEA-042 · [Expand]   │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─ ✓ Research: 8 cards approved ──────────────┐ │
│  │  deep · completed · [Expand] [Change]       │ │
│  └─────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│  Active Stage                                    │
│  ┌────────────────────┐  ┌────────────────────┐  │
│  │  ⚡ Generate Fresh  │  │  📂 Import Existing │  │
│  └────────────────────┘  └────────────────────┘  │
│                                                  │
│  <ActiveEngine context={...} onComplete={...} /> │
└──────────────────────────────────────────────────┘
```

### 5.2 Pipeline State

```typescript
interface PipelineState {
  mode: 'step-by-step' | 'auto';
  currentStage: PipelineStage;
  stageResults: {
    brainstorm?: { ideaId: string; ideaTitle: string; brainstormSessionId?: string; completedAt: string };
    research?: { researchSessionId: string; approvedCardsCount: number; completedAt: string };
    draft?: { draftId: string; title: string; completedAt: string };
    review?: { score: number; verdict: string; iterationCount: number; completedAt: string };
    assets?: { assetIds: string[]; completedAt: string };
    publish?: { wordpressPostId: number; publishedUrl: string; completedAt: string };
  };
  autoConfig?: {
    maxReviewIterations: number;  // default 5
    targetScore: number;          // default 90
    pausedAt?: PipelineStage;
  };
}
```

Persisted in `projects.pipeline_state_json`. Read on page load, written after every transition.

### 5.3 Stage Transitions

**Step-by-step mode:**
1. Engine calls `onComplete(result)`
2. Orchestrator saves result to `stageResults`, advances `currentStage`
3. Completed stage collapses into summary card
4. Next engine renders with accumulated context
5. User can click stepper to revisit any completed stage

**Auto mode:**
1. Engine calls `onComplete(result)`
2. Orchestrator saves result, checks if user paused → if yes, switch to step-by-step
3. If not paused, auto-starts next engine
4. At review: if score < targetScore and iterations < max → auto-triggers draft regeneration → re-review
5. User clicks "Pause" at any time → pipeline stops, user takes manual control

### 5.4 Stage Reversal

When going back to a previous stage:

- Orchestrator sets `currentStage` back to target stage
- Downstream `stageResults` are cleared from `pipeline_state_json`
- **Downstream entities are NOT deleted** — they're unlinked from the project (`project_id` set to null) and remain in the library as standalone work
- The target engine re-mounts with its previous result pre-loaded for editing

### 5.5 Import vs Generate Picker

At each stage (except Review and Publish), before the engine renders, the orchestrator shows:

```
┌────────────────────┐  ┌────────────────────┐
│  ⚡ Generate Fresh  │  │  📂 Import Existing │
│  Run AI engine     │  │  Pick from library  │
└────────────────────┘  └────────────────────┘
```

- **Generate** → renders engine in `mode="generate"`
- **Import** → renders engine in `mode="import"` (library browser)

---

## 6. Auto-Mode & Review Loop

### 6.1 Auto-Mode Flow

```
Brainstorm ──→ AI picks highest-scored "viable" idea
    │
Research   ──→ AI runs deep research, auto-approves all cards
    │
Draft      ──→ AI generates canonical core → produces blog
    │
Review     ──→ AI scores the draft
    │
    ├── score ≥ 90 → Continue to Assets
    │
    ├── score < 90, iterations < max → Regenerate draft with feedback → Re-review
    │
    └── score < 90, iterations ≥ max → PAUSE, notify user
    │
Assets     ──→ AI generates featured image + body images
    │
Publish    ──→ ALWAYS PAUSES — never auto-publishes
```

### 6.2 Auto-Mode Decisions

| Stage | AI Decides | AI Cannot |
|---|---|---|
| Brainstorm | Picks viable idea with highest relevance. If none viable, **pauses**. | Never picks "weak" ideas |
| Research | Runs deep level, approves all cards | Never skips research |
| Draft | Generates canonical core + blog | Never picks non-blog types |
| Review | Scores, feeds back for revision if < 90 | Never approves < 90. Never exceeds max iterations |
| Assets | Generates featured + 2 body images | Never deletes manually-uploaded assets |
| Publish | **Always pauses** for user confirmation | Never publishes without consent |

### 6.3 Review Loop Detail

```
Draft produced
     │
     ▼
POST /content-drafts/{id}/review → Score + Verdict
     │
     ├── "approved" (≥ 90) → Done → Assets
     │
     ├── "revision_required" (40-89)
     │     ├── [Auto] → POST /content-drafts/{id}/reproduce with feedback → re-review
     │     └── [Step-by-step] → User chooses:
     │           • AI Revision (reproduce + re-review)
     │           • Edit Manually (editor, then re-review)
     │           • Regenerate Research (back to research, clears draft)
     │           • Pick Different Idea (back to brainstorm, clears all)
     │           • Override Approve (force-approve despite low score)
     │
     └── "rejected" (< 40)
           ├── [Auto] → PAUSE — too broken to auto-fix
           └── [Step-by-step] → Same options with major-rework warning
```

### 6.4 Auto-Mode Pause Triggers

- No viable ideas from brainstorm
- Review score < 40 (rejected)
- Max review iterations reached without ≥ 90
- Any API error or generation failure
- User clicks "Pause"

Pause state saved in `pipeline_state_json` as `autoConfig.pausedAt`. User sees banner: "Auto-pilot paused at {stage}. [Resume Auto] [Continue Manually]"

---

## 7. Data Model

### 7.1 New Column

```sql
-- 20260415100000_project_pipeline_state.sql
ALTER TABLE public.projects
  ADD COLUMN pipeline_state_json jsonb DEFAULT '{}';
```

### 7.2 Existing Tables (unchanged)

| Table | Role in Pipeline |
|---|---|
| `idea_archives` | Brainstorm output. `project_id` links to project. |
| `brainstorm_sessions` | Session metadata. `project_id` links to project. |
| `research_sessions` | Research output. `project_id` links to project. |
| `content_drafts` | Draft + canonical core + review. `project_id` links to project. |
| `content_assets` | Images. `draft_id` links to draft. |
| `review_iterations` | Review audit log. `draft_id` links to draft. |

### 7.3 Persistence

Orchestrator writes both:
1. `pipeline_state_json` on project (orchestrator metadata: mode, current stage, stage results with entity IDs)
2. Actual entity rows via existing API endpoints

`GET /projects/{id}/pipeline` still works — returns entities from real tables. `pipeline_state_json` adds orchestrator state on top.

### 7.4 Stage Reversal Data Handling

When going back invalidates downstream stages:
- Entities are **unlinked** (`project_id` set to null), NOT deleted
- They remain in the library as standalone work
- `pipeline_state_json` clears downstream `stageResults`

---

## 8. File Structure

### 8.1 New Files

```
apps/app/src/components/engines/
├── BrainstormEngine.tsx
├── ResearchEngine.tsx
├── DraftEngine.tsx
├── ReviewEngine.tsx
├── AssetsEngine.tsx
├── PublishEngine.tsx
├── ImportPicker.tsx            # reusable library browser
├── ContextBanner.tsx           # upstream context display
└── types.ts                    # PipelineState, StageResult, EngineProps

apps/app/src/components/pipeline/
├── PipelineStages.tsx          # existing stepper (unchanged)
├── PipelineOrchestrator.tsx    # state machine, mode toggle, transitions
├── CompletedStageSummary.tsx   # collapsed card for finished stages
└── AutoModeControls.tsx        # pause/resume, progress display
```

### 8.2 Modified Files (standalone pages become thin wrappers)

```
channels/[id]/brainstorm/new/page.tsx       # ~400 → ~20 lines (generate wrapper)
channels/[id]/brainstorm/[sessionId]/page.tsx # ~220 → ~25 lines (read-only: fetches session, passes to engine with results pre-loaded)
channels/[id]/research/new/page.tsx          # ~480 → ~20 lines (generate wrapper)
channels/[id]/research/[sessionId]/page.tsx  # ~230 → ~25 lines (read-only: fetches session, passes to engine with cards pre-loaded)
channels/[id]/drafts/new/page.tsx            # ~420 → ~25 lines (generate wrapper)
channels/[id]/drafts/[draftId]/page.tsx      # ~450 → ~40 lines (tabs wrapper: content engine read-only, review engine, assets engine, publish engine)
```

Session detail pages (`/[sessionId]`) fetch the session data and pass it to the engine component with results pre-loaded. The engine detects it has existing data and renders in results/review mode rather than generation mode. The `onComplete` callback on these pages navigates to the next stage (same as today).

### 8.3 Rewritten

```
projects/[id]/page.tsx           # rewritten to use PipelineOrchestrator
projects/[id]/discovery/page.tsx # deleted (replaced by orchestrator)
```

---

## 9. Migration Path

Ordered so nothing breaks mid-way. Each stage is independently shippable.

1. **Create engine components** — extract logic from existing pages into engines. Engines work standalone with test harnesses.
2. **Rewire standalone pages** — replace page internals with engine components. Verify standalone flow works identically.
3. **Build orchestrator** — create PipelineOrchestrator, wire to project page. Step-by-step mode only.
4. **Add import mode** — build ImportPicker, add import mode to each engine.
5. **Add auto mode** — build AutoModeControls, auto-mode logic in orchestrator.
6. **Add pipeline persistence** — migration for `pipeline_state_json`, save/restore on orchestrator.

---

## 10. Documentation Update

After implementation, update project documentation to reflect the new architecture:

### 10.1 Files to Update

| File | Updates |
|---|---|
| `CLAUDE.md` | Add Engine Components section, update Architecture section with pipeline orchestrator description |
| `docs/SPEC.md` | Add project pipeline workflow spec with stage descriptions and business rules |
| `README.md` | Update featured sections with pipeline orchestrator capabilities |
| `.claude/rules/api-routes.md` | Document any new API endpoints (pipeline state save/restore) |
| docs-site API reference | New endpoint documentation |
| docs-site feature pages | Pipeline orchestrator feature page |

### 10.2 Architecture Diagram (for CLAUDE.md / docs-site)

```
┌─────────────────────────────────────────────────────────────────┐
│                     BRIGHT TALE PIPELINE                         │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │Brainstorm│──▶│ Research  │──▶│  Draft   │──▶│  Review  │    │
│  │ Engine   │   │  Engine   │   │  Engine  │   │  Engine  │    │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘    │
│       │              │              │              │            │
│       │         ◀────┘         ◀────┘         ◀────┘            │
│       │        (back-ref)     (back-ref)   (revision loop)      │
│       │                                        │                │
│       │              ┌──────────┐   ┌──────────┤                │
│       │              │  Assets  │──▶│ Publish  │                │
│       │              │  Engine  │   │  Engine  │                │
│       │              └──────────┘   └──────────┘                │
│       │                                                         │
│  ┌────▼────────────────────────────────────────────────────┐    │
│  │              Pipeline Orchestrator                       │    │
│  │  • Step-by-step / Auto-pilot modes                      │    │
│  │  • Context accumulation across stages                   │    │
│  │  • Stage reversal with data preservation                │    │
│  │  • Review loop (score ≥ 90 gate)                        │    │
│  │  • Import from library at any stage (except review)     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  Standalone Pages   │  │  Project Pipeline Page          │   │
│  │  (ad-hoc, no project│  │  (orchestrated, full context)   │   │
│  │   thin wrappers)    │  │                                 │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 10.3 Pipeline Flow Diagram (for docs-site feature page)

```
┌───────────┐     ┌───────────┐     ┌───────────┐
│ BRAINSTORM│────▶│  RESEARCH │────▶│   DRAFT   │
│           │     │           │     │           │
│ Generate  │     │ Generate  │     │ Canonical │
│ or Import │     │ or Import │     │ Core +    │
│ ideas     │     │ cards     │     │ Produce   │
│           │     │           │     │ or Import │
│ Select 1  │     │ Approve   │     │           │
└───────────┘     └─────┬─────┘     └─────┬─────┘
                        │                 │
                   ◀────┘            ◀────┘
                  (pivot)        (bad research)
                                      │
                                      ▼
                  ┌───────────────────────────────┐
                  │           REVIEW LOOP          │
                  │                                │
                  │  Score < 90 ──▶ Revise ──┐    │
                  │       ▲                  │    │
                  │       └──────────────────┘    │
                  │                                │
                  │  Score ≥ 90 ──▶ Approved       │
                  │  Max iterations ──▶ Pause      │
                  └───────────┬───────────────────┘
                              │
                              ▼
                  ┌───────────┐     ┌───────────┐
                  │  ASSETS   │────▶│  PUBLISH  │
                  │           │     │           │
                  │ Generate  │     │ WordPress │
                  │ or Import │     │ config    │
                  │ or Upload │     │ Always    │
                  │           │     │ manual    │
                  └───────────┘     └───────────┘
```

### 10.4 Documentation Standards

- Use Mermaid or ASCII diagrams for flow charts (render in docs-site)
- Each engine gets a section describing inputs, outputs, modes, and configuration
- Review loop gets its own dedicated section with scoring criteria and iteration rules
- Auto-mode gets a section explaining pause triggers, AI decisions, and user overrides
- Include API endpoint reference for any new or modified endpoints
