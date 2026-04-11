# Step 1: Next.js 14+ with PostgreSQL and REST API Architecture

## Overview

Set up the foundational Next.js application with PostgreSQL database, Prisma ORM, and REST API endpoints for all core functionality.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Zod
- **UI Library**: shadcn/ui (with Tailwind CSS)
- **Icons**: Lucide React

## Database Schema

### Core Tables

#### `research_archive`

```prisma
model ResearchArchive {
  id              String   @id @default(cuid())
  title           String
  theme           String
  research_content String  @db.Text
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  projects_count  Int      @default(0)
  winners_count   Int      @default(0)

  sources         ResearchSource[]
  projects        Project[]
}
```

#### `research_sources`

```prisma
model ResearchSource {
  id          String   @id @default(cuid())
  research_id String
  url         String
  title       String
  author      String?
  date        DateTime?
  created_at  DateTime @default(now())

  research    ResearchArchive @relation(fields: [research_id], references: [id], onDelete: Cascade)

  @@index([research_id])
}
```

#### `projects`

```prisma
model Project {
  id            String   @id @default(cuid())
  title         String
  research_id   String?
  current_stage String   // enum: discovery, production, review_blog, review_video, review_publication, assets, wordpress
  auto_advance  Boolean  @default(true)
  status        String   // enum: active, completed, archived, abandoned
  winner        Boolean  @default(false)
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  research      ResearchArchive? @relation(fields: [research_id], references: [id])
  stages        Stage[]

  @@index([research_id])
  @@index([status])
  @@index([current_stage])
}
```

#### `stages`

```prisma
model Stage {
  id            String   @id @default(cuid())
  project_id    String
  stage_type    String   // discovery, production, review_blog, review_video, review_publication, assets
  yaml_artifact String   @db.Text
  version       Int      @default(1)
  created_at    DateTime @default(now())

  project       Project  @relation(fields: [project_id], references: [id], onDelete: Cascade)
  revisions     Revision[]

  @@index([project_id, stage_type])
}
```

#### `revisions`

```prisma
model Revision {
  id            String   @id @default(cuid())
  stage_id      String
  yaml_artifact String   @db.Text
  version       Int
  created_at    DateTime @default(now())
  created_by    String?
  change_notes  String?  @db.Text

  stage         Stage    @relation(fields: [stage_id], references: [id], onDelete: Cascade)

  @@index([stage_id])
}
```

#### `ideas_archive`

```prisma
model IdeaArchive {
  id              String   @id @default(cuid())
  idea_id         String   @unique
  title           String
  core_tension    String   @db.Text
  target_audience String
  verdict         String   // weak, rejected, experimental
  discovery_data  String   @db.Text // Full YAML from discovery
  created_at      DateTime @default(now())

  @@index([verdict])
}
```

#### `templates`

```prisma
model Template {
  id                String   @id @default(cuid())
  name              String
  type              String   // enum: theme, goal
  config_json       String   @db.Text
  parent_template_id String?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  parent            Template?  @relation("TemplateInheritance", fields: [parent_template_id], references: [id])
  children          Template[] @relation("TemplateInheritance")

  @@index([type])
}
```

#### `wordpress_config`

```prisma
model WordPressConfig {
  id              String   @id @default(cuid())
  site_url        String
  username        String
  password        String   // Encrypted
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
}
```

#### `assets`

```prisma
model Asset {
  id              String   @id @default(cuid())
  project_id      String
  asset_type      String   // featured_image, content_image, thumbnail
  source          String   // unsplash, upload
  source_url      String
  alt_text        String?
  wordpress_id    Int?
  wordpress_url   String?
  created_at      DateTime @default(now())

  @@index([project_id])
}
```

## REST API Endpoints

### Research Endpoints

- `POST /api/research` - Create new research
- `GET /api/research` - List all research (with filters/search)
- `GET /api/research/:id` - Get research details with sources and linked projects
- `PUT /api/research/:id` - Update research
- `DELETE /api/research/:id` - Delete research
- `POST /api/research/:id/sources` - Add source to research
- `DELETE /api/research/:id/sources/:sourceId` - Remove source

### Project Endpoints

