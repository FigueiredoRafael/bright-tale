# Audit: bright-tale vs bright-curios-automation-workflow (Origin)

**Date**: 2026-04-13
**Status**: Draft
**Purpose**: Identify features, capabilities, and components present in the origin project but missing or incomplete in bright-tale.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| :white_check_mark: | Fully implemented in bright-tale |
| :large_orange_diamond: | Partially implemented / different approach |
| :x: | Missing from bright-tale |
| :arrows_counterclockwise: | Replaced with different architecture |

---

## 1. Agent Contract Gaps

### Agent 1 — Brainstorm

| Origin Feature | bright-tale Status | Notes |
|---|---|---|
| `performance_context` input (recent_winners, recent_losers) | :x: | Origin feeds past performance back into brainstorm. bright-tale brainstorm takes topic + inputMode only |
| `temporal_mix` input (evergreen_pct, seasonal_pct, trending_pct) | :x: | Origin lets user control content mix ratio |
| `constraints` input (avoid_topics, required_formats) | :x: | Origin supports negative constraints |
| `ideas_requested` count (1-10) | :x: | Origin lets user choose how many ideas to generate |
| `scroll_stopper` field per idea | :large_orange_diamond: | Check if agent prompt still outputs this; may be in YAML but not typed |
| `curiosity_gap` field per idea | :large_orange_diamond: | Same — check agent output normalization |
| `pick_recommendation` (best_choice + rationale) | :large_orange_diamond: | Origin agent recommends which idea to pick |

### Agent 2 — Research

| Origin Feature | bright-tale Status | Notes |
|---|---|---|
| `counterarguments` output (point, strength, rebuttal) | :large_orange_diamond: | Verify if research output type includes this |
| `knowledge_gaps` output | :large_orange_diamond: | Origin explicitly surfaces what's unknown |
| `refined_angle` with pivot recommendation | :large_orange_diamond: | Origin research agent can recommend abandoning or pivoting the idea |

### Agent 3 — Production

| Origin Feature | bright-tale Status | Notes |
|---|---|---|
| Agent 3b-Engagement output | :x: | Origin has engagement agent (pinned YouTube comment, community post, Twitter thread). No route or draft type in bright-tale |
| `engagement` content type in drafts | :x: | content_drafts.type only supports blog/video/shorts/podcast |
| Sound/music cues in video script | :large_orange_diamond: | Origin video agent outputs sound_cue and music_cue per chapter. Verify bright-tale VideoOutput includes these |
| Thumbnail variants (A/B) | :large_orange_diamond: | Origin video output includes thumbnail_json with multiple variants |
| Blog affiliate placement fields | :large_orange_diamond: | Origin BlogDraft has affiliate_placement, affiliate_copy, affiliate_link, affiliate_rationale |

### Agent 4 — Review

| Origin Feature | bright-tale Status | Notes |
|---|---|---|
| Review routes | :x: | No `/api/review` or review execution route exists. Agent-4 prompt exists but isn't wired |
| Review UI page | :x: | No review page under channels/[id] |
| `publication_plan` output | :x: | Origin review agent outputs full cross-platform publication schedule |
| `ab_tests` output (thumbnail_variants, title_variants) | :x: | Origin review agent suggests A/B test configurations |
| Per-format review (blog_review, video_review, shorts_review, etc.) | :x: | Origin reviews each format independently with scores |
| `seo_check` in blog review | :x: | Not implemented |
| `hook_effectiveness` in video review | :x: | Not implemented |
| Overall verdict (approved / revision_required / rejected) | :x: | No review verdict system |

---

## 2. API Endpoint Gaps

### Missing Routes (existed in origin, absent in bright-tale)

| Endpoint | Origin Purpose | Priority |
|---|---|---|
| `POST /api/ai/review` | Run review agent on production assets | High |
| `GET /api/revisions/:projectId/:stageType` | List all revisions for a stage | Medium |
| `GET /api/revisions/:projectId/:stageType/compare?v1=&v2=` | Side-by-side diff between versions | Medium |
| `POST /api/revisions/:projectId/:stageType/restore` | Rollback to previous version | Medium |
| `GET /api/search?query=&type=&status=&stage=` | Full-text unified search | Medium |
| `GET /api/search/suggestions?query=` | Autocomplete suggestions | Low |
| `POST /api/export` (multi-format) | Export as JSON/YAML/HTML/Markdown | Medium |
| `POST /api/performance/discovery-input` | Generate discovery input from winners/losers | Medium |
| `GET /api/performance/winners` | List winner projects with metrics | Medium |
| `POST /api/validate/yaml` | Validate YAML against agent schema | Low |

### Partially Implemented Routes

| Endpoint | Gap | Notes |
|---|---|---|
| `POST /api/stages` | Revisions exist but no compare/restore | Origin had full diff viewer support |
| `POST /api/projects/bulk` | Export in bulk returns JSON only | Origin planned JSON/YAML/HTML/MD formats |
| `PUT /api/projects/:id/winner` | Winner marking exists | But no performance dashboard to consume it |

