# Engine Logs — Admin Logging System

**Date:** 2026-04-16
**Status:** Approved
**Purpose:** Full-payload logging of LLM engine calls for internal debugging. Separate from Sentry (errors only) — this captures business-level input/output for every AI generation.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Payload granularity | Full (system prompt + user prompt + raw response) | Debugging tool — need complete visibility |
| Viewer location | Admin panel only (`apps/web/zadmin`) | Internal debugging, users must not see LLM prompts |
| Storage | New `engine_logs` table (not extending `job_events`) | Clean separation — `job_events` is lightweight SSE progress, `engine_logs` is full payloads |
| Retention | No auto-cleanup | Add later when storage is a concern |

---

## 1. Database: `engine_logs` Table

### Schema

```sql
CREATE TABLE public.engine_logs (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          text,
  user_id         text NOT NULL,
  project_id      text,
  channel_id      text,
  session_id      text,
  session_type    text NOT NULL,  -- brainstorm, research, production, review, canonical-core
  stage           text NOT NULL,  -- brainstorm, research, production, review
  provider        text NOT NULL,  -- openai, anthropic, gemini, ollama
  model           text NOT NULL,
  input_json      jsonb NOT NULL, -- full system prompt + user prompt + params
  output_json     jsonb,          -- full raw LLM response (null on error)
  duration_ms     integer NOT NULL DEFAULT 0,
  input_tokens    integer,
  output_tokens   integer,
  error           text,           -- error message on failure
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.engine_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_engine_logs_created_at ON public.engine_logs (created_at DESC);
CREATE INDEX idx_engine_logs_project_id ON public.engine_logs (project_id);
CREATE INDEX idx_engine_logs_session_id ON public.engine_logs (session_id);
CREATE INDEX idx_engine_logs_stage ON public.engine_logs (stage);
CREATE INDEX idx_engine_logs_user_id ON public.engine_logs (user_id);
CREATE INDEX idx_engine_logs_channel_id ON public.engine_logs (channel_id);

```

Logs are immutable (write-once). No `updated_at` column, no trigger.

### Payload Structure

**`input_json`** example:
```json
{
  "system": "You are Agent-1, a brainstorm specialist...",
  "messages": [
    { "role": "user", "content": "Generate 5 ideas about AI in healthcare..." }
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "params": {
    "inputMode": "blind",
    "topic": "AI in Healthcare",
    "niche": "health tech"
  }
}
```

**`output_json`** example:
```json
{
  "content": "BC_BRAINSTORM_OUTPUT:\n  ideas:\n    - title: ...",
  "usage": { "input_tokens": 1234, "output_tokens": 2345 },
  "model": "claude-sonnet-4-20250514",
  "finish_reason": "stop"
}
```

---

## 2. Hook Point: `generateWithFallback()`

### Location

`apps/api/src/lib/ai/router.ts` — the single funnel for all LLM calls.

### Utility: `logEngineCall()`

New file: `apps/api/src/lib/ai/engine-log.ts`

```typescript
interface EngineLogEntry {
  userId: string;
  orgId?: string;
  projectId?: string;
  channelId?: string;
  sessionId?: string;
  sessionType: string;
  stage: string;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export async function logEngineCall(entry: EngineLogEntry): Promise<void>
```

- Fire-and-forget — errors in logging must not block the generation pipeline
- Called inside `generateWithFallback()` after the provider returns (success or error)
- Wraps `supabase.from('engine_logs').insert()`

---

## 3. API Endpoints

### `GET /api/engine-logs`

List logs with filters and grouping. Admin-only — enforced by checking `user_profiles.role = 'admin'` for the authenticated user (same pattern as existing admin routes in `apps/web`).

**Query params:**
- `stage` — filter by stage (brainstorm, research, production, review)
- `provider` — filter by provider
- `model` — filter by model
- `project_id` — filter by project
- `channel_id` — filter by channel
- `user_id` — filter by user
- `session_id` — filter by session
- `group_by` — none (default), user, channel, project, engine
- `from` / `to` — date range (ISO strings)
- `page` / `limit` — pagination (default: page=1, limit=50)
- `error_only` — boolean, filter to failed calls only

**Response (flat, group_by=none):**
```json
{
  "data": {
    "items": [
      {
        "id": "abc-123",
        "stage": "brainstorm",
        "session_type": "brainstorm",
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "duration_ms": 1200,
        "input_tokens": 1234,
        "output_tokens": 2345,
        "error": null,
        "project_id": "proj-1",
        "project_title": "AI in Healthcare",
        "channel_name": "Tech Blog",
        "user_email": "hector@...",
        "created_at": "2026-04-16T10:00:00Z"
      }
    ],
    "total": 156,
    "page": 1,
    "limit": 50
  },
  "error": null
}
```

