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

Each workspace has a `.env.example` — copy to `.env.local` and fill in the values.
All `.env.local` files are gitignored. Each `*.example` has the local Docker values pre-filled as defaults.

```bash
cp .env.example .env.local
cp apps/api/.env.example apps/api/.env.local
cp apps/app/.env.example apps/app/.env.local
cp apps/web/.env.example apps/web/.env.local
```

**Root `.env.local`** — Supabase CLI only (not read by any app at runtime):
```bash
SUPABASE_ACCESS_TOKEN=sbp_...   # only needed for remote commands (db:push:dev, db:types)

# Google OAuth for local Supabase — get from console.cloud.google.com/apis/credentials
# Also add http://127.0.0.1:54321/auth/v1/callback as an authorized redirect URI there
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<your-client-secret>
```

**`apps/api/.env.local`** — see `apps/api/.env.example` for all vars. Minimum to start:
```bash
INTERNAL_API_KEY=<generate with: npm run generate:secret>
# Local Docker Supabase (pre-filled in .env.example):
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key — run: supabase status>

# At least ONE AI provider (Gemini has a free tier, Ollama is fully local):
GOOGLE_AI_KEY=AIza...           # https://aistudio.google.com/app/apikey
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

**`apps/app/.env.local`** — see `apps/app/.env.example`. Minimum:
```bash
INTERNAL_API_KEY=<same value as apps/api>
API_URL=http://localhost:3001
# Local Docker Supabase values are pre-filled in .env.example
```

### 3. Database (local Docker — recommended)

```bash
npm run dev:local    # starts Supabase if not running, then starts all dev servers
```

Or manually:
```bash
npm run db:start     # boots local Supabase on :54321 (Docker required)
npm run db:reset     # applies all migrations + seed data
npm run db:seed      # regenerates agent/persona seed from source files
npm run db:types:local  # regenerates packages/shared/src/types/database.ts from local DB
```

Supabase Studio (local): http://127.0.0.1:54323

**Remote dev project** (when you need to test against staging data):
```bash
npm run db:push:dev  # requires SUPABASE_ACCESS_TOKEN in root .env.local
npm run db:types     # regenerates types from remote project
```

### Switching env between local and remote dev

`apps/*/.env.local` is the active env. To keep multiple presets side-by-side
(local Docker, remote dev, etc.), store each as `apps/<api|app>/.env.local.<variant>`
and swap with:

```bash
npm run env:switch local         # local Docker Supabase (default)
npm run env:switch remote-dev    # whatever you saved as .env.local.remote-dev
```

First-time setup for a variant — copy the active files then edit:
```bash
cp apps/api/.env.local apps/api/.env.local.remote-dev
cp apps/app/.env.local apps/app/.env.local.remote-dev
# edit those copies to point at the remote project
```

Convention: `.env.local` mirrors the local Docker variant on feature branches.
Only swap to `remote-dev` for explicit remote testing, and switch back before
running tests or merging.

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
npm run dev:local   # recommended: auto-starts local Supabase if needed, then starts everything
npm run dev         # if Supabase is already running
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

# Database — local
npm run db:start         # local Supabase up (Docker)
npm run db:stop          # local Supabase down
npm run db:reset         # local Supabase reset + reseed
npm run db:seed          # regenerate seed.sql from agents/*.md and apply
npm run db:types:local   # regenerate database.ts types from local DB

# Database — remote
npm run db:push:dev      # apply migrations to dev Supabase (needs SUPABASE_ACCESS_TOKEN)
npm run db:push:prod     # apply migrations to prod (with confirmation)
npm run db:types         # regenerate database.ts types from remote project

# Utilities
npm run generate:secret  # 32-byte hex (use for INTERNAL_API_KEY)
```

---

## Architecture in one paragraph

`apps/app` is a thin Next.js UI. Its middleware proxies all `/api/*` to `apps/api` (Fastify on port 3001), stripping any client-supplied `x-internal-key` / `x-user-id` and injecting the real values from env. `apps/api` validates the shared secret on every request, owns all Supabase writes via the `service_role` key, and runs background jobs through Inngest. AI calls go through `apps/api/src/lib/ai/router.ts` which builds a provider chain (override → tier primary → fallbacks) and retries transient failures. Agent system prompts live in `agent_prompts` (DB), seeded from `agents/*.md` and editable from the admin UI without redeploys.

For deeper docs see [`docs/`](./docs/) and the milestone pages in `apps/docs-site/src/content/milestones/`.

---

## Features

### Content Pipeline

Orchestrated multi-stage workflow for producing publication-ready content:

1. **Idea** — Brainstorm with AI or import from library
2. **Research** — Deep research with card approval
3. **Draft** — Canonical core + format-specific production
4. **Review** — AI scoring with iterative revision loop (target: 90+)
5. **Assets** — AI image generation or manual upload
6. **Publish** — WordPress integration with scheduling

Run step-by-step or in auto-pilot mode. Each stage can import existing material from the library.

### Extended Workflow Features

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

**Google login `Unsupported provider`** — add `[auth.external.google]` section to `supabase/config.toml` and set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in root `.env.local`, then `npm run db:stop && npm run db:start`.

**Google login `redirect_uri_mismatch`** — add `http://127.0.0.1:54321/auth/v1/callback` to the authorized redirect URIs of your OAuth app in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

**`supabase: command not found`** — `brew install supabase/tap/supabase` (mac) or see https://supabase.com/docs/guides/cli.

**Ollama "model not found"** — `ollama list` shows what you actually pulled. Either pull the model the picker is asking for, or pick one from `ollama list` in the UI.