---

## 3. UI Page & Component Gaps

### Missing Pages

| Page | Origin Purpose | Priority |
|---|---|---|
| Review stage page (`/channels/[id]/review/...`) | Review agent feedback + publication plan | High |
| Revision diff viewer (`/projects/[id]/revisions`) | Side-by-side comparison of stage versions | Medium |
| Unified search page (`/search`) | Search across projects, research, ideas | Medium |
| Performance dashboard (`/performance` or `/analytics`) | Winner/loser tracking, research ROI | Medium |
| Export modal (global) | Multi-format export for projects | Low |

### Missing Components

| Component | Origin Purpose | Priority |
|---|---|---|
| `DiffViewer` | Side-by-side version comparison with highlighting | Medium |
| `VersionHistory` | Timeline of revisions with compare/restore actions | Medium |
| `UnifiedSearch` + `SearchResults` | Full-text search with keyword highlighting | Medium |
| `ExportModal` | Format selection (JSON/YAML/HTML/MD) + download | Low |
| `PerformanceReview` | Winner marking UI + discovery input generation | Medium |
| `ValidationErrorPanel` | YAML validation errors with line numbers | Low |
| `EngagementEditor` | Edit pinned comments, community posts, Twitter threads | Low |

### Partially Implemented Components

| Component | Gap |
|---|---|
| `DiscoveryFormBuilder` | Origin had template quick-fill buttons, temporal mix sliders, constraints input. bright-tale version simplified to topic + inputMode |
| `IdeaSelectionGrid` | Origin had multi-select with bulk archive. bright-tale selects single idea for research |
| `ProjectCreationModal` | Origin had 3 tabs (Start Discovery, Use Research, Quick Entry). Verify bright-tale coverage |
| `StageTracker` | Origin supported flexible navigation (jump to any stage). Verify bright-tale behavior |

---

## 4. Database Schema Gaps

### Missing Tables

| Table | Origin Purpose | Notes |
|---|---|---|
| `engagement_drafts` (or engagement type in content_drafts) | Store engagement assets (pinned comments, tweets, community posts) | content_drafts.type enum doesn't include 'engagement' |

### Missing Columns / Fields

| Table.Column | Origin Purpose | Notes |
|---|---|---|
| `projects.video_style_config` | Per-project video style override | Verify if this exists in bright-tale projects table |
| `projects.completed_stages` (array) | Track which stages are done | Origin tracked this explicitly |
| `blog_drafts.affiliate_*` fields | Affiliate link placement, copy, rationale | Origin had 4 affiliate columns on blog drafts |
| `blog_drafts.internal_links_json` | Suggested internal links | Origin stored link suggestions |
| `blog_drafts.wordpress_post_id` | WordPress post ID after publishing | Verify in bright-tale |
| `video_drafts.title_options` (array) | 3 title alternatives for A/B testing | Origin stored multiple title options |
| `idea_archives.markdown_content` | Full markdown version of idea | Origin stored formatted content |
| `idea_archives.is_public` | Visibility flag | Origin supported public/private ideas |

### Schema Architecture Difference

| Aspect | Origin | bright-tale |
|---|---|---|
| Draft storage | Separate tables per format (blog_drafts, video_drafts, shorts_drafts, podcast_drafts) | Unified `content_drafts` table with `type` discriminator + `draft_json` JSONB |
| ORM | Prisma | Raw Supabase (service_role) |
| Content storage | Structured columns per field | JSONB blobs (draft_json, canonical_core_json) |

> **Note**: bright-tale's unified approach is arguably better for extensibility but loses column-level querying and type safety at the DB level.

---

## 5. Feature Gaps by Implementation Step

### Step 4 Gaps (Multi-Project Dashboard)

| Feature | Status | Notes |
|---|---|---|
| Auto-advance toggle (per project) | :large_orange_diamond: | Field exists, verify UI toggle |
| Autosave (30s debounce, last-write-wins) | :x: | Origin had autosave on stage forms |
| Dynamic form builders (schema-driven) | :x: | Origin built forms dynamically from Zod schemas |
| Template CRUD wiring (full UI) | :large_orange_diamond: | Templates API exists, verify UI completeness |
| List/Card view toggle on projects | :large_orange_diamond: | Verify implementation |

### Step 5 Gaps (AI + WordPress + Assets)

