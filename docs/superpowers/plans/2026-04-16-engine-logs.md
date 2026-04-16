# Engine Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-payload logging of every LLM engine call, viewable in the admin panel with filters, grouping, and a payload inspector with copy-to-clipboard.

**Architecture:** New `engine_logs` DB table written by a fire-and-forget `logEngineCall()` utility hooked into `generateWithFallback()`. Admin page in `apps/web/zadmin` queries Supabase directly (same pattern as analytics page). No new API routes in `apps/api` — the admin panel uses the service-role Supabase client.

**Tech Stack:** Supabase (PostgreSQL + JSONB), Fastify (apps/api), Next.js server components (apps/web), Tailwind CSS, Lucide icons

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260416100000_engine_logs.sql` | DB table + indexes |
| Create | `apps/api/src/lib/ai/engine-log.ts` | `logEngineCall()` utility |
| Modify | `apps/api/src/lib/ai/router.ts:236-293` | Hook logging into `generateWithFallback()` |
| Modify | `apps/web/src/app/zadmin/(protected)/admin-sidebar.tsx:11-27` | Add "Engine Logs" nav link |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/page.tsx` | Main page — layout, data fetch, state |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/LogFilters.tsx` | Filter bar + group-by selector |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/LogList.tsx` | Left panel — flat list or grouped |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/LogCard.tsx` | Single log row |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/LogGroup.tsx` | Collapsible group header |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/PayloadInspector.tsx` | Right panel — input/output/meta |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/JsonViewer.tsx` | JSON display + copy button |
| Create | `apps/web/src/app/zadmin/(protected)/engine-logs/EngineLogsClient.tsx` | Client wrapper for interactive state |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260416100000_engine_logs.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Engine Logs: full-payload logging of LLM engine calls
CREATE TABLE public.engine_logs (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id          text,
  user_id         text NOT NULL,
  project_id      text,
  channel_id      text,
  session_id      text,
  session_type    text NOT NULL,
  stage           text NOT NULL,
  provider        text NOT NULL,
  model           text NOT NULL,
  input_json      jsonb NOT NULL,
  output_json     jsonb,
  duration_ms     integer NOT NULL DEFAULT 0,
  input_tokens    integer,
  output_tokens   integer,
  error           text,
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

- [ ] **Step 2: Push migration to dev**

Run: `npm run db:push:dev`
Expected: Migration applied successfully

- [ ] **Step 3: Regenerate types**

Run: `npm run db:types`
Expected: `packages/shared/src/types/database.ts` updated with `engine_logs` table

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260416100000_engine_logs.sql packages/shared/src/types/database.ts
git commit -m "feat(db): add engine_logs table for LLM payload logging"
```

---

### Task 2: `logEngineCall()` Utility

**Files:**
- Create: `apps/api/src/lib/ai/engine-log.ts`

- [ ] **Step 1: Create the engine-log utility**

```typescript
/**
 * Fire-and-forget logging of full LLM input/output payloads to engine_logs.
 * Must never block or break the generation pipeline.
 */
import { createServiceClient } from '../supabase/index.js';

export interface EngineLogEntry {
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

export function logEngineCall(entry: EngineLogEntry): void {
  const sb = createServiceClient();
  (sb.from('engine_logs') as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  }).insert({
    user_id: entry.userId,
    org_id: entry.orgId ?? null,
    project_id: entry.projectId ?? null,
    channel_id: entry.channelId ?? null,
    session_id: entry.sessionId ?? null,
    session_type: entry.sessionType,
    stage: entry.stage,
    provider: entry.provider,
    model: entry.model,
    input_json: entry.input,
    output_json: entry.output ?? null,
    duration_ms: entry.durationMs,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    error: entry.error ?? null,
  }).catch((err: unknown) => {
    console.warn('[engine-log] failed to write engine log:', err);
  });
}
```

Key details:
- Returns `void`, not `Promise<void>` — fire-and-forget. The `.catch()` swallows errors.
- Uses same Supabase type-cast pattern as `usage-log.ts`
- No await — caller does not wait for the insert

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: All workspaces pass

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/ai/engine-log.ts
git commit -m "feat(api): add logEngineCall() utility for LLM payload logging"
```

---

### Task 3: Hook into `generateWithFallback()`

**Files:**
- Modify: `apps/api/src/lib/ai/router.ts:236-293`

- [ ] **Step 1: Add import at top of router.ts**

At the imports section of `apps/api/src/lib/ai/router.ts`, add:

```typescript
import { logEngineCall } from './engine-log.js';
```

- [ ] **Step 2: Add logging context parameter**

The `generateWithFallback` function needs context about who/what is generating. Extend the `ChainOptions` interface (or add a new parameter). Find the `ChainOptions` interface in router.ts and add logging fields:

```typescript
export interface ChainOptions {
  preferProvider?: string;
  preferModel?: string;
  // Engine logging context
  logContext?: {
    userId: string;
    orgId?: string;
    projectId?: string;
    channelId?: string;
    sessionId?: string;
    sessionType: string;
  };
}
```

- [ ] **Step 3: Instrument the success and error paths**

Replace the function body of `generateWithFallback` (lines 236-293) with this instrumented version. The logic is identical — only `startTime` capture and `logEngineCall()` calls are added:

```typescript
export async function generateWithFallback(
  stage: AgentType,
  tier: string,
  params: GenerateContentParams,
  options: ChainOptions = {},
): Promise<{ result: unknown; providerName: string; model: string; attempts: number; usage?: TokenUsage }> {
  const chain = getProviderChain(stage, tier, options);
  if (chain.length === 0) {
    throw new Error(
      `No AI provider available for stage=${stage}, tier=${tier}. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_KEY.`,
    );
  }

  const SAME_PROVIDER_RETRIES = 2;
  const baseDelayMs = Number(process.env.AI_RETRY_BASE_MS ?? (process.env.NODE_ENV === 'test' ? 0 : 800));
  const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const startTime = Date.now();

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const route = chain[i];
    let attempt = 0;
    while (attempt <= SAME_PROVIDER_RETRIES) {
      try {
        const result = await route.provider.generateContent(params);
        const usage = route.provider.lastUsage;
        // Log successful call
        if (options.logContext) {
          logEngineCall({
            ...options.logContext,
            stage,
            provider: route.providerName,
            model: route.model,
            input: { system: params.systemPrompt, messages: params.messages, temperature: params.temperature, maxTokens: params.maxTokens },
            output: typeof result === 'object' && result !== null ? result as Record<string, unknown> : { content: result },
            durationMs: Date.now() - startTime,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        }
        return {
          result,
          providerName: route.providerName,
          model: route.model,
          attempts: i + 1,
          usage,
        };
      } catch (err) {
        lastErr = err;
        const message = String((err as { message?: string })?.message ?? err);
        console.warn(
          `[ai-router] provider=${route.providerName} model=${route.model} attempt=${attempt + 1}: ${message} (retrySame=${shouldRetrySameProvider(err)})`,
        );
        if (!shouldRetrySameProvider(err)) break;
        if (attempt < SAME_PROVIDER_RETRIES) {
          await sleep(baseDelayMs * Math.pow(2, attempt));
          attempt++;
          continue;
        }
        break;
      }
    }
    if (i === chain.length - 1) break;
    if (!isProviderFailover(lastErr)) break;
  }
  // Log failed call
  if (options.logContext) {
    logEngineCall({
      ...options.logContext,
      stage,
      provider: chain[0]?.providerName ?? 'unknown',
      model: chain[0]?.model ?? 'unknown',
      input: { system: params.systemPrompt, messages: params.messages, temperature: params.temperature, maxTokens: params.maxTokens },
      durationMs: Date.now() - startTime,
      error: String((lastErr as { message?: string })?.message ?? lastErr),
    });
  }
  throw lastErr;
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: All workspaces pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/ai/router.ts
git commit -m "feat(api): hook logEngineCall into generateWithFallback"
```

---

### Task 4: Pass `logContext` from Job Callers

**Files:**
- Modify: `apps/api/src/jobs/brainstorm-generate.ts`
- Modify: `apps/api/src/jobs/research-generate.ts`
- Modify: `apps/api/src/jobs/production-generate.ts`

Each background job calls `generateWithFallback()`. They need to pass `logContext` in the `options` parameter. The pattern is the same for all three.

- [ ] **Step 1: Find the `generateWithFallback` call in brainstorm-generate.ts and add logContext**

Locate the `generateWithFallback(...)` call in `brainstorm-generate.ts`. It will look something like:

```typescript
const { result, providerName, model, usage } = await generateWithFallback(
  'brainstorm',
  tier,
  params,
);
```

Add the options argument with logContext. The job event data should already have `userId`, `channelId`, `sessionId` available from the Inngest event payload:

```typescript
const { result, providerName, model, usage } = await generateWithFallback(
  'brainstorm',
  tier,
  params,
  {
    logContext: {
      userId,
      orgId,
      channelId,
      sessionId: session.id,
      sessionType: 'brainstorm',
    },
  },
);
```

- [ ] **Step 2: Repeat for research-generate.ts**

Same pattern — find the `generateWithFallback` call and add `logContext` with `sessionType: 'research'`.

- [ ] **Step 3: Repeat for production-generate.ts**

Same pattern — `sessionType: 'production'`. This file may have multiple `generateWithFallback` calls (canonical-core + produce). Add `logContext` to each, using `sessionType: 'canonical-core'` and `sessionType: 'production'` respectively.

- [ ] **Step 4: Check for any other callers of generateWithFallback**

Run: `grep -rn 'generateWithFallback' apps/api/src/ --include='*.ts'`

Add `logContext` to any additional callers found (e.g. content-drafts review route). If the caller doesn't have `userId`/`sessionId` in scope, pass what's available — the fields are optional except `userId` and `sessionType`.

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: All workspaces pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs/
git commit -m "feat(api): pass logContext to generateWithFallback in all job callers"
```

---

### Task 5: Admin Sidebar — Add Engine Logs Link

**Files:**
- Modify: `apps/web/src/app/zadmin/(protected)/admin-sidebar.tsx:11-27`

- [ ] **Step 1: Add ScrollText icon import**

In the icon import line (line 6), add `ScrollText`:

```typescript
import {
  LayoutDashboard, Users, Building2, Bot, BarChart3, ScrollText,
} from 'lucide-react';
```

- [ ] **Step 2: Add Engine Logs to SECTIONS**

In the `Gestão` group (after the Analytics item, line 24), add:

```typescript
{ label: 'Engine Logs', path: adminPath('/engine-logs'), icon: ScrollText },
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/admin-sidebar.tsx
git commit -m "feat(admin): add Engine Logs link to sidebar"
```

---

### Task 6: JsonViewer Component

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/JsonViewer.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';

interface JsonViewerProps {
  label: string;
  data: unknown;
}

export function JsonViewer({ label, data }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-[#1E2E40] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0D1117] border-b border-[#1E2E40]">
        <span className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">{label}</span>
        <button
          onClick={handleCopy}
          className="text-xs px-2.5 py-1 rounded bg-[#1E2E40] text-[#94A3B8] hover:text-[#2DD4A8] hover:bg-[rgba(45,212,168,0.1)] transition-all"
        >
          {copied ? '✓ Copied' : 'Copy JSON'}
        </button>
      </div>
      <pre className="p-4 text-xs text-[#E2E8F0] bg-[#0A0F16] overflow-auto max-h-[400px] font-mono leading-relaxed whitespace-pre-wrap break-words">
        {json}
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/JsonViewer.tsx
git commit -m "feat(admin): add JsonViewer component with copy-to-clipboard"
```

---

### Task 7: PayloadInspector Component

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/PayloadInspector.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { JsonViewer } from './JsonViewer';

interface EngineLog {
  id: string;
  stage: string;
  session_type: string;
  provider: string;
  model: string;
  input_json: unknown;
  output_json: unknown;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  created_at: string;
  project_id: string | null;
  channel_id: string | null;
  session_id: string | null;
  user_id: string;
}

interface PayloadInspectorProps {
  log: EngineLog | null;
}

function MetaRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#1E2E40] last:border-0">
      <span className="text-xs text-[#64748B]">{label}</span>
      <span className="text-xs text-[#E2E8F0] font-mono">{value ?? '—'}</span>
    </div>
  );
}

