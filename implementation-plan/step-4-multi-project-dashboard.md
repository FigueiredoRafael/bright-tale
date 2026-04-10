# Step 4: Multi-Project Dashboard with Template Inheritance and Bulk Operations

## Overview

Build the main projects dashboard with list/card views, multi-select bulk operations, template management with inheritance, and focused single-project workflow views.

## Features

### Projects Dashboard

- **List/Card View Toggle**: Switch between compact list and visual cards
- **Multi-select**: Checkboxes for selecting multiple projects
- **Bulk Operations**: Delete, archive, export, change status for selected projects
- **Filters**: By stage, status, date range, linked research
- **Search**: Full-text search across titles, themes, keywords
- **Sort Options**: By date, stage, status, winner status

### Focused Project View

- **Visual Stage Tracker**: Horizontal progress bar showing current stage
- **Stage Navigation**: Click stages to navigate (with full flexibility)
- **Per-project Settings**: Auto-advance toggle, status dropdown
- **Toast/Modal Alerts**: Notifications when stage transitions occur
- **Auto-save Indicator**: Visual feedback for draft persistence

### Template Management

- **Template Editor**: CRUD interface for creating/editing templates
- **Template Inheritance**: Parent-child relationships with override capability
- **Template Browser**: View all templates with inheritance tree
- **Template Categories**: Filter by theme-based vs goal-based
- **Quick-fill Preview**: See template values before applying

### Form Builders with Auto-save

- **Dynamic Forms**: Generate forms from YAML schemas
- **Enum Dropdowns**: Pre-defined options for verdict, search_intent, etc.
- **Dynamic Arrays**: Add/remove items for shorts, thumbnails, ideas
- **Textareas**: Multi-line inputs for full_draft, research_content
- **Auto-save**: Save every 30s with debouncing for conflict resolution
- **Save Indicator**: "Saving..." → "Saved" visual feedback

## UI Components

### ProjectsDashboard Component

```typescript
// app/projects/page.tsx
export default function ProjectsDashboard() {
  // State: projects list, selected IDs, filters, view mode
  // Display: list/card toggle, search, filters, bulk action toolbar
  // Actions: create project, select/deselect, bulk operations
}
```

### ProjectCard Component

```typescript
// components/projects/ProjectCard.tsx
interface ProjectCardProps {
  project: {
    id: string;
    title: string;
    current_stage: string;
    status: string;
    winner: boolean;
    created_at: Date;
    research?: { title: string };
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
}
```

### FocusedProjectView Component

```typescript
// app/projects/[id]/page.tsx
export default function FocusedProjectView({
  params,
}: {
  params: { id: string };
}) {
  // State: project data, current stage content, auto-advance setting
  // Display: stage tracker, stage-specific form, settings panel
  // Actions: navigate stages, toggle auto-advance, save draft
}
```

### StageTracker Component

```typescript
// components/projects/StageTracker.tsx
interface StageTrackerProps {
  currentStage: string;
  completedStages: string[];
  onNavigate: (stage: string) => void;
}
```

### TemplateManager Component

```typescript
// app/templates/page.tsx
export default function TemplateManager() {
  // State: templates list, selected template, inheritance tree
  // Display: template list, editor form, inheritance visualization
  // Actions: create, edit, delete, extend template
}
```

### TemplateForm Component

```typescript
// components/templates/TemplateForm.tsx
interface TemplateFormProps {
  template?: Template;
  parentTemplate?: Template;
  onSubmit: (data: TemplateData) => void;
}
```

### BulkActionToolbar Component

```typescript
// components/projects/BulkActionToolbar.tsx
interface BulkActionToolbarProps {
  selectedCount: number;
  onDelete: () => void;
  onArchive: () => void;
  onExport: () => void;
  onChangeStatus: (status: string) => void;
}
```

## Workflows

### Multi-select and Bulk Operations

```
1. User navigates to Projects Dashboard
   ↓
2. User checks checkboxes for multiple projects
   ↓
3. Bulk Action Toolbar appears showing selected count
   ↓
4. User selects action: Delete, Archive, Export, Change Status
   ↓
5. Confirmation modal appears
   ↓
6. System executes bulk operation
   ↓
7. Success toast notification
   ↓
8. Dashboard refreshes with updated projects
```

### Template Inheritance

