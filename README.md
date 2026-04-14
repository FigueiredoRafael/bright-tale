# BrightTale

AI-assisted content factory: brainstorm → research → produce → review → publish across blog, video, shorts and podcast formats. Multi-provider AI (Gemini, OpenAI, Anthropic, **local Ollama**) with runtime fallback.

```
bright-tale/
├── apps/
│   ├── app/      Next.js UI (port 3000)        @brighttale/app
│   ├── api/      Fastify API (port 3001)       @brighttale/api
│   └── web/      landing + admin (port 3002)   @brighttale/web
├── packages/
│   └── shared/   types, schemas, mappers       @brighttale/shared
├── supabase/     migrations + seeds
└── agents/       agent prompt source files
```

---

## Prerequisites

- **Node.js 20+** and **npm 10+**
- **Supabase CLI** (`brew install supabase/tap/supabase`) — for migrations
- **Docker Desktop** — only if you want a local Supabase instead of remote
- **Ollama** (optional, recommended for free local AI):
  - macOS: `brew install ollama`
  - Linux: `curl -fsSL https://ollama.com/install.sh | sh`

---

## First-time setup

### 1. Clone + install

```bash
git clone <repo-url> bright-tale
cd bright-tale
npm install
```

### 2. Environment files

Three env files (gitignored). Copy from someone on the team or create:

**`.env.local`** (root)
```bash
SUPABASE_ACCESS_TOKEN=sbp_...   # for `supabase` CLI
```

**`apps/api/.env.local`**
```bash
INTERNAL_API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# At least ONE of these — Gemini has a free tier, Ollama is fully local.
GOOGLE_AI_KEY=AIza...           # https://aistudio.google.com/app/apikey
OPENAI_API_KEY=sk-...           # paid
ANTHROPIC_API_KEY=sk-ant-...    # paid
# Ollama needs no key, only a running server (see step 4).

YOUTUBE_API_KEY=...             # https://console.cloud.google.com (YouTube Data API v3)
```

**`apps/app/.env.local`**
```bash
INTERNAL_API_KEY=<same value as apps/api>
API_URL=http://localhost:3001
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Database

Apply migrations to your dev Supabase project:

```bash
npm run db:push:dev      # pushes supabase/migrations/* to dev
npm run db:types         # regenerates packages/shared/src/types/database.ts
```

Local Supabase alternative (Docker required):

```bash
npm run db:start         # boots local Supabase on :54321
npm run db:reset         # applies migrations + seed
# Then point apps/api .env to http://localhost:54321 with local keys
```

Seed agent prompts (idempotent):

```bash
npm run db:seed
```

### 4. Local AI (Ollama, optional but recommended)

**Recommended for testing the full pipeline locally without burning API quota:**

```bash
ollama pull qwen2.5:7b       # ~4.4GB — best balance for our use case
```

Why `qwen2.5:7b`? It follows structured output (JSON/YAML) reliably, which is what
brainstorm/research/production stages need. Llama 3.2 3B is too small for structured
output and will produce "0 ideas recognized" errors. Anything larger doesn't pay off
locally — for real quality, hit Gemini/Claude.

**RAM guidance:**

| Mac RAM | Recommended local model |
|---|---|
| 8GB | skip Ollama, use Gemini Flash (free tier) |
| 16GB | `qwen2.5:7b` (~4.4GB) |
| 24GB+ | `qwen2.5:7b` or `mistral-nemo:12b` (~7GB) |

**Quality ranking (for our content workflow):**

| Model | Quality | Cost | Notes |
|---|---|---|---|
| Claude Sonnet 4.5 | ⭐⭐⭐⭐⭐ | $$$ | best pt-BR writing, use for production content |
| Gemini 2.5 Pro | ⭐⭐⭐⭐⭐ | $$ | strong all-around |
| Gemini 2.5 Flash | ⭐⭐⭐⭐ | **free tier** | great default for dev + many prod cases |
| GPT-4o | ⭐⭐⭐⭐ | $$ | solid, slightly worse pt-BR than Claude |
| Claude Haiku 4.5 | ⭐⭐⭐ | $ | fast + cheap |
| Qwen 2.5 7B (local) | ⭐⭐ | free | dev/testing only — pipeline works, output is meh |
| Llama 3.2 3B (local) | ⭐ | free | too small for structured output, avoid |

**Suggested workflow:**
- **Dev / pipeline testing:** Ollama (`qwen2.5:7b`) — zero cost, offline-friendly
- **Daily use:** Gemini 2.5 Flash — free tier covers a lot
- **Production content:** Claude Sonnet 4.5 — best quality where it matters

`npm run dev` will start `ollama serve` automatically; if you already run it as a service or skip this step, the script just logs and moves on.

---

## Running

```bash
npm run dev       # app + api + web + docs + inngest + ollama in parallel
```

Or individually:

```bash
npm run dev:app       # http://localhost:3000  (user UI)
npm run dev:api       # http://localhost:3001  (Fastify routes)
npm run dev:web       # http://localhost:3002  (admin + landing)
npm run dev:docs      # http://localhost:3003  (docs-site)
npm run dev:inngest   # http://localhost:8288  (Inngest dev UI)
npm run dev:ollama    # http://localhost:11434 (local AI)
```

After login the app routes you to onboarding (creates org + first channel). Then:

- `/channels/[id]/brainstorm/new` — generate ideas (50 credits, picks any provider)
- `/channels/[id]/research/new` — research a topic at surface/medium/deep level
- `/channels/[id]/drafts/new` — produce blog/video/shorts/podcast from a research session

Admin lives at `http://localhost:3002/admin` (you must be in `user_roles` with `role='admin'`).