Note: List endpoint returns metadata only — no `input_json`/`output_json` (too large). Full payloads via detail endpoint.

**Response (grouped):**
```json
{
  "data": {
    "groups": [
      {
        "key": "proj-1",
        "label": "AI in Healthcare",
        "count": 12,
        "items": [ ... ]
      }
    ],
    "total_groups": 8,
    "total_items": 156,
    "page": 1,
    "limit": 50
  },
  "error": null
}
```

Pagination applies to groups (not individual items). Each group returns its most recent items (up to 20). Expanding a group in the UI fetches remaining items on demand.

### `GET /api/engine-logs/:id`

Single log with full payloads. Admin-only.

```json
{
  "data": {
    "id": "abc-123",
    "stage": "brainstorm",
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "input_json": { ... },
    "output_json": { ... },
    "duration_ms": 1200,
    "input_tokens": 1234,
    "output_tokens": 2345,
    "error": null,
    "created_at": "2026-04-16T10:00:00Z"
  },
  "error": null
}
```

---

## 4. Admin Page UI

### Location

`apps/web/src/app/zadmin/(protected)/engine-logs/page.tsx`

### Layout: Master-Detail Split Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│  Engine Logs                                                        │
│  stage ▾ │ provider ▾ │ model ▾ │ date range │ search...            │
│  Group by: [None ▾ | User | Channel | Project | Engine]             │
├──────────────────────────────────┬──────────────────────────────────┤
│  LOG LIST (left ~45%)            │  PAYLOAD INSPECTOR (right ~55%)  │
│                                  │                                  │
│  ● brainstorm · claude-sonnet    │  ┌─ Input ──────── [Copy JSON] ─┐│
│    "AI in Healthcare"            │  │ { prettified JSON }           ││
│    1.2s · 3.4k tok · 2m ago     │  └──────────────────────────────-┘│
│                                  │                                  │
│  ✗ production · gemini-flash     │  ┌─ Output ─────── [Copy JSON] ─┐│
│    "AI in Healthcare"            │  │ { prettified JSON }           ││
│    error · 0.4s · 8m ago        │  └──────────────────────────────-┘│
│                                  │                                  │
│  ● review · claude-sonnet        │  ┌─ Meta ──────────────────────-┐│
│    "Crypto Trends"               │  │ Duration / Tokens / Provider ││
│    2.1s · 8k tok · 12m ago      │  │ Model / Session / Error      ││
│                                  │  └──────────────────────────────-┘│
├──────────────────────────────────┴──────────────────────────────────┤
│  24 of 156 logs                                          page 1 ▸  │
└─────────────────────────────────────────────────────────────────────┘
```

### Grouped View (when group_by is active)

```
│  ▼ AI in Healthcare (12 logs)    │
│    ● brainstorm · claude · 1.2s  │
│    ✗ production · gemini · 0.4s  │
│    ● review · claude · 2.1s      │
│                                  │
│  ▶ Crypto Trends (8 logs)        │
│  ▶ hector@brighttale.io (24)     │
```

- Collapsible groups, sorted by most recent activity
- Count badge per group
- Click individual log → loads right panel

### UI Details

- **Stage pills** — color-coded: green=brainstorm, blue=research, purple=production, orange=review
- **Error state** — red accent on card + error text in right panel
- **Copy buttons** — `[Copy JSON]` on Input and Output sections. Copies prettified JSON to clipboard.
- **JSON display** — monospace `<pre>` with scrollable overflow, dark-themed
- **Dark theme** — matches existing admin panel CSS variables
- **Responsive** — on narrow screens, right panel becomes a slide-over drawer

### Sidebar Navigation

Add "Engine Logs" link to existing admin sidebar, under Analytics.

---

## 5. Components Breakdown

| Component | File | Purpose |
|-----------|------|---------|
| `EngineLogsPage` | `engine-logs/page.tsx` | Page layout, data fetching, state |
| `LogFilters` | `engine-logs/LogFilters.tsx` | Filter bar + group-by selector |
| `LogList` | `engine-logs/LogList.tsx` | Left panel — flat or grouped list |
| `LogCard` | `engine-logs/LogCard.tsx` | Single log row in list |
| `LogGroup` | `engine-logs/LogGroup.tsx` | Collapsible group header + children |
| `PayloadInspector` | `engine-logs/PayloadInspector.tsx` | Right panel — input/output/meta |
| `JsonViewer` | `engine-logs/JsonViewer.tsx` | Prettified JSON display + copy button |

---

## 6. Not in Scope

- No retention/cleanup automation
- No export functionality
- No real-time streaming/live tail
- No app-side viewer (admin only)
- No search within JSON payloads
- No diff between input/output versions
