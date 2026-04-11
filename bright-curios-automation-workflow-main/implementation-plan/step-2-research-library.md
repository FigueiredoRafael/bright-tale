# Step 2: Research Library with Source Management and Project Tracking

## Overview

Build the Research Library interface for managing research content, structured sources, and tracking which projects derive from each research piece.

## Features

### Research Library View

- **List View**: Display all research entries with key metadata
- **Search & Filter**: Full-text search by title/theme, filter by date/performance
- **Sort Options**: By date (newest/oldest), projects_count, winners_count
- **Performance Indicators**: Visual badges showing "Used in X projects" and "Y winners"

### Research Detail View

- **Content Display**: Full research content with rich text formatting
- **Sources Table**: Structured list of all sources with CRUD operations
- **Linked Projects**: List of all projects derived from this research
- **Metadata**: Creation date, last updated, performance stats

### Source Management

- **Add Source Form**: URL, title, author, date inputs with validation
- **Edit Source**: Inline editing for existing sources
- **Delete Source**: Remove source with confirmation
- **Validation**: URL format checking, required field enforcement

### Project Creation from Research

- **Create Project Button**: Spawn new project starting at Production stage
- **Research Auto-link**: Automatically link research_id to new project
- **Pre-fill Data**: Carry over theme and relevant metadata

### Winner Tracking

- **Auto-increment**: When project marked as winner, increment research winners_count
- **ROI Analysis**: Visual indicators for high-performing research patterns

## UI Components

### ResearchLibraryPage

```typescript
// app/research/page.tsx
export default function ResearchLibraryPage() {
  // State: research list, filters, search query, sort order
  // Display: grid/list toggle, search bar, filter dropdowns, sort selector
  // Actions: create new research, view details, delete research
}
```

### ResearchDetailPage

```typescript
// app/research/[id]/page.tsx
export default function ResearchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Fetch: research with sources and linked projects
  // Display: research content, sources table, projects list, stats
  // Actions: edit research, add/edit/delete sources, create project
}
```

### SourceForm Component

```typescript
// components/research/SourceForm.tsx
interface SourceFormProps {
  researchId: string;
  source?: ResearchSource; // For editing
  onSubmit: () => void;
}
```

### LinkedProjectsList Component

```typescript
// components/research/LinkedProjectsList.tsx
interface LinkedProjectsListProps {
  projects: {
    id: string;
    title: string;
    status: string;
    current_stage: string;
    winner: boolean;
  }[];
}
```

## API Integration

### Research List

```typescript
// GET /api/research?search=&theme=&sort=winners_count
const response = await fetch(
  "/api/research?" +
    new URLSearchParams({
      search: searchQuery,
      theme: selectedTheme,
      sort: sortBy,
    }),
);
const { research } = await response.json();
```

### Research Detail

```typescript
// GET /api/research/:id (includes sources and linked projects)
const response = await fetch(`/api/research/${researchId}`);
const { research, sources, projects } = await response.json();
```

### Create Source

```typescript
// POST /api/research/:id/sources
const response = await fetch(`/api/research/${researchId}/sources`, {
  method: "POST",
  body: JSON.stringify({
    url: sourceUrl,
    title: sourceTitle,
    author: sourceAuthor,
    date: sourceDate,
  }),
});
```

### Delete Source

```typescript
// DELETE /api/research/:id/sources/:sourceId
await fetch(`/api/research/${researchId}/sources/${sourceId}`, {
  method: "DELETE",
});
```

### Create Project from Research

```typescript
// POST /api/projects
const response = await fetch("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    title: projectTitle,
    research_id: researchId,
    current_stage: "production", // Skip discovery
    status: "active",
  }),
});
```

## Database Queries

### Fetch Research with Performance Stats

```typescript
// lib/queries/research.ts
export async function getResearchList(filters: {
  search?: string;
  theme?: string;
  sort?: "date" | "projects_count" | "winners_count";
}) {
  return await prisma.researchArchive.findMany({
    where: {
      ...(filters.search && {
        OR: [
          { title: { contains: filters.search, mode: "insensitive" } },
          {
            research_content: { contains: filters.search, mode: "insensitive" },
          },
        ],
      }),
      ...(filters.theme && { theme: filters.theme }),
    },
    orderBy: filters.sort ? { [filters.sort]: "desc" } : { created_at: "desc" },
    include: {
      _count: {
        select: { projects: true, sources: true },
      },
    },
  });
}
```

