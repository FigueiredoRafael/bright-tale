# BrightCurios Workflow Platform

A comprehensive Next.js platform for AI-assisted content creation with a **5-stage, 4-agent workflow system**, AI image generation, global Image Bank, research library, and multi-platform publishing (Blog, YouTube, Shorts, Podcast).

> **Monorepo layout:** Next.js app lives in `bright-curios-workflow/`. Agent definition files live in `agents/`. All dev commands must be run from `bright-curios-workflow/`.

---

## Features

### Workflow Pipeline

- **5-Stage Pipeline**: Brainstorm → Research → Production → Review → Publish
- **4-Agent ChatGPT Integration**: Structured BC_* YAML contracts for AI-assisted content creation
- **Full Input Persistence**: Every stage saves and restores all form fields, raw AI responses, and configuration on reload
- **Stage Navigation**: Click any stage in the tracker to switch; auto-saves current stage before navigating
- **Auto-advance Toggle**: Optionally advance to the next stage automatically on complete

### AI Image Generation

- **Gemini Imagen Integration**: `gemini-2.5-flash-image` (recommended) and `imagen-3.0-generate-002`
- **Global Image Bank** (`/images`): Gallery of all generated images across projects with filter, search, bulk download/delete
- **Prompt Builder**: Sidebar for standalone image creation without a project context
- **Production Assets**: Per-section blog images and thumbnail/chapter video images auto-suggested from agent output
- **Image Storage**: Files saved locally under `public/generated-images/`
- **Single & ZIP Downloads**: Download individual images or bulk ZIP

### Content Production

- **Canonical Core Workflow**: BC_CANONICAL_CORE → per-format agents (Blog, Video, Shorts, Podcast, Engagement)
- **Blog Editor**: Rich editing with live preview, save as blog draft
- **Video Script**: Title options, script sections, chapter illustrations
- **Shorts & Podcast**: Dedicated tabs with structured output
- **Asset Tabs**: Generate images tied to each piece of content

### Research Library

- Store and reuse research across multiple projects
- Research focus and depth settings persisted when loading from library
- Import from markdown, download as markdown
- Link research entries to projects

### Publishing

- WordPress publishing (draft or live) with category/tag support
- Blog content auto-fetched from production stage
- Asset download section for manual upload to WordPress/YouTube

### Settings

- **AI Providers**: Configure Anthropic / OpenAI text generation providers
- **Image Generation**: Configure Gemini Imagen API key and model
- **WordPress**: Configure site URL and credentials
- **Agents**: View and edit agent system prompts per stage

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Database | PostgreSQL + Prisma 7 |
| Validation | Zod |
| UI | shadcn/ui + Tailwind CSS 4 |
| Image AI | `@google/genai` (Gemini Imagen) |
| Testing | Vitest + Testing Library |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1. Clone & Install

```bash
git clone <repository-url>
cd bright-curios-automation-workflow/bright-curios-workflow
npm install
```

### 2. Database Setup

```bash
createdb bright_curios_workflow
npx prisma migrate dev
npx prisma db seed
```

### 3. Environment Variables

Create `bright-curios-workflow/.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow"

# Encryption (generate with: npm run generate:secret)
ENCRYPTION_SECRET="your-32-char-secret"

# Image Generation (optional — can also configure via Settings UI)
IMAGE_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# Node
NODE_ENV="development"
```

### 4. Run

```bash
npm run dev
# Open http://localhost:3000
```

---

## Development Commands

```bash
# Dev server
npm run dev

# Build
npm run build && npm start

# Tests
npm run test
npm run test:watch

# Lint
npm run lint

# Database
npx prisma migrate dev      # Create and apply migration
npx prisma generate         # Regenerate Prisma client
npx prisma studio           # Database GUI
npx prisma db seed          # Seed agent prompts & sample data

# Generate encryption secret
npm run generate:secret
```

---

## Agent Architecture

### 5-Stage Pipeline

```
Brainstorm → Research → Production → Review → Publish
     │            │           │          │        │
BC_BRAINSTORM  BC_RESEARCH  BC_*      BC_REVIEW  (WP API)
```

### The 4 Agents

| Agent | Stage | Purpose | Contract |
|---|---|---|---|
| **Brainstorm** | brainstorm | Generate & select content ideas | `BC_BRAINSTORM_INPUT` → `BC_BRAINSTORM_OUTPUT` |
| **Research** | research | Validate claims, find sources | `BC_RESEARCH_INPUT` → `BC_RESEARCH_OUTPUT` |
| **Production** | production | Create blog, video, shorts, podcast | `BC_CANONICAL_CORE` → per-format outputs |
| **Review** | review | Quality review & publication plan | `BC_REVIEW_INPUT` → `BC_REVIEW_OUTPUT` |

### ChatGPT Integration Workflow

