# Step 6: Revision Comparison, Search, Export, and Performance Tracking

## Overview

Implement unlimited revision history with side-by-side diff viewer, full-text search across projects/research/ideas, multi-format export capabilities, and performance tracking with winner feedback loop.

## Features

### Revision Comparison

- **Unlimited Storage**: Store all revisions with version numbers and timestamps
- **Side-by-side Diff**: Compare previous vs new draft when revision required
- **Feedback Injection**: Show Review agent's `required_changes` in diff view
- **Version History**: Timeline view of all revisions per stage
- **Rollback Capability**: Restore previous version if needed

### Full-text Search

- **Unified Search**: Search across projects, research, and ideas archives
- **Advanced Filters**: By stage, status, verdict, theme, date range
- **Keyword Highlighting**: Highlight matched terms in results
- **Quick Navigation**: Click result to jump to project/research detail
- **Search History**: Save recent searches for quick access

### Multi-format Export

- **Export Formats**: JSON, YAML, HTML, Markdown
- **Export Scopes**: Single project, multiple projects (bulk), research, ideas
- **Custom Fields**: Select which fields to include in export
- **Bulk Export**: Export all selected projects from dashboard
- **Download Management**: Export JSON per item; ZIP generation deferred for future work

### Performance Tracking

- **Winner Marking**: Flag projects as winners in performance review
- **Research ROI**: Auto-increment research winners_count
- **Winner/Loser Arrays**: Populate for next Discovery cycle input
- **Performance Dashboard**: Visual stats for content performance
- **Insights Panel**: High-performing research patterns

### YAML Validation

- **Schema Enforcement**: Block malformed YAML from being saved
- **Inline Errors**: Show validation errors with line numbers
- **Schema Hints**: Display expected fields and types
- **Required Field Checks**: Prevent submission with missing data

## Components

### RevisionDiffViewer Component

```typescript
// components/revisions/DiffViewer.tsx
interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  requiredChanges: string[];
  stage: string;
}

export default function DiffViewer({
  oldContent,
  newContent,
  requiredChanges,
  stage,
}: DiffViewerProps) {
  // Display side-by-side diff
  // Highlight changes
  // Show required_changes list above diff
  // Rollback button
}
```

### VersionHistory Component

```typescript
// components/revisions/VersionHistory.tsx
interface VersionHistoryProps {
  revisions: Array<{
    version: number;
    created_at: Date;
    change_notes?: string;
  }>;
  onRestore: (version: number) => void;
  onCompare: (v1: number, v2: number) => void;
}
```

### UnifiedSearch Component

```typescript
// components/search/UnifiedSearch.tsx
export default function UnifiedSearch() {
  // Search input with autocomplete
  // Filter panel (stage, status, type)
  // Results list with previews
  // Pagination
}
```

### SearchResults Component

```typescript
// components/search/SearchResults.tsx
interface SearchResult {
  type: "project" | "research" | "idea";
  id: string;
  title: string;
  excerpt: string;
  matchedFields: string[];
  url: string;
}
```

### ExportModal Component

```typescript
// components/export/ExportModal.tsx
interface ExportModalProps {
  projectIds?: string[];
  researchIds?: string[];
  onExport: (config: ExportConfig) => void;
}

interface ExportConfig {
  format: "json" | "yaml" | "html" | "markdown";
  includeFields: string[];
  includeRevisions: boolean;
}
```

### PerformanceReview Component

```typescript
// components/performance/PerformanceReview.tsx
export default function PerformanceReview() {
  // Manual entry form for winners/losers
  // Select projects as winners
  // Display research ROI stats
  // Generate Discovery input with performance data
}
```

### ValidationErrorPanel Component

```typescript
// components/validation/ErrorPanel.tsx
interface ValidationError {
  path: string;
  message: string;
  lineNumber?: number;
}

export default function ValidationErrorPanel({
  errors,
}: {
  errors: ValidationError[];
}) {
  // Display validation errors
  // Clickable to jump to error location
  // Schema hints for fixing
}
```