- `POST /api/projects` - Create new project
- `GET /api/projects` - List all projects (with filters/search)
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/bulk` - Bulk operations (delete, archive, export)
- `PUT /api/projects/:id/winner` - Mark project as winner

### Stage Endpoints

- `POST /api/stages` - Create/update stage for project
- `GET /api/stages/:projectId` - Get all stages for project
- `GET /api/stages/:projectId/:stageType` - Get specific stage
- `POST /api/stages/:projectId/:stageType/revisions` - Create revision

### Template Endpoints

- `POST /api/templates` - Create template
- `GET /api/templates` - List all templates
- `GET /api/templates/:id` - Get raw template (use `GET /api/templates/:id/resolved` for merged resolved config)
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

### WordPress Endpoints

- `POST /api/wordpress/test` - Test WordPress connection
- `POST /api/wordpress/publish` - Publish project to WordPress
- `GET /api/wordpress/categories` - Fetch WordPress categories
- `GET /api/wordpress/tags` - Fetch WordPress tags

### Asset Endpoints

- `GET /api/assets/unsplash/search` - Search Unsplash images
- `POST /api/assets` - Save selected asset to project
- `GET /api/assets/:projectId` - Get all assets for project
- `DELETE /api/assets/:id` - Remove asset

## Zod Schemas

Create validation schemas matching YAML contracts from agent documentation:

### Discovery Schema

```typescript
import { z } from "zod";

export const discoveryInputSchema = z.object({
  performance_review: z.object({
    winners: z.array(z.string()),
    losers: z.array(z.string()),
  }),
  theme: z.object({
    primary: z.string(),
    subthemes: z.array(z.string()),
  }),
  goal: z.string(),
  temporal_mix: z.object({
    evergreen: z.number(),
    seasonal: z.number(),
    trending: z.number(),
  }),
  constraints: z.object({
    avoid: z.array(z.string()),
    formats: z.array(z.string()),
  }),
  output: z.object({
    ideas_requested: z.number(),
  }),
});

export const discoveryOutputSchema = z.object({
  ideas: z.array(
    z.object({
      idea_id: z.string(),
      title: z.string(),
      core_tension: z.string(),
      target_audience: z.string(),
      search_intent: z.enum([
        "informational",
        "investigational",
        "commercial",
        "mixed",
      ]),
      primary_keyword: z.object({
        keyword: z.string(),
        difficulty: z.enum(["low", "medium", "high"]),
        basis: z.string(),
      }),
      mrbeast_hook: z.string(),
      monetization: z.object({
        affiliate_angle: z.string(),
      }),
      why_it_wins: z.string(),
      repurpose_map: z.object({
        blog: z.string(),
        video: z.string(),
        shorts: z.array(z.string()),
        podcast: z.string(),
      }),
      risk_flags: z.array(z.string()),
      verdict: z.enum(["viable", "weak", "experimental"]),
    }),
  ),
  pick_recommendation: z.object({
    best_choice: z.string(),
    why: z.string(),
  }),
});
```

### Production Schema

```typescript
export const productionInputSchema = z.object({
  selected_idea: z.object({
    idea_id: z.string(),
    title: z.string(),
    core_tension: z.string(),
    target_audience: z.string(),
    primary_keyword: z.string(),
    mrbeast_hook: z.string(),
    monetization: z.object({
      affiliate_angle: z.string(),
    }),
  }),
  production_settings: z.object({
    goal: z.string(),
    tone: z.string(),
    blog_words: z.string(),
    video_minutes: z.string(),
    affiliate_policy: z.object({
      include: z.boolean(),
      placement: z.string(),
    }),
  }),
});