### Fetch Research with Sources and Projects

```typescript
export async function getResearchDetail(id: string) {
  return await prisma.researchArchive.findUnique({
    where: { id },
    include: {
      sources: {
        orderBy: { created_at: "desc" },
      },
      projects: {
        select: {
          id: true,
          title: true,
          status: true,
          current_stage: true,
          winner: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      },
    },
  });
}
```

### Increment Winners Count

```typescript
export async function incrementResearchWinners(researchId: string) {
  return await prisma.researchArchive.update({
    where: { id: researchId },
    data: {
      winners_count: { increment: 1 },
    },
  });
}
```

## UI/UX Design

### Research Library Grid/List View

```
┌─────────────────────────────────────────────────────────────┐
│ Research Library                              [+ New Research]│
├─────────────────────────────────────────────────────────────┤
│ [Search...]  [Theme: All ▾]  [Sort: Winners ▾]  [Grid/List] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│ │ Psychology of   │  │ Productivity    │  │ Science of      ││
│ │ Habits          │  │ Systems         │  │ Sleep           ││
│ │                 │  │                 │  │                 ││
│ │ 🏆 3 winners    │  │ 🏆 5 winners    │  │ 🏆 1 winner     ││
│ │ 📊 8 projects   │  │ 📊 12 projects  │  │ 📊 3 projects   ││
│ │                 │  │                 │  │                 ││
│ │ Updated: 2 days │  │ Updated: 1 week │  │ Updated: 3 days ││
│ │ [View Details]  │  │ [View Details]  │  │ [View Details]  ││
│ └─────────────────┘  └─────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Research Detail View

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Library    Psychology of Habits                    │
├─────────────────────────────────────────────────────────────┤
│ Theme: Psychology                        [Edit] [Delete]     │
│ Created: Jan 15, 2026  •  Updated: Jan 28, 2026              │
│ 🏆 3 Winners  •  📊 8 Projects                               │
│                                                               │
│ [Create Project from This Research]                          │
├─────────────────────────────────────────────────────────────┤
│ Research Content                                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Habits form through cue-routine-reward loops...       │   │
│ │ Research shows that habit formation takes 21-66 days  │   │
│ │ depending on complexity...                            │   │
│ └───────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ Sources                                      [+ Add Source]  │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Title: The Power of Habit                             │   │
│ │ Author: Charles Duhigg                                │   │
│ │ URL: example.com/habits-research                      │   │
│ │ Date: 2024-05-10                      [Edit] [Delete] │   │
│ ├───────────────────────────────────────────────────────┤   │
│ │ Title: Atomic Habits                                  │   │
│ │ Author: James Clear                                   │   │
│ │ URL: jamesclear.com/atomic-habits                     │   │
│ │ Date: 2024-06-15                      [Edit] [Delete] │   │
│ └───────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ Linked Projects (8)                                          │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ ✅ How to Build Better Habits             Production  │   │
│ │ 🏆 21-Day Habit Challenge                 Published   │   │
│ │ ⏳ Breaking Bad Habits Guide               Review     │   │
│ │ ... (view all)                                        │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

1. **Create Research Library Page**
   - Implement search/filter/sort functionality
   - Add grid/list view toggle
   - Display performance badges

2. **Create Research Detail Page**
   - Fetch and display research with sources and projects
   - Implement source CRUD operations
   - Add "Create Project" button

3. **Build Source Form Component**
   - URL validation with regex
   - Required field enforcement
   - Date picker for source date

4. **Implement Linked Projects List**
   - Clickable project links to navigate to project view
   - Status and stage indicators
   - Winner badges

5. **Add Winner Tracking Logic**
   - Update research winners_count when project marked as winner
   - Create visual indicators for high-ROI research

6. **Implement Create Project from Research**
   - Modal or page for project creation
   - Auto-link research_id
   - Start at Production stage

## Success Criteria

- ✅ Research library displays all research with search/filter/sort
- ✅ Research detail page shows content, sources, and linked projects
- ✅ Source CRUD operations working correctly
- ✅ Projects can be created from research starting at Production
- ✅ Winner tracking increments research winners_count
- ✅ Performance stats display correctly