## API Endpoints

### Revision Endpoints

```typescript
// GET /api/revisions/:projectId/:stageType
// Fetch all revisions for a stage

// POST /api/revisions/:projectId/:stageType
// Create new revision

// GET /api/revisions/:projectId/:stageType/compare?v1=1&v2=2
// Get diff between two versions

// POST /api/revisions/:projectId/:stageType/restore
// Request: { version }
// Restore a previous version
```

### Search Endpoints

```typescript
// GET /api/search?query=habit&type=project,research&status=active
// Response: { results: SearchResult[] }

// GET /api/search/suggestions?query=hab
// Autocomplete suggestions
```

### Export Endpoints

```typescript
// POST /api/export
// Request: { project_ids, format, include_fields, include_revisions }
// Response: { download_url } or file stream

// POST /api/export/bulk
// Request: { project_ids, format }
// Response: { download_url } (JSON files; ZIP deferred)
```

### Performance Endpoints

```typescript
// POST /api/projects/:id/winner
// Mark project as winner (increments research winners_count)

// GET /api/performance/winners
// Get all winner projects

// POST /api/performance/discovery-input
// Generate Discovery input with winners/losers arrays
// Response: { discovery_input_yaml }
```

### Validation Endpoints

```typescript
// POST /api/validate/yaml
// Request: { stage_type, yaml_content }
// Response: { valid: boolean, errors: ValidationError[] }
```

## Database Queries

### Save Revision

```typescript
// lib/queries/revisions.ts
export async function createRevision({
  stageId,
  yamlArtifact,
  changeNotes,
}: {
  stageId: string;
  yamlArtifact: string;
  changeNotes?: string;
}) {
  const currentStage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const nextVersion = currentStage?.revisions[0]?.version + 1 || 1;

  return await prisma.revision.create({
    data: {
      stage_id: stageId,
      yaml_artifact: yamlArtifact,
      version: nextVersion,
      change_notes: changeNotes,
    },
  });
}
```

### Get Revision History

```typescript
export async function getRevisionHistory(stageId: string) {
  return await prisma.revision.findMany({
    where: { stage_id: stageId },
    orderBy: { version: "desc" },
  });
}
```

### Full-text Search

```typescript
export async function searchAll(
  query: string,
  filters: {
    type?: ("project" | "research" | "idea")[];
    status?: string;
    stage?: string;
  },
) {
  const results = [];

  // Search projects
  if (!filters.type || filters.type.includes("project")) {
    const projects = await prisma.project.findMany({
      where: {
        title: { contains: query, mode: "insensitive" },
        ...(filters.status && { status: filters.status }),
        ...(filters.stage && { current_stage: filters.stage }),
      },
      include: { research: true },
    });
    results.push(...projects.map(p => ({ type: "project", ...p })));
  }

  // Search research
  if (!filters.type || filters.type.includes("research")) {
    const research = await prisma.researchArchive.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { research_content: { contains: query, mode: "insensitive" } },
        ],
      },
    });
    results.push(...research.map(r => ({ type: "research", ...r })));
  }

  // Search ideas
  if (!filters.type || filters.type.includes("idea")) {
    const ideas = await prisma.ideaArchive.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { core_tension: { contains: query, mode: "insensitive" } },
        ],
      },
    });
    results.push(...ideas.map(i => ({ type: "idea", ...i })));
  }

  return results;
}
```

### Mark Project as Winner

```typescript
export async function markProjectAsWinner(projectId: string) {
  return await prisma.$transaction(async tx => {
    // Update project
    const project = await tx.project.update({
      where: { id: projectId },
      data: { winner: true },
      include: { research: true },
    });

    // Increment research winners_count if research linked
    if (project.research_id) {
      await tx.researchArchive.update({
        where: { id: project.research_id },
        data: { winners_count: { increment: 1 } },
      });
    }

    return project;
  });
}
```