---

## AI providers

| Provider | Cost | Setup | Best for |
|---|---|---|---|
| **Ollama** (local) | Free | `ollama pull <model>` | Dev/test, offline, infinite calls |
| **Gemini** | Free tier (15 RPM, 1M tokens/day) | `GOOGLE_AI_KEY` | Standard daily use |
| **OpenAI** | Paid ($5 min) | `OPENAI_API_KEY` | High-quality production |
| **Anthropic** | Paid ($5 min) | `ANTHROPIC_API_KEY` | Best for long-form content |

The router automatically falls back across providers on transient errors (overload, network, billing). Per-stage `Recommended` provider+model is configurable in **admin → Agentes**.

---

## Common scripts

```bash
# Build & test
npm run build            # all workspaces
npm run test             # all workspaces
npm run typecheck        # all workspaces
npm run lint             # all workspaces

# Database
npm run db:push:dev      # apply migrations to dev Supabase
npm run db:push:prod     # apply migrations to prod (with confirmation)
npm run db:types         # regenerate database.ts types from remote
npm run db:start         # local Supabase up (Docker)
npm run db:stop          # local Supabase down
npm run db:reset         # local Supabase reset + reseed
npm run db:seed          # regenerate seed.sql from agents/*.md and apply

# Utilities
npm run generate:secret  # 32-byte hex (use for INTERNAL_API_KEY)
```

---

## Architecture in one paragraph

`apps/app` is a thin Next.js UI. Its middleware proxies all `/api/*` to `apps/api` (Fastify on port 3001), stripping any client-supplied `x-internal-key` / `x-user-id` and injecting the real values from env. `apps/api` validates the shared secret on every request, owns all Supabase writes via the `service_role` key, and runs background jobs through Inngest. AI calls go through `apps/api/src/lib/ai/router.ts` which builds a provider chain (override → tier primary → fallbacks) and retries transient failures. Agent system prompts live in `agent_prompts` (DB), seeded from `agents/*.md` and editable from the admin UI without redeploys.

For deeper docs see [`docs/`](./docs/) and the milestone pages in `apps/docs-site/src/content/milestones/`.

---

## Features

### Content Pipeline (end-to-end)

Complete 5-stage workflow: **Brainstorm** (idea generation) **Research** (evidence validation + pivot recommendations) **Canonical Core** (thesis + emotional arc) **Production** (blog/video/shorts/podcast) **Review Loop** (agent-4 scoring, must reach 90+ to approve) **Asset Generation** (post-approval, WebP optimized) **WordPress Publishing** (images embedded, taxonomies resolved, draft/publish/schedule modes).

### Manual Mode (copy-paste AI workflow)

Every AI-powered stage (brainstorm, research, review) supports a **Manual** tab alongside the AI generation tab. When AI providers are unavailable, rate-limited, or your machine can't run local models:

1. **Copy Prompt** copies the full agent instructions + your input context to clipboard
2. Paste into **ChatGPT, Gemini web, Claude, or any free AI chat**
3. **Paste Output** back the JSON response imports it into the pipeline

This preserves the original BrightCurios workflow (YAML copy-paste with ChatGPT) while the platform transitions to fully automated AI calls. Manual mode visibility is controlled by `useManualMode()` hook in `apps/app/src/hooks/use-manual-mode.ts` and can be restricted to admin users via the `user_roles` table.

### Ideas Library

Grid and list views with multi-select (Shift+click range, Ctrl/Cmd+click toggle). Batch actions: export JSON, change verdict, bulk delete. Import modal with JSON/Markdown support, drag-drop, dry-run validation with error/warning reporting, and preview table before confirming.

### Smart AI Routing

Multi-provider fallback chain: Gemini (free tier) OpenAI Anthropic Ollama (local). Per-stage model routing by tier (free/standard/premium/ultra). Runtime provider override in UI. Agent prompts loaded from DB and editable from admin without redeploys.

### Review Loop

Agent-4 evaluates content with per-format scoring (blog_review.score, video_review.score). Verdict-driven state machine: `approved` (score 90+), `revision_required`, or `rejected`. Each iteration logged in `review_iterations` audit table. Credits debited only on successful agent calls.

### Entity Linking

Full traceability: idea content_draft project published WordPress post. `project_id` on content_drafts, `wordpress_post_id` tracking. One project per selected idea, flowing through the entire pipeline.

---

## Troubleshooting

**`ECONNRESET` / `Failed to proxy`** — `apps/api` crashed or restarted mid-request. Restart with `npm run dev:api` and check stderr for the actual error.

**Brainstorm/research returns 0 ideas** — the agent output shape didn't match the normalizer. Check `apps/api` logs for the raw response and adjust `normalizeIdeas` in `apps/api/src/routes/brainstorm.ts`.

**Quota exceeded on Gemini** — free tier resets per minute and per day. Wait or switch to Ollama for unlimited dev usage.

**`supabase: command not found`** — `brew install supabase/tap/supabase` (mac) or see https://supabase.com/docs/guides/cli.

**Ollama "model not found"** — `ollama list` shows what you actually pulled. Either pull the model the picker is asking for, or pick one from `ollama list` in the UI.