function formatTokens(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function PayloadInspector({ log }: PayloadInspectorProps) {
  if (!log) {
    return (
      <div className="flex items-center justify-center h-full text-[#64748B] text-sm">
        Select a log to inspect
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      <JsonViewer label="Input" data={log.input_json} />
      <JsonViewer label="Output" data={log.output_json} />

      {log.error && (
        <div className="border border-red-800/40 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-red-900/20 border-b border-red-800/40">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Error</span>
          </div>
          <pre className="p-4 text-xs text-red-300 bg-[#0A0F16] overflow-auto max-h-[200px] font-mono whitespace-pre-wrap">
            {log.error}
          </pre>
        </div>
      )}

      <div className="border border-[#1E2E40] rounded-lg p-4 bg-[#0D1117]">
        <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Meta</p>
        <MetaRow label="Duration" value={`${(log.duration_ms / 1000).toFixed(2)}s`} />
        <MetaRow label="Tokens In" value={formatTokens(log.input_tokens)} />
        <MetaRow label="Tokens Out" value={formatTokens(log.output_tokens)} />
        <MetaRow label="Provider" value={log.provider} />
        <MetaRow label="Model" value={log.model} />
        <MetaRow label="Stage" value={log.stage} />
        <MetaRow label="Session Type" value={log.session_type} />
        <MetaRow label="Session ID" value={log.session_id} />
        <MetaRow label="Project ID" value={log.project_id} />
        <MetaRow label="Channel ID" value={log.channel_id} />
        <MetaRow label="User ID" value={log.user_id} />
      </div>
    </div>
  );
}

export type { EngineLog };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/PayloadInspector.tsx
git commit -m "feat(admin): add PayloadInspector component for engine logs"
```

---

### Task 8: LogCard Component

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/LogCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

const STAGE_COLORS: Record<string, string> = {
  brainstorm: 'bg-emerald-500/20 text-emerald-400',
  research: 'bg-blue-500/20 text-blue-400',
  production: 'bg-purple-500/20 text-purple-400',
  review: 'bg-orange-500/20 text-orange-400',
};

interface LogCardProps {
  log: {
    id: string;
    stage: string;
    provider: string;
    model: string;
    duration_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
    error: string | null;
    created_at: string;
    project_title?: string;
    channel_name?: string;
    user_email?: string;
  };
  selected: boolean;
  onClick: () => void;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTokens(n: number | null): string {
  if (n == null) return '';
  const total = n;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tok`;
  return `${total} tok`;
}

export function LogCard({ log, selected, onClick }: LogCardProps) {
  const stageColor = STAGE_COLORS[log.stage] ?? 'bg-slate-500/20 text-slate-400';
  const hasError = !!log.error;
  const totalTokens = (log.input_tokens ?? 0) + (log.output_tokens ?? 0);
  const modelShort = log.model.replace(/^(claude-|gpt-|gemini-)/, '').split('-').slice(0, 2).join('-');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-[#1E2E40] transition-all ${
        selected
          ? 'bg-[rgba(45,212,168,0.08)] border-l-2 border-l-[#2DD4A8]'
          : 'hover:bg-[rgba(45,212,168,0.04)] border-l-2 border-l-transparent'
      } ${hasError ? 'border-l-red-500' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasError ? 'bg-red-500/20 text-red-400' : stageColor}`}>
          {hasError ? '✗' : '●'} {log.stage}
        </span>
        <span className="text-[11px] text-[#64748B]">{modelShort}</span>
      </div>
      <p className="text-xs text-[#E2E8F0] truncate mb-1">
        {log.project_title ?? log.user_email ?? log.channel_name ?? '—'}
      </p>
      <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
        {hasError ? (
          <span className="text-red-400">error</span>
        ) : (
          <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
        )}
        {totalTokens > 0 && <span>· {formatTokens(totalTokens)}</span>}
        <span>· {timeAgo(log.created_at)}</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/LogCard.tsx
git commit -m "feat(admin): add LogCard component for engine log list"
```

---

### Task 9: LogGroup Component

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/LogGroup.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { LogCard } from './LogCard';

interface LogGroupProps {
  label: string;
  count: number;
  items: Array<{
    id: string;
    stage: string;
    provider: string;
    model: string;
    duration_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
    error: string | null;
    created_at: string;
    project_title?: string;
    channel_name?: string;
    user_email?: string;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LogGroup({ label, count, items, selectedId, onSelect }: LogGroupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[#0D1117] border-b border-[#1E2E40] hover:bg-[rgba(45,212,168,0.04)] transition-all"
      >
        <ChevronRight
          size={14}
          className={`text-[#64748B] transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-xs font-medium text-[#E2E8F0] flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1E2E40] text-[#94A3B8]">{count}</span>
      </button>
      {expanded && items.map((log) => (
        <LogCard
          key={log.id}
          log={log}
          selected={selectedId === log.id}
          onClick={() => onSelect(log.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/LogGroup.tsx
git commit -m "feat(admin): add LogGroup component for grouped log view"
```

---

### Task 10: LogFilters Component

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/LogFilters.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

interface Filters {
  stage: string;
  provider: string;
  groupBy: string;
  errorOnly: boolean;
}

interface LogFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const STAGES = ['', 'brainstorm', 'research', 'production', 'review'];
const PROVIDERS = ['', 'openai', 'anthropic', 'gemini', 'ollama'];
const GROUP_BY = ['none', 'user', 'channel', 'project', 'engine'];

function Select({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="bg-[#0D1117] border border-[#1E2E40] text-[#E2E8F0] text-xs rounded-lg px-3 py-2 focus:border-[#2DD4A8] focus:outline-none transition-colors"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === '' ? `All ${label}` : opt.charAt(0).toUpperCase() + opt.slice(1)}
        </option>
      ))}
    </select>
  );
}

export function LogFilters({ filters, onChange }: LogFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border-b border-[#1E2E40] bg-[#0F1620]">
      <Select label="stages" value={filters.stage} options={STAGES} onChange={(stage) => onChange({ ...filters, stage })} />
      <Select label="providers" value={filters.provider} options={PROVIDERS} onChange={(provider) => onChange({ ...filters, provider })} />

      <div className="flex items-center gap-2 bg-[#0D1117] border border-[#1E2E40] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#64748B] uppercase tracking-wider">Group by</span>
        <select
          value={filters.groupBy}
          onChange={(e) => onChange({ ...filters, groupBy: e.target.value })}
          aria-label="Group by"
          className="bg-transparent text-[#E2E8F0] text-xs focus:outline-none"
        >
          {GROUP_BY.map((opt) => (
            <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#94A3B8] cursor-pointer">
        <input
          type="checkbox"
          checked={filters.errorOnly}
          onChange={(e) => onChange({ ...filters, errorOnly: e.target.checked })}
          className="accent-[#2DD4A8]"
        />
        Errors only
      </label>
    </div>
  );
}

export type { Filters };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/LogFilters.tsx
git commit -m "feat(admin): add LogFilters component for engine logs"
```

---

### Task 11: LogList Component

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/LogList.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { LogCard } from './LogCard';
import { LogGroup } from './LogGroup';

interface LogItem {
  id: string;
  stage: string;
  provider: string;
  model: string;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  created_at: string;
  project_title?: string;
  channel_name?: string;
  user_email?: string;
}

interface Group {
  key: string;
  label: string;
  count: number;
  items: LogItem[];
}

interface LogListProps {
  items: LogItem[];
  groups: Group[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  limit: number;
}

export function LogList({ items, groups, selectedId, onSelect, total, page, onPageChange, limit }: LogListProps) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {groups ? (
          groups.map((group) => (
            <LogGroup
              key={group.key}
              label={group.label}
              count={group.count}
              items={group.items}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          items.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              selected={selectedId === log.id}
              onClick={() => onSelect(log.id)}
            />
          ))
        )}
        {items.length === 0 && !groups && (
          <div className="flex items-center justify-center py-12 text-[#64748B] text-sm">
            No logs found
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-[#1E2E40] bg-[#0D1117] text-xs text-[#64748B]">
        <span>{total} logs</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-2 py-1 rounded bg-[#1E2E40] disabled:opacity-30 hover:text-[#E2E8F0] transition-colors"
          >
            ◂
          </button>
          <span>page {page} of {totalPages || 1}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-2 py-1 rounded bg-[#1E2E40] disabled:opacity-30 hover:text-[#E2E8F0] transition-colors"
          >
            ▸
          </button>
        </div>
      </div>
    </div>
  );
}

export type { LogItem, Group };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/LogList.tsx
git commit -m "feat(admin): add LogList component for engine logs"
```

---

### Task 12: EngineLogsClient — Interactive Client Wrapper

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/EngineLogsClient.tsx`

This is the main client component that orchestrates filters, list, and inspector. It receives initial data from the server component page and handles all interactive state.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LogFilters, type Filters } from './LogFilters';
import { LogList, type LogItem, type Group } from './LogList';
import { PayloadInspector, type EngineLog } from './PayloadInspector';

const LIMIT = 50;

// Map group_by to the DB column and the label source
const GROUP_CONFIG: Record<string, { column: string; labelColumn: string }> = {
  user: { column: 'user_id', labelColumn: 'user_id' },
  channel: { column: 'channel_id', labelColumn: 'channel_id' },
  project: { column: 'project_id', labelColumn: 'project_id' },
  engine: { column: 'stage', labelColumn: 'stage' },
};

export function EngineLogsClient() {
  const [filters, setFilters] = useState<Filters>({ stage: '', provider: '', groupBy: 'none', errorOnly: false });
  const [items, setItems] = useState<LogItem[]>([]);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<EngineLog | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (currentFilters: Filters, currentPage: number) => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('engine_logs')
      .select('id, stage, session_type, provider, model, duration_ms, input_tokens, output_tokens, error, created_at, project_id, channel_id, user_id, session_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((currentPage - 1) * LIMIT, currentPage * LIMIT - 1);

    if (currentFilters.stage) query = query.eq('stage', currentFilters.stage);
    if (currentFilters.provider) query = query.eq('provider', currentFilters.provider);
    if (currentFilters.errorOnly) query = query.not('error', 'is', null);

    const { data, count } = await query;
    const logs = (data ?? []) as LogItem[];
    setTotal(count ?? 0);

    if (currentFilters.groupBy !== 'none') {
      const config = GROUP_CONFIG[currentFilters.groupBy];
      if (config) {
        const grouped = new Map<string, { items: LogItem[]; label: string }>();
        for (const log of logs) {
          const key = (log as unknown as Record<string, string>)[config.column] ?? 'unknown';
          const label = (log as unknown as Record<string, string>)[config.labelColumn] ?? key;
          if (!grouped.has(key)) grouped.set(key, { items: [], label });
          grouped.get(key)!.items.push(log);
        }
        setGroups(
          Array.from(grouped.entries()).map(([key, val]) => ({
            key,
            label: val.label,
            count: val.items.length,
            items: val.items,
          }))
        );
        setItems([]);
      }
    } else {
      setGroups(null);
      setItems(logs);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs(filters, page);
  }, [filters, page, fetchLogs]);

  async function handleSelect(id: string) {
    setSelectedId(id);
    const supabase = createClient();
    const { data } = await supabase.from('engine_logs').select('*').eq('id', id).single();
    setSelectedLog(data as EngineLog | null);
  }

  function handleFiltersChange(newFilters: Filters) {
    setFilters(newFilters);
    setPage(1);
    setSelectedId(null);
    setSelectedLog(null);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <LogFilters filters={filters} onChange={handleFiltersChange} />
      {loading && (
        <div className="flex items-center justify-center py-8 text-[#64748B] text-sm">Loading...</div>
      )}
      {!loading && (
        <div className="flex flex-1 min-h-0">
          <div className="w-[45%] border-r border-[#1E2E40] flex flex-col">
            <LogList
              items={items}
              groups={groups}
              selectedId={selectedId}
              onSelect={handleSelect}
              total={total}
              page={page}
              onPageChange={setPage}
              limit={LIMIT}
            />
          </div>
          <div className="w-[55%] bg-[#0A0F16]">
            <PayloadInspector log={selectedLog} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/EngineLogsClient.tsx
git commit -m "feat(admin): add EngineLogsClient orchestrator component"
```

---

### Task 13: Engine Logs Page

**Files:**
- Create: `apps/web/src/app/zadmin/(protected)/engine-logs/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { EngineLogsClient } from './EngineLogsClient';

export const dynamic = 'force-dynamic';

export default function EngineLogsPage() {
  return (
    <div className="h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2E40]">
        <div>
          <h1 className="text-lg font-bold text-[#F0F4F8]">Engine Logs</h1>
          <p className="text-xs text-[#64748B]">Full LLM input/output payload inspector</p>
        </div>
      </div>
      <EngineLogsClient />
    </div>
  );
}
```

- [ ] **Step 2: Verify the admin panel loads**

Run: `npm run dev:web`
Navigate to: `http://localhost:3002/zadmin/engine-logs`
Expected: Page loads with empty state "No logs found" and filter bar

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/zadmin/(protected)/engine-logs/page.tsx
git commit -m "feat(admin): add Engine Logs page"
```

---

### Task 14: End-to-End Verification

- [ ] **Step 1: Start full dev environment**

Run: `npm run dev`

- [ ] **Step 2: Trigger an engine generation**

Navigate to the app, create or open a project, trigger a brainstorm generation. This should write a row to `engine_logs` via `logEngineCall()`.

- [ ] **Step 3: Check the admin panel**

Navigate to: `http://localhost:3002/zadmin/engine-logs`
Expected:
- Log appears in the left list with stage pill, model, duration
- Click it → right panel shows full Input JSON, Output JSON, and Meta
- Copy JSON button works
- Filter by stage works
- Group by engine works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: engine logs admin system — DB, logging utility, admin UI"
```