### Generate Performance Review Data

```typescript
export async function getPerformanceReviewData() {
  const winners = await prisma.project.findMany({
    where: { winner: true },
    select: { id: true, title: true },
  });

  // Losers would be manually marked or based on custom criteria
  const losers = await prisma.project.findMany({
    where: { status: "abandoned" },
    select: { id: true, title: true },
  });

  return {
    winners: winners.map(w => w.title),
    losers: losers.map(l => l.title),
  };
}
```

## Workflows

### Revision with Diff Viewer

```
1. Review stage outputs revision_required
   ↓
2. User clicks "Re-run Production with Feedback"
   ↓
3. System:
   - Saves current Production output as revision
   - Injects required_changes into Production input
   - Calls AI or shows manual form with feedback
   ↓
4. New Production output generated
   ↓
5. System displays Diff Viewer:
   - Left: Previous draft
   - Right: New draft
   - Top: required_changes list
   ↓
6. User reviews changes
   ↓
7. User accepts or requests another revision
   ↓
8. If accepted, save as new version and continue workflow
```

### Search and Navigate

```
1. User types in global search bar
   ↓
2. Autocomplete suggestions appear
   ↓
3. User presses Enter or clicks suggestion
   ↓
4. Search results page displays with filters
   ↓
5. User applies filters (stage, status, type)
   ↓
6. Results update with matched terms highlighted
   ↓
7. User clicks result
   ↓
8. Navigate to project detail or research page
```

### Export Projects

```
1. User selects multiple projects on dashboard
   ↓
2. User clicks "Export" in bulk action toolbar
   ↓
3. Export modal opens with options:
   - Format: JSON, YAML, HTML, Markdown
   - Include fields: checkbox list
   - Include revisions: toggle
   ↓
4. User selects options and clicks "Export"
   ↓
5. System generates files
   ↓
6. If single project: Download file directly
   If multiple projects: Provide JSON per project (ZIP generation deferred)
   ↓
7. Download starts automatically
```

### Performance Review and Discovery Loop

```
1. User navigates to Performance Review page
   ↓
2. System displays all projects with winner status
   ↓
3. User marks projects as winners/losers
   ↓
4. System updates database:
   - Set project.winner = true
   - Increment research.winners_count
   ↓
5. User clicks "Generate Discovery Input"
   ↓
6. System creates Discovery input YAML with:
   - winners: [list of winner titles]
   - losers: [list of loser titles]
   ↓
7. User copies YAML to new Discovery session
   ↓
8. Cycle repeats with performance data informing ideas
```

## UI/UX Design

### Diff Viewer

```
┌─────────────────────────────────────────────────────────────┐
│ Revision Comparison: Production (v1 → v2)                    │
├─────────────────────────────────────────────────────────────┤
│ Required Changes:                                            │
│ • Expand section on habit triggers                           │
│ • Add more concrete examples                                 │
│ • Improve SEO keyword density                                │
├─────────────────────────────────────────────────────────────┤
│ Previous Version (v1)     │  New Version (v2)                │
├───────────────────────────┼──────────────────────────────────┤
│ Habits form through       │  Habits form through             │
│ simple loops...           │  cue-routine-reward loops...     │
│                           │  ← Added detail                  │
│ Research shows...         │  Research shows that triggers... │
│                           │  ← Expanded explanation          │
│                           │  Example: Morning coffee acts... │
│                           │  ← New concrete example          │
├───────────────────────────┴──────────────────────────────────┤
│ [Restore v1] [Accept v2] [Request Another Revision]         │
└─────────────────────────────────────────────────────────────┘
```

### Search Results

