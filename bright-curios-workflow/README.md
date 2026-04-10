# BrightCurios Workflow Platform

A comprehensive Next.js platform for AI-assisted content creation with a **4-agent workflow system**, integrated research library, and multi-platform publishing (Blog, YouTube, Shorts, Podcast).

## 📖 Quick Links

- **[Getting Started: Setup Guide](docs/GETTING_STARTED.md)** - Get the project running in 5 minutes
- **[Usage Guide: Operating the Workflow](docs/USAGE_GUIDE.md)** - How to use the 4-agent pipeline
- **[API Documentation](docs/API.md)** - Complete REST API reference

> **📌 This README is the canonical source of truth** for project requirements, architecture decisions, and implementation status.

## 🚀 Features

### Core Platform

- **5-Stage Workflow Pipeline**: Brainstorm → Research → Production → Review → Publish
- **4-Agent ChatGPT Integration**: Structured YAML contracts for AI-assisted content creation
- **Multi-Project Management**: Manage multiple content projects simultaneously
- **Unlimited Revision History**: Track all changes with automatic versioning
- **Research Library**: Store and organize research with sources
- **Template System**: Reusable templates with inheritance support
- **Asset Management**: Unsplash integration for image search and storage
- **Comprehensive REST API**: 32+ endpoints for all operations

### Agent System (✅ Implemented)

- **Type-Safe Contracts**: Full TypeScript definitions in `src/types/agents.ts`
- **BC\_\* YAML Format**: Standardized input/output contracts for all agents
- **Legacy Compatibility**: 30-day backward compatibility for old data formats
- **Stage Data Chaining**: Automatic data flow between workflow stages

### Front-end Forms (✅ Rebuilt)

- **BrainstormForm**: Theme input, idea generation, verdict selection
- **ResearchForm**: Source validation, statistics, expert quotes, counterarguments
- **ProductionForm**: Blog/Video/Shorts/Podcast content tabs
- **ReviewForm**: Verdicts, scores, issues, publication plan

### Dashboard & Views

- **Projects Dashboard**: List & card views, multi-select, bulk operations, export (JSON-only)
- **Focused Project View**: Stage tracker, editable stage forms, autosave (30s), auto-advance
- **Template Manager**: List and resolved-preview available

### Canonical Decisions

- Templates API: `GET /api/templates/:id` (raw) vs `GET /api/templates/:id/resolved` (merged)
- Bulk export: **JSON only** (ZIP export deferred)
- Agent contracts: **BC\_\* YAML format** is the standard

## 🤖 Agent Architecture

### 5-Stage Workflow Pipeline

```
Brainstorm → Research → Production → Review → Publish
    │           │           │           │         │
    ▼           ▼           ▼           ▼         ▼
 BC_BRAINSTORM BC_RESEARCH BC_PRODUCTION BC_REVIEW (status)
```

### The 4 Agents

| Agent                | Stage      | Purpose                             | Contract                                       |
| -------------------- | ---------- | ----------------------------------- | ---------------------------------------------- |
| **Brainstorm Agent** | brainstorm | Generate & select content ideas     | `BC_BRAINSTORM_INPUT` → `BC_BRAINSTORM_OUTPUT` |
| **Research Agent**   | research   | Validate claims, find sources       | `BC_RESEARCH_INPUT` → `BC_RESEARCH_OUTPUT`     |
| **Production Agent** | production | Create blog, video, shorts, podcast | `BC_PRODUCTION_INPUT` → `BC_PRODUCTION_OUTPUT` |
| **Review Agent**     | review     | Quality review & publication plan   | `BC_REVIEW_INPUT` → `BC_REVIEW_OUTPUT`         |

### ChatGPT Integration Workflow

1. **Generate YAML** - Platform generates `BC_*_INPUT` YAML from form data
2. **Copy to ChatGPT** - User copies YAML to ChatGPT with agent prompt
3. **Get Response** - ChatGPT returns `BC_*_OUTPUT` YAML
4. **Paste & Parse** - Platform parses response and displays structured content
5. **Advance Stage** - User reviews and advances to next stage

### Type System

All contracts are defined in `src/types/agents.ts`:

```typescript
// Example: BrainstormIdea
interface BrainstormIdea {
  idea_id: string;
  title: string;
  core_tension: string;
  target_audience: string;
  search_intent:
    | "informational"
    | "navigational"
    | "transactional"
    | "commercial";
  primary_keyword: {
    term: string;
    difficulty: string;
    monthly_volume_estimate: string;
  };
  scroll_stopper: string;
  curiosity_gap: string;
  evergreen_score: number;
  risk_flags: string[];
  verdict: "approved" | "pending" | "rejected";
}
```

### Legacy Format Support

The platform includes 30-day backward compatibility:

- `isLegacyIdea()` - Detects old format
- `normalizeLegacyIdea()` - Converts to new format
- `mapBrainstormToResearchInput()` - Stage data mapping
- `mapResearchToProductionInput()` - Stage data mapping

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Unsplash API account (for image search)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd bright-curios-automation-workflow/bright-curios-workflow
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

```bash
# Start PostgreSQL (if not running)
# Create database
createdb bright_curios_workflow

# Run migrations
npx prisma migrate dev
```

### 4. Environment Variables

Create a `.env` file in the project root:

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bright_curios_workflow"

# Unsplash API
UNSPLASH_ACCESS_KEY="your_unsplash_access_key"