1. **Generate YAML** — Platform generates `BC_*_INPUT` YAML from form data
2. **Copy to ChatGPT** — User copies YAML + agent prompt
3. **Get Response** — ChatGPT returns `BC_*_OUTPUT` YAML
4. **Paste & Parse** — Platform parses response and displays structured content
5. **Advance Stage** — User reviews and advances to next stage

---

## Project Structure

```
bright-curios-automation-workflow/
├── agents/                          # Agent definition markdown files
│   ├── agent-1-brainstorm.md
│   ├── agent-2-research.md
│   ├── agent-3b-blog.md
│   ├── agent-3b-video.md
│   └── agent-4-review.md
│
└── bright-curios-workflow/          # Next.js application
    ├── src/
    │   ├── app/
    │   │   ├── api/
    │   │   │   ├── projects/        # Project CRUD + bulk operations
    │   │   │   ├── stages/          # Stage management + revisions
    │   │   │   ├── assets/          # Asset CRUD + generate + download
    │   │   │   ├── image-generation/# Gemini Imagen config + test
    │   │   │   ├── research/        # Research library
    │   │   │   ├── templates/       # Template system
    │   │   │   ├── wordpress/       # WordPress publish + config
    │   │   │   └── ai/              # AI provider config
    │   │   ├── images/              # Global Image Bank
    │   │   ├── projects/[id]/       # Focused project view (all stages)
    │   │   ├── research/            # Research library UI
    │   │   ├── blogs/               # Blog draft library
    │   │   ├── videos/              # Video draft library
    │   │   └── settings/            # AI, image gen, WordPress, agents
    │   │
    │   ├── components/
    │   │   ├── brainstorm/          # BrainstormForm
    │   │   ├── research/            # ResearchForm
    │   │   ├── production/          # ProductionForm, BlogEditor, VideoPreview
    │   │   ├── review/              # ReviewForm
    │   │   ├── wordpress/           # PublishingForm
    │   │   ├── assets/              # AssetsTabBlog, AssetsTabVideo, ImageGenerationCard
    │   │   ├── images/              # ImageBankCard, PromptBuilder, RegenerateDialog
    │   │   ├── agents/              # AgentPromptViewer
    │   │   ├── ideas/               # IdeaLibraryPicker
    │   │   ├── layout/              # DashboardLayout, Sidebar
    │   │   └── ui/                  # shadcn/ui components
    │   │
    │   ├── types/
    │   │   └── agents.ts            # BC_* agent contract types
    │   │
    │   └── lib/
    │       ├── ai/                  # Provider abstraction + Gemini Imagen
    │       │   ├── imageIndex.ts    # Image provider factory
    │       │   ├── imageProvider.ts # Provider interface
    │       │   ├── promptGenerators.ts
    │       │   └── providers/
    │       │       ├── gemini-imagen.ts
    │       │       └── mock-imagen.ts
    │       ├── files/
    │       │   └── imageStorage.ts  # Local file save/delete utilities
    │       ├── modules/             # blog, video, shorts, podcast, engagement
    │       │   └── {format}/        # schema, mapper, exporter, validator
    │       ├── schemas/             # Zod validation schemas
    │       ├── queries/             # Reusable DB query logic
    │       └── prisma.ts            # Prisma client singleton
    │
    ├── prisma/
    │   ├── schema.prisma            # Database schema
    │   ├── seed.ts                  # Agent prompts + sample data
    │   └── migrations/
    │
    └── public/
        └── generated-images/        # AI-generated images (gitignored)
```

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| Agent contracts | BC_* YAML format | Structured, parseable, copy-paste friendly |
| Image storage | Local filesystem (`public/`) | Simple, no external dependency |
| API key storage | AES-256-GCM encrypted in DB | Secure; supports UI-based config |
| Asset project link | Nullable `project_id` | Images can be standalone (Image Bank) |
| Research library format | JSON-wrapped in `research_content` | Flexible schema evolution |
| Legacy format support | `isLegacyIdea()` + 30-day compat | Avoid breaking existing data |
| Bulk export | JSON only (ZIP deferred) | Simplicity first |

---

## Roadmap

### Completed

- [x] 5-stage workflow pipeline with 4-agent YAML contracts
- [x] Full input persistence across all stages (save/restore on reload)
- [x] Gemini Imagen AI image generation
- [x] Global Image Bank with filter, search, bulk operations
- [x] Production assets tab (blog sections + video thumbnails)
- [x] Canonical Core multi-format production workflow
- [x] Blog editor with live preview
- [x] Research library with markdown import/export
- [x] WordPress publishing integration
- [x] AI provider configuration (text + image)
- [x] Stage navigation with auto-save
- [x] Idea library with similarity detection
- [x] Template system with inheritance

### In Progress / Planned

- [ ] Revision comparison (diff view between stage versions)
- [ ] Full-text search across projects and research
- [ ] Kanban board view for projects
- [ ] ZIP export for bulk project data
- [ ] WordPress media upload (auto-upload generated images)
- [ ] YouTube metadata publishing

---

**Built for content creators who want AI assistance without losing control.**