```
┌─────────────────────────────────────────────────────────────┐
│ Search: "habit formation"                            [×]     │
├─────────────────────────────────────────────────────────────┤
│ Filters: Type:[All ▾] Status:[All ▾] Stage:[All ▾]         │
├─────────────────────────────────────────────────────────────┤
│ Found 12 results                                             │
│                                                               │
│ 📄 Project: Why Habits Fail (And How to Fix Them)          │
│    Stage: Production  •  Status: Active                     │
│    ...People try to build **habit** **formation** but fail..│
│    [View Project]                                            │
│                                                               │
│ 📚 Research: Psychology of Habits                           │
│    8 projects  •  3 winners                                 │
│    ...Research on **habit** **formation** takes 21-66 days..│
│    [View Research]                                           │
│                                                               │
│ 💡 Idea: The Science of Habit Building                     │
│    Verdict: viable  •  Archived                             │
│    ...Core tension around **habit** **formation** failure...│
│    [View Idea]                                               │
└─────────────────────────────────────────────────────────────┘
```

### Export Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Export Projects (3 selected)                           [×]  │
├─────────────────────────────────────────────────────────────┤
│ Format:                                                      │
│ ○ JSON    ● YAML    ○ HTML    ○ Markdown                   │
│                                                               │
│ Include Fields:                                              │
│ [✓] Title                [✓] Research Data                  │
│ [✓] Stage Content        [ ] Revision History               │
│ [✓] Meta Fields          [✓] Assets                         │
│                                                               │
│ Options:                                                     │
│ [✓] Generate single file per project                        │
│ [ ] Create ZIP archive (deferred)                           │
│                                                               │
│            [Cancel]  [Export (Download JSON)]                │
└─────────────────────────────────────────────────────────────┘
```

### Performance Review Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ Performance Review                                           │
├─────────────────────────────────────────────────────────────┤
│ Mark winners to inform next Discovery cycle                 │
│                                                               │
│ [✓] 21-Day Habit Challenge                 🏆 Winner        │
│     Published  •  Research: Psychology of Habits            │
│                                                               │
│ [ ] How to Build Better Habits                              │
│     Completed  •  Research: Psychology of Habits            │
│                                                               │
│ [✓] Breaking Bad Habits Guide               🏆 Winner        │
│     Published  •  Research: Psychology of Habits            │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ Winners: 2  •  Losers: 0                                    │
│ [Generate Discovery Input with Performance Data]            │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

1. **Build Revision System**
   - Create revision storage on each stage save
   - Implement version numbering
   - Build revision history timeline component
   - Add rollback functionality

2. **Create Diff Viewer**
   - Implement side-by-side diff algorithm
   - Highlight added/removed/changed content
   - Display required_changes above diff
   - Add accept/restore buttons

3. **Implement Search System**
   - Build unified search across tables
   - Add full-text search with PostgreSQL
   - Create search results page with filters
   - Implement keyword highlighting

4. **Build Export Functionality**
   - Create export modal with format selection
   - Implement JSON/YAML/HTML/Markdown generators
   - Add field selection checkboxes
   - Build bulk export (JSON per project); ZIP generator deferred for later iteration

5. **Add Performance Tracking**
   - Create winner marking interface
   - Implement auto-increment for research winners_count
   - Build performance review dashboard
   - Generate Discovery input with winners/losers

6. **Implement YAML Validation**
   - Add Zod validation on form submit
   - Display inline error messages
   - Show schema hints for required fields
   - Block submission if validation fails

## Success Criteria

- ✅ Revisions stored with version numbers and timestamps
- ✅ Diff viewer compares old vs new drafts
- ✅ Rollback restores previous version
- ✅ Search works across projects, research, and ideas
- ✅ Filters and keyword highlighting functional
- ✅ Export generates correct formats (JSON/YAML/HTML/MD)
- ✅ Bulk export creates downloadable JSON per project (ZIP support deferred)
- ✅ Winner marking increments research winners_count
- ✅ Performance review generates Discovery input YAML
- ✅ YAML validation blocks malformed data