export const productionOutputSchema = z.object({
  blog: z.object({
    title: z.string(),
    slug: z.string(),
    meta_description: z.string(),
    primary_keyword: z.string(),
    outline: z.array(
      z.object({
        h2: z.string(),
        bullets: z.array(z.string()),
      }),
    ),
    full_draft: z.string(),
    affiliate_insert: z.object({
      location: z.string(),
      copy: z.string(),
      rationale: z.string(),
    }),
  }),
  video: z.object({
    title_options: z.array(z.string()).length(3),
    thumbnail_best_bet: z.object({
      visual: z.string(),
      overlay_text: z.string(),
    }),
    script: z.object({
      hook_0_10s: z.string(),
      context_0_10_0_45: z.string(),
      teaser_0_45_1_00: z.string(),
      chapters: z.array(
        z.object({
          time_range: z.string(),
          chapter_title: z.string(),
          content: z.string(),
          b_roll: z.array(z.string()),
        }),
      ),
      affiliate_60_percent: z.object({
        time_range: z.string(),
        content: z.string(),
        b_roll: z.array(z.string()),
      }),
      ending_takeaway: z.string(),
      cta: z.string(),
    }),
  }),
  shorts: z
    .array(
      z.object({
        title: z.string(),
        script: z.string(),
        shots: z.array(z.string()),
      }),
    )
    .length(3),
  engagement: z.object({
    pinned_comments: z.array(z.string()).length(3),
  }),
  visuals: z.object({
    thumbnails: z
      .array(
        z.object({
          visual: z.string(),
          overlay_text: z.string(),
          background_style: z.string(),
          why_it_works: z.string(),
        }),
      )
      .length(3),
  }),
});
```

### Review Schema

```typescript
export const reviewInputSchema = z.object({
  stage: z.enum(["blog", "video", "publication"]),
  goals: z.object({
    primary: z.string(),
  }),
  asset: z.object({
    type: z.string(),
    content: z.string(),
  }),
});

export const reviewOutputBlogVideoSchema = z.object({
  stage: z.enum(["blog", "video"]),
  verdict: z.enum(["approved", "revision_required", "rejected"]),
  issues: z.object({
    critical: z.array(z.string()),
    minor: z.array(z.string()),
  }),
  required_changes: z.array(z.string()),
  gate: z.object({
    approved_for_next_stage: z.boolean(),
  }),
});