# Node Environment
NODE_ENV="development"
```

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for detailed configuration.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📚 Documentation

- **[API Documentation](docs/API.md)** - Complete REST API reference with examples
- **[Database Schema](docs/DATABASE.md)** - Entity relationships and data models
- **[Environment Variables](docs/ENVIRONMENT.md)** - Configuration guide

## 🏗️ Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM 7.3.0
- **Validation**: Zod
- **UI**: shadcn/ui + Tailwind CSS
- **API**: REST with consistent error handling

## 🗂️ Project Structure

```
bright-curios-workflow/
├── src/
│   ├── app/
│   │   ├── api/                    # REST API routes
│   │   │   ├── projects/           # Project CRUD + bulk operations
│   │   │   ├── stages/             # Stage management
│   │   │   ├── research/           # Research library
│   │   │   ├── templates/          # Template system
│   │   │   ├── wordpress/          # WordPress integration
│   │   │   ├── assets/             # Asset & Unsplash
│   │   │   └── ai/                 # AI agent endpoints
│   │   ├── projects/[id]/          # Project detail page
│   │   ├── research/               # Research library UI
│   │   └── settings/               # Settings pages
│   │
│   ├── components/
│   │   ├── brainstorm/             # BrainstormForm.tsx
│   │   ├── research/               # ResearchForm.tsx
│   │   ├── production/             # ProductionForm.tsx
│   │   ├── review/                 # ReviewForm.tsx
│   │   ├── agents/                 # AgentPromptViewer.tsx
│   │   ├── projects/               # StageTracker, ProjectCard
│   │   ├── ideas/                  # IdeaLibraryPicker.tsx
│   │   ├── import/                 # MarkdownImport.tsx
│   │   └── ui/                     # shadcn/ui components
│   │
│   ├── types/
│   │   └── agents.ts               # 🔑 Agent contract types (BC_*)
│   │
│   └── lib/
│       ├── api/                    # API utilities
│       ├── schemas/                # Zod validation schemas
│       └── prisma.ts               # Prisma client singleton
│
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── seed.ts                     # Seed with BC_* format data
│
├── agents/                          # Agent definition files (markdown)
│   ├── agent-1-brainstorm.md
│   ├── agent-2-research.md
│   ├── agent-3-production.md
│   └── agent-4-review.md
│
├── docs/                            # API & DB documentation
└── checklists/                      # Implementation tracking
```

## 🔌 API Overview

### Research Archive

- Create, list, update, delete research entries
- Manage research sources
- Filter and search capabilities

### Projects

- CRUD operations for content projects
- Bulk operations (archive, delete, pause, etc.)
- Winner marking system
- Status and stage filtering

### Stages & Revisions

- Version-controlled stage management
- Unlimited revision history
- Automatic archival on updates

### Templates

- Reusable configuration templates
- Template inheritance support (raw template: `GET /api/templates/:id`; resolved merged config: `GET /api/templates/:id/resolved`)
- Circular reference prevention

### WordPress Integration

- Test connection endpoint
- Direct publishing with status control
- Category and tag fetching

### Assets

- Unsplash image search
- Asset storage and management
- Project-based asset organization

See [API Documentation](docs/API.md) for complete endpoint details.

## 🧪 Testing

API testing can be done with:

- **Postman**: Import API collection
- **Thunder Client**: VS Code extension
- **curl**: Command-line testing
- **Insomnia**: REST client

Example:

```bash
# Create research
curl -X POST http://localhost:3000/api/research \
  -H "Content-Type: application/json" \
  -d '{"theme": "AI Content Creation", "description": "Research on AI tools"}'
```

## 🗺️ Roadmap

### ✅ Step 1: Backend API (Complete)

- [x] Database schema and migrations (Prisma 7)
- [x] REST API with 32+ endpoints
- [x] Zod validation
- [x] Error handling
- [x] API documentation

### ✅ Step 2: Research Library UI (Complete)

- [x] Research management interface
- [x] Source organization
- [x] Search and filtering

### ✅ Step 3: Brainstorm & Research Workflow UI (Complete)

- [x] BrainstormForm with BC_BRAINSTORM contract
- [x] ResearchForm with BC_RESEARCH contract
- [x] Idea library picker integration
- [x] Stage data chaining

### ✅ Step 4: Dashboard & Multi-Project Views (Complete)

- [x] Project dashboard (list/card views, multi-select, bulk operations)
- [x] Focused project view with stage tracker
- [x] Auto-advance toggle
- [x] Autosave (30s debounce)

### ✅ Step 5: Agent Contract Alignment (Complete)

- [x] 4-agent system with BC\_\* YAML contracts
- [x] Type definitions in `src/types/agents.ts`
- [x] ProductionForm with Blog/Video/Shorts/Podcast tabs
- [x] ReviewForm with verdicts, issues, publication plan
- [x] Legacy format backward compatibility
- [x] Prisma seed with BC\_\* format data

### 🔄 Step 6: Publishing & Advanced Features (In Progress)

- [ ] WordPress publishing UI
- [ ] Revision comparison
- [ ] Search functionality
- [ ] Export to multiple formats
- [ ] Kanban board view

## 🔧 Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database commands
npx prisma studio          # Open Prisma Studio (database GUI)
npx prisma migrate dev     # Create and apply migration
npx prisma generate        # Regenerate Prisma client

# Type checking
npm run type-check

# Linting
npm run lint
```

## 🐛 Troubleshooting

### Database Connection Issues

- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL in `.env`
- Ensure database exists

### Prisma Issues

- Regenerate client: `npx prisma generate`
- Check migration status: `npx prisma migrate status`

### API Errors

- Check server logs in terminal
- Verify request body matches schema
- Consult [API Documentation](docs/API.md)

## Learn More

To learn more about Next.js:

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

**Built with ❤️ for content creators**