```
1. User creates "Psychology Base" template
   - Sets theme.primary = "psychology"
   - Sets goal = "growth"
   - Sets temporal_mix.evergreen = 70
   ↓
2. User creates "Psychology Viral" template extending "Psychology Base"
   - Inherits theme.primary = "psychology"
   - Overrides goal = "viral"
   - Overrides temporal_mix.trending = 40
   ↓
3. System resolves template by merging parent + child overrides
   ↓
4. User applies "Psychology Viral" to Discovery form
   ↓
5. Form pre-filled with resolved values
```

### Auto-save with Debouncing

```
1. User types in form field
   ↓
2. System starts 30s timer
   ↓
3. User continues typing (timer resets)
   ↓
4. User stops typing for 30s
   ↓
5. System saves to database (last-write-wins)
   ↓
6. "Saved" indicator appears
```

### Stage Auto-advance with Alerts

```
1. User completes Production stage
   ↓
2. System checks project.auto_advance setting
   ↓
3. If true:
   - Save Production output
   - Update current_stage to "review_blog"
   - Show toast: "Moved to Review (Blog) stage"
   - Navigate to Review page
   ↓
4. If false:
   - Save Production output
   - Show toast: "Saved. Staying on Production stage"
   - Remain on Production page
```

## API Integration

### Fetch Projects with Filters

```typescript
// GET /api/projects?status=active&stage=production&search=habit
const response = await fetch(
  "/api/projects?" +
    new URLSearchParams({
      status: statusFilter,
      stage: stageFilter,
      search: searchQuery,
      sort: sortBy,
    }),
);
const { projects } = await response.json();
```

### Bulk Operations

```typescript
// POST /api/projects/bulk
const response = await fetch("/api/projects/bulk", {
  method: "POST",
  body: JSON.stringify({
    operation: "delete", // or 'archive', 'export', 'change_status'
    project_ids: selectedProjectIds,
    ...(operation === "change_status" && { new_status: "archived" }),
  }),
});
```

### Auto-save Stage Content

```typescript
// PUT /api/stages/:projectId/:stageType
const response = await fetch(`/api/stages/${projectId}/${stageType}`, {
  method: "PUT",
  body: JSON.stringify({
    yaml_artifact: currentYamlContent,
    auto_save: true,
  }),
});
```

### Toggle Auto-advance

```typescript
// PUT /api/projects/:id
await fetch(`/api/projects/${projectId}`, {
  method: "PUT",
  body: JSON.stringify({
    auto_advance: !currentAutoAdvanceSetting,
  }),
});
```

### Template CRUD with Inheritance

```typescript
// POST /api/templates (create with optional parent)
const response = await fetch("/api/templates", {
  method: "POST",
  body: JSON.stringify({
    name: templateName,
    type: "theme", // or 'goal'
    config_json: JSON.stringify(templateConfig),
    parent_template_id: parentId || null,
  }),
});

// GET /api/templates/:id/resolved (get with inheritance applied)
const response = await fetch(`/api/templates/${templateId}/resolved`);
const { resolvedTemplate } = await response.json();
```

## Database Queries

### Fetch Projects with Filters and Search

```typescript
// lib/queries/projects.ts
export async function getProjects(filters: {
  status?: string;
  stage?: string;
  search?: string;
  researchId?: string;
  sort?: string;
}) {
  return await prisma.project.findMany({
    where: {
      ...(filters.status && { status: filters.status }),
      ...(filters.stage && { current_stage: filters.stage }),
      ...(filters.researchId && { research_id: filters.researchId }),
      ...(filters.search && {
        OR: [{ title: { contains: filters.search, mode: "insensitive" } }],
      }),
    },
    include: {
      research: {
        select: { id: true, title: true, theme: true },
      },
    },
    orderBy: filters.sort ? { [filters.sort]: "desc" } : { created_at: "desc" },
  });
}
```

### Bulk Delete Projects

```typescript
export async function bulkDeleteProjects(projectIds: string[]) {
  return await prisma.project.deleteMany({
    where: { id: { in: projectIds } },
  });
}
```

### Bulk Archive Projects

```typescript
export async function bulkArchiveProjects(projectIds: string[]) {
  return await prisma.project.updateMany({
    where: { id: { in: projectIds } },
    data: { status: "archived" },
  });
}
```

### Resolve Template Inheritance

```typescript
export async function resolveTemplate(templateId: string): Promise<any> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: { parent: true },
  });

  if (!template) return null;

  const config = JSON.parse(template.config_json);

  if (template.parent) {
    const parentConfig = JSON.parse(template.parent.config_json);
    // Merge parent config with child overrides (deep merge)
    return deepMerge(parentConfig, config);
  }

  return config;
}
```