| Feature | Status | Notes |
|---|---|---|
| AI provider abstraction | :white_check_mark: | bright-tale has superior multi-provider routing |
| Encrypted API key storage | :white_check_mark: | AES-256-GCM in bright-tale |
| Manual mode fallback (AI disabled) | :large_orange_diamond: | Origin had explicit AI_ENABLED flag |
| WordPress draft creation | :white_check_mark: | Implemented |
| WordPress category/tag hybrid resolver | :large_orange_diamond: | Verify auto-create on demand |
| WordPress scheduled publishing | :large_orange_diamond: | Verify scheduledAt support |
| Unsplash image search + selection | :white_check_mark: | Implemented |
| Image placeholder workflow (`<!-- IMAGE:asset-id -->`) | :x: | Origin replaced placeholders in blog editor with real images on publish |
| Global image bank (project-independent assets) | :large_orange_diamond: | asset.project_id is nullable, but verify UI for global browsing |

### Step 6 Gaps (Revisions, Search, Export, Performance)

| Feature | Status | Notes |
|---|---|---|
| Unlimited revision history | :large_orange_diamond: | Revisions table exists, stages auto-archive. But no UI to browse/compare |
| Side-by-side diff viewer | :x: | Not implemented |
| Rollback capability | :x: | No restore endpoint |
| Full-text search (unified) | :x: | No search route or UI |
| Advanced filters (stage, status, verdict, date range) | :large_orange_diamond: | Some list endpoints have filters, but no unified search |
| Multi-format export (JSON/YAML/HTML/MD) | :x: | Only JSON export exists |
| Bulk export (ZIP) | :x: | Deferred in both projects |
| Performance tracking dashboard | :x: | Winner marking exists but no dashboard to visualize |
| Research ROI tracking | :large_orange_diamond: | winners_count incremented, but no analytics UI |
| Winner/loser arrays for next brainstorm cycle | :x: | Brainstorm doesn't accept performance_context |
| YAML validation with inline errors | :x: | No validation endpoint or panel |

---

## 6. Workflow Gaps

| Workflow | Origin | bright-tale | Gap |
|---|---|---|---|
| Discovery → idea selection → bulk project creation | Single flow, atomic transaction | Brainstorm → single idea → research → draft | No bulk project creation from multiple ideas |
| Performance feedback loop | Winners/losers fed back into brainstorm input | No feedback loop | Brainstorm is stateless — doesn't learn from past performance |
| Stage flexibility | Jump to any stage, re-run stages freely | Linear progression through pipeline | Less flexible navigation |
| Content type selection | User chooses which formats to produce | All 4 types available but produced individually | Origin produced all formats in one pass |
| Review → Revision cycle | Review agent gives feedback, user revises, re-submits | No review execution | Pipeline stops at production |
| Publication planning | Review agent outputs cross-platform schedule | No publication planner | WordPress publish exists but no coordinated multi-platform plan |

---

## 7. Bright-tale Additions (Not in Origin)

Features bright-tale has that origin does NOT:

| Feature | Notes |
|---|---|
| Multi-tenancy (organizations, teams, invites, roles) | Origin was single-user |
| Credit system with per-stage costs | Origin had no credit/billing system |
| YouTube niche analysis | 150-credit deep analysis of YouTube channels |
| Reference channel modeling | Plan-based limits on reference channels |
| Admin console (web app) | Separate admin portal for user/org/agent management |
| Smart model routing (tier x stage matrix) | Origin used simple AI_PROVIDER env flag |
| Multi-provider fallback chain | OpenAI → Anthropic → Gemini with automatic retry |
| Ollama local provider | Zero-cost local AI for development |
| Per-agent recommended model (admin-set) | ModelPicker with "Recommended" badge |
| Inngest background jobs | Async content pipeline execution |
| Onboarding flow | Multi-step channel setup for new users |
| Channel-scoped content | All content scoped to channels within orgs |
| Supabase auth + RLS | Origin used basic auth |
| Agent prompt editing (admin UI) | Edit prompts without redeploy |

---

## 8. Priority Recommendations

### P0 — Critical Pipeline Gaps
1. **Wire Review Agent (Agent 4)** — Route + UI. Pipeline is incomplete without review/approval gate
2. **Add engagement content type** — Agent-3b-engagement exists but has no route, draft type, or UI
3. **Performance feedback loop** — Brainstorm should accept winners/losers from past cycles

### P1 — Important Missing Features
4. **Revision diff viewer** — Revisions are stored but users can't compare or rollback
5. **Unified search** — No way to find content across the platform
6. **Publication planner** — Coordinate multi-platform publishing from review output
7. **Enrich brainstorm input** — Add temporal_mix, constraints, ideas_requested, performance_context

### P2 — Quality of Life
8. **Multi-format export** (YAML, HTML, Markdown — not just JSON)
9. **Autosave on stage forms** (30s debounce)
10. **Performance dashboard** (winner visualization, research ROI)
11. **Image placeholder workflow** in blog editor
12. **YAML validation endpoint** with inline error panel

### P3 — Nice to Have
13. Dynamic form builders from schemas
14. Bulk project creation from multiple ideas
15. A/B test suggestions from review agent
16. Global image bank browser UI
