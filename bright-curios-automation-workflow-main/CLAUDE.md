# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo with a Next.js application in `bright-curios-workflow/` and agent definition files in `agents/`. All development commands must be run from the `bright-curios-workflow/` directory.

## Development Commands

```bash
cd bright-curios-workflow

# Dev server (localhost:3000)
npm run dev

# Build & start production
npm run build && npm start

# Tests
npm run test              # Run all tests (Vitest, verbose)
npm run test:watch        # Watch mode
npx vitest run src/lib/__tests__/crypto.test.ts  # Single test file

# Lint
npm run lint

# Database
npx prisma migrate dev     # Create and apply migration
npx prisma generate        # Regenerate Prisma client after schema changes
npx prisma studio          # Database GUI
npx prisma db seed         # Seed agent prompts & sample data

# Storybook
npm run storybook          # Port 6006

# Generate encryption secret
npm run generate:secret
```

## Architecture

### 4-Agent Content Workflow

The platform implements a 5-stage pipeline: **Brainstorm -> Research -> Production -> Review -> Publish**

Each stage has a corresponding AI agent with type-safe YAML contracts (BC_* format):
- Agent definitions live in `agents/agent-{1-4}-*.md`
- TypeScript contracts are in `src/types/agents.ts` (BC_BRAINSTORM_INPUT/OUTPUT, BC_RESEARCH_INPUT/OUTPUT, etc.)
- Stage data chains between agents via mapping functions (`mapBrainstormToResearchInput`, `mapResearchToProductionInput`)

The workflow is ChatGPT-assisted: the platform generates BC_*_INPUT YAML, user copies it to ChatGPT with the agent prompt, pastes back BC_*_OUTPUT YAML which the platform parses.

### Tech Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **PostgreSQL** with **Prisma 7** ORM
- **Zod** for request/response validation (schemas in `src/lib/schemas/`)
- **shadcn/ui** + Tailwind CSS 4 for UI
- **Vitest** + Testing Library for tests
- AI providers: Anthropic SDK, OpenAI SDK, with mock adapter for testing (`src/lib/ai/`)

### Key Directories (under `bright-curios-workflow/src/`)

- `app/api/` - REST API routes (43+ endpoints). Patterns: projects, stages, research, templates, wordpress, blogs, ai, assets, export
- `app/` (pages) - Dashboard, project detail with stage tracker, research library, blog library, settings, templates
- `components/` - Stage forms (BrainstormForm, ResearchForm, ProductionForm, ReviewForm), project management, UI primitives
- `lib/api/` - API utilities (error handling, validation)
- `lib/schemas/` - Centralized Zod schemas for all endpoints (with tests)
- `lib/queries/` - Reusable database query logic
- `lib/ai/` - AI provider abstraction layer with provider-agnostic adapter pattern
- `lib/prisma.ts` - Prisma client singleton
- `types/agents.ts` - All agent contract type definitions

### Database

PostgreSQL with Prisma. Key models: `ResearchArchive`, `Project` (with stages and revisions), `Stage`, `BlogDraft`, `IdeaArchive`, `Template` (self-referencing inheritance), `AgentPrompt`, `WordPressConfig`, `AIProviderConfig`.

Schema at `prisma/schema.prisma`. Cascading deletes are configured. After schema changes, run `npx prisma migrate dev` then `npx prisma generate`.

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### Testing

Vitest with jsdom environment. Tests live alongside source in `__tests__/` directories. Setup file at `src/test/setup.ts` loads env vars and testing-library matchers. Run single tests with `npx vitest run <path>`.

### Canonical Decisions

- Templates API: `GET /api/templates/:id` (raw) vs `GET /api/templates/:id/resolved` (merged with parent)
- Bulk export: JSON only (ZIP deferred)
- Agent contracts: BC_* YAML format is the standard
- Legacy format has 30-day backward compatibility (`isLegacyIdea()`, `normalizeLegacyIdea()`)
- README.md is canonical source of truth for requirements and architecture decisions