export const reviewOutputPublicationSchema = z.object({
  stage: z.literal("publication"),
  publish_plan: z.object({
    blog: z.object({
      date: z.string(),
      seo: z.object({
        title_variant: z.string(),
        meta_description: z.string(),
        internal_links: z.array(z.string()),
      }),
    }),
    youtube: z.object({
      date: z.string(),
      title_final: z.string(),
      description_outline: z.array(z.string()),
      tags: z.array(z.string()),
      pinned_comment_choice: z.string(),
    }),
    shorts: z.object({
      schedule: z
        .array(
          z.object({
            date: z.string(),
            short_number: z.number(),
          }),
        )
        .length(3),
    }),
  }),
  packaging_tests: z.array(z.string()),
  ready_to_publish: z.boolean(),
});
```

## Implementation Tasks

1. **Initialize Next.js Project**

   ```bash
   npx create-next-app@latest bright-curios-workflow --typescript --tailwind --app
   cd bright-curios-workflow
   ```

2. **Install Dependencies**

   ```bash
   npm install prisma @prisma/client zod
   npm install -D @types/node
   ```

3. **Setup shadcn/ui**

   ```bash
   npx shadcn-ui@latest init
   ```

   Configuration options:
   - Style: Default
   - Base color: Slate
   - CSS variables: Yes

4. **Install shadcn/ui Components**

   Install all free components needed for the project:

   ```bash
   # Form & Input Components
   npx shadcn-ui@latest add button
   npx shadcn-ui@latest add input
   npx shadcn-ui@latest add textarea
   npx shadcn-ui@latest add label
   npx shadcn-ui@latest add select
   npx shadcn-ui@latest add checkbox
   npx shadcn-ui@latest add radio-group
   npx shadcn-ui@latest add switch
   npx shadcn-ui@latest add form

   # Layout & Navigation
   npx shadcn-ui@latest add card
   npx shadcn-ui@latest add tabs
   npx shadcn-ui@latest add separator
   npx shadcn-ui@latest add scroll-area

   # Feedback & Overlays
   npx shadcn-ui@latest add dialog
   npx shadcn-ui@latest add alert-dialog
   npx shadcn-ui@latest add toast
   npx shadcn-ui@latest add alert
   npx shadcn-ui@latest add badge
   npx shadcn-ui@latest add progress

   # Data Display
   npx shadcn-ui@latest add table
   npx shadcn-ui@latest add dropdown-menu
   npx shadcn-ui@latest add popover
   npx shadcn-ui@latest add tooltip
   npx shadcn-ui@latest add avatar

   # Navigation
   npx shadcn-ui@latest add breadcrumb
   npx shadcn-ui@latest add pagination
   npx shadcn-ui@latest add command
   ```

5. **Initialize Prisma**

   ```bash
   npx prisma init
   ```

6. **Create Database Schema**
   - Define all models in `prisma/schema.prisma`
   - Run migrations: `npx prisma migrate dev --name init`

7. **Create Zod Schemas**
   - Create `/lib/schemas/` directory
   - Implement all validation schemas

8. **Create API Routes**
   - Implement all REST endpoints in `/app/api/` directory
   - Add error handling and validation middleware

9. **Test Endpoints**
   - Use Postman/Insomnia to verify all CRUD operations
   - Validate schema enforcement

## UI Component Mapping (shadcn/ui)

### Components Used Throughout Application

#### Forms & Inputs

- **Button**: Primary actions, form submissions, navigation
- **Input**: Text fields for titles, keywords, URLs
- **Textarea**: Long-form content (research, blog drafts)
- **Label**: Form field labels
- **Select**: Dropdowns for enums (stage, status, verdict)
- **Checkbox**: Multi-select (bulk operations, idea selection)
- **Radio Group**: Single choice options
- **Switch**: Toggle settings (auto-advance on/off)
- **Form**: Form validation and submission with react-hook-form

#### Layout & Organization

- **Card**: Project cards, research cards, idea cards
- **Tabs**: Stage navigation, template types, entry points
- **Separator**: Visual dividers between sections
- **Scroll Area**: Long lists (projects, revisions, search results)

#### Feedback & Interactions

- **Dialog**: Create/edit modals (project creation, template editor)
- **Alert Dialog**: Confirmations (delete, archive, bulk operations)
- **Toast**: Success/error notifications, save confirmations
- **Alert**: Warnings, validation errors, important messages
- **Badge**: Status indicators (active, completed, winner)
- **Progress**: Stage tracker visualization

#### Data Display

- **Table**: Research sources, revision history, linked projects
- **Dropdown Menu**: Bulk actions, more options menus
- **Popover**: Quick info, filter panels
- **Tooltip**: Help text, icon explanations
- **Avatar**: User identification (if multi-user in future)

#### Navigation

- **Breadcrumb**: Page hierarchy (Projects > Project Detail > Stage)
- **Pagination**: Long lists (projects, search results)
- **Command**: Quick search/command palette (Ctrl+K)

### Page-Specific Component Usage

#### Projects Dashboard

- Card (project cards)
- Checkbox (multi-select)
- Button (bulk actions, create project)
- Badge (status, stage indicators)
- Input (search)
- Select (filters)
- Dropdown Menu (bulk action menu)
- Alert Dialog (delete confirmation)

#### Research Library

- Card (research cards)
- Table (sources list)
- Dialog (create/edit research)
- Button (create, add source)
- Badge (performance stats)
- Scroll Area (long research content)

#### Focused Project View

- Tabs (stage navigation)
- Progress (stage tracker)
- Form (stage input forms)
- Switch (auto-advance toggle)
- Textarea (content editing)
- Select (enum dropdowns)
- Toast (save notifications)
- Alert (validation errors)

#### Discovery Stage

- Form (discovery input)
- Input (text fields)
- Select (dropdowns)
- Checkbox (idea selection)
- Card (idea cards)
- Dialog (project creation modal)
- Badge (verdict indicators)

#### Template Manager

- Table (template list)
- Dialog (template editor)
- Form (template configuration)
- Tabs (theme-based vs goal-based)
- Badge (inheritance indicators)

## Success Criteria

- ✅ Database successfully created with all tables
- ✅ All API endpoints responding correctly
- ✅ Zod validation working for all YAML schemas
- ✅ Prisma queries functioning for CRUD operations
- ✅ shadcn/ui components installed and configured
- ✅ Tailwind CSS properly configured with shadcn theme
- ✅ No TypeScript errors