## UI/UX Design

### Projects Dashboard (List View)

```
┌─────────────────────────────────────────────────────────────┐
│ Projects                                    [+ New Project]  │
├─────────────────────────────────────────────────────────────┤
│ [Search...]  Stage:[All ▾]  Status:[All ▾]  Sort:[Date ▾]  │
│ [Grid] [List]                                                │
├─────────────────────────────────────────────────────────────┤
│ [ ] ✅ How to Build Better Habits                           │
│     Production  •  Active  •  Research: Psychology of Habits│
│     Created: 2 days ago                                     │
├─────────────────────────────────────────────────────────────┤
│ [✓] 🏆 21-Day Habit Challenge                               │
│     Published  •  Completed  •  Winner  •  Research: Psych..│
│     Created: 1 week ago                                     │
├─────────────────────────────────────────────────────────────┤
│ [✓] ⏳ Breaking Bad Habits Guide                            │
│     Review (Blog)  •  Active  •  Research: Psychology of... │
│     Created: 3 days ago                                     │
├─────────────────────────────────────────────────────────────┤
│ Selected: 2 projects                                         │
│ [Delete] [Archive] [Export] [Change Status ▾]               │
└─────────────────────────────────────────────────────────────┘
```

### Focused Project View

```
┌─────────────────────────────────────────────────────────────┐
│ ← Projects    How to Build Better Habits                    │
├─────────────────────────────────────────────────────────────┤
│ Stage Progress:                                              │
│ [✓ Discovery] [✓ Production] [● Review:Blog] [ Review:Video]│
│                                                              │
│ Status: Active  •  Auto-advance: [ON/OFF]  •  Saved 2m ago │
├─────────────────────────────────────────────────────────────┤
│ Review (Blog) Stage                                          │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Stage: [blog ▾]                                       │   │
│ │ Goals:                                                │   │
│ │   Primary: [growth        ]                          │   │
│ │                                                       │   │
│ │ Asset Type: [blog         ]                          │   │
│ │ Content:                                             │   │
│ │ ┌─────────────────────────────────────────────────┐ │   │
│ │ │ (paste blog content here)                       │ │   │
│ │ │                                                 │ │   │
│ │ └─────────────────────────────────────────────────┘ │   │
│ │                                                       │   │
│ │ [Submit for Review] [Save Draft]                     │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Template Manager

```
┌─────────────────────────────────────────────────────────────┐
│ Templates                                   [+ New Template] │
├─────────────────────────────────────────────────────────────┤
│ Type: [All ▾]  [Theme-based] [Goal-based]                   │
├─────────────────────────────────────────────────────────────┤
│ Theme-based Templates                                        │
│ ├─ Psychology Base                                [Edit]     │
│ │  └─ Psychology Viral (extends Psychology Base) [Edit]     │
│ ├─ Productivity                                   [Edit]     │
│ └─ Science                                        [Edit]     │
│                                                               │
│ Goal-based Templates                                         │
│ ├─ Growth Focus                                   [Edit]     │
│ ├─ Viral Content                                  [Edit]     │
│ └─ Monetization                                   [Edit]     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

1. **Build Projects Dashboard**
   - List and card view components
   - Multi-select with checkboxes
   - Search and filter functionality
   - Bulk action toolbar

2. **Implement Focused Project View**
   - Stage tracker component
   - Dynamic form rendering per stage
   - Per-project settings panel
   - Auto-advance toggle

3. **Create Template Management System**
   - Template CRUD API endpoints
   - Template inheritance resolver
   - Template editor UI
   - Quick-fill integration

4. **Build Form Builders**
   - Dynamic form generation from schemas
   - Dropdowns for enums
   - Dynamic arrays with add/remove
   - Textareas for long content

5. **Implement Auto-save**
   - 30s debounced save logic
   - Last-write-wins conflict resolution
   - Visual save indicators
   - Error handling

6. **Add Toast/Modal Notifications**
   - Stage transition alerts
   - Save confirmation toasts
   - Error notifications
   - Success messages

## Success Criteria

- ✅ Projects dashboard displays with list/card views
- ✅ Multi-select and bulk operations working
- ✅ Focused project view shows stage tracker and forms
- ✅ Per-project auto-advance toggle functional
- ✅ Template management with inheritance working
- ✅ Auto-save persists drafts every 30s
- ✅ Toast/modal alerts appear on stage transitions
