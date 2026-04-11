# Step 3: Discovery Stage with Bulk Project Creation Workflow

## Overview

Build the Discovery stage interface that generates research findings + multiple ideas, with bulk project creation capabilities and flexible stage navigation.

## Features

### Discovery Stage Interface

- **Input Form**: Template-driven form matching BC_DISCOVERY_INPUT schema
- **Template Quick-fill**: One-click application of theme/goal-based templates
- **Manual Mode**: Form fields for manual input when AI disabled
- **AI Generation**: Integration with AI provider when enabled
- **YAML Editor**: Alternative raw YAML editing mode with syntax highlighting

### Idea Selection Grid

- **Multi-select Interface**: Checkboxes for selecting multiple ideas
- **Idea Cards**: Display title, core_tension, verdict, primary_keyword
- **Filter by Verdict**: Show only viable/weak/experimental ideas
- **Bulk Actions**: Create projects, archive ideas, save research

### Research Library Integration

- **Save Research**: Extract research from Discovery output and save to library
- **Link to Projects**: Automatically associate research with spawned projects
- **Source Extraction**: Parse sources from Discovery for structured storage

### Project Creation Modal

- **Three Entry Points**:
  1. Start Discovery (blank form)
  2. Use Existing Research (browse library → Production)
  3. Quick Entry (manual idea → Production)
- **Validation**: Ensure required fields present before creation

### Flexible Stage Navigation

- **No Restrictions**: Allow forward/backward movement between any stages
- **Skip Stages**: Jump directly to Production or Review without Discovery
- **Re-run Stages**: Return to previous stage and regenerate content

## UI Components

### DiscoveryPage Component

```typescript
// app/projects/[id]/discovery/page.tsx
export default function DiscoveryPage({ params }: { params: { id: string } }) {
  // State: discovery input, template selection, AI enabled/disabled
  // Display: form builder or YAML editor, template selector, generate button
  // Actions: generate ideas, save draft, auto-advance to idea selection
}
```

### IdeaSelectionGrid Component

```typescript
// components/discovery/IdeaSelectionGrid.tsx
interface IdeaSelectionGridProps {
  ideas: Idea[];
  research: string;
  onCreateProjects: (selectedIds: string[]) => void;
  onSaveResearch: () => void;
  onArchiveIdeas: (ideaIds: string[]) => void;
}
```

### ProjectCreationModal Component

```typescript
// components/projects/ProjectCreationModal.tsx
export default function ProjectCreationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  // Tabs: Start Discovery, Use Research, Quick Entry
  // Forms for each entry point
  // Validation and submission
}
```

### DiscoveryFormBuilder Component

```typescript
// components/discovery/DiscoveryFormBuilder.tsx
interface DiscoveryFormBuilderProps {
  initialData?: Partial<DiscoveryInput>;
  onSubmit: (data: DiscoveryInput) => void;
  templates: Template[];
}
```

## Workflow

### Discovery to Bulk Project Creation

```
1. User fills Discovery form (manual or AI-generated)
   ↓
2. System generates BC_DISCOVERY_OUTPUT with N ideas + research
   ↓
3. Idea Selection Grid displays with checkboxes
   ↓
4. User selects ideas (1 or more)
   ↓
5. User clicks "Create X Projects"
   ↓
6. System:
   - Saves research to library
   - Creates N separate projects (one per selected idea)
   - Links each project to same research_id
   - Sets current_stage = "production"
   - Populates Production input from selected idea
   ↓
7. User can navigate to any project to continue Production stage
```

### Alternative: Save Research for Later

```
1. Discovery generates ideas + research
   ↓
2. User clicks "Save Research to Library"
   ↓
3. Research saved without creating projects
   ↓
4. Weak ideas archived to ideas_archive table
   ↓
5. User can later browse Research Library and create projects
```

## API Integration

### Generate Discovery Output (AI Mode)

```typescript
// POST /api/ai/discovery
const response = await fetch("/api/ai/discovery", {
  method: "POST",
  body: JSON.stringify({
    discovery_input: discoveryFormData,
    project_id: projectId,
  }),
});
const { discovery_output } = await response.json();
```

### Save Discovery Output (Manual Mode)

```typescript
// POST /api/stages
const response = await fetch("/api/stages", {
  method: "POST",
  body: JSON.stringify({
    project_id: projectId,
    stage_type: "discovery",
    yaml_artifact: discoveryYaml,
  }),
});
```

### Bulk Create Projects

```typescript
// POST /api/projects/bulk-create
const response = await fetch("/api/projects/bulk-create", {
  method: "POST",
  body: JSON.stringify({
    research: {
      title: researchTitle,
      theme: researchTheme,
      research_content: researchContent,
      sources: extractedSources,
    },
    selected_ideas: selectedIdeas.map(idea => ({
      idea_id: idea.idea_id,
      title: idea.title,
      core_tension: idea.core_tension,
      target_audience: idea.target_audience,
      primary_keyword: idea.primary_keyword.keyword,
      mrbeast_hook: idea.mrbeast_hook,
      monetization: idea.monetization,
    })),
  }),
});
const { research_id, project_ids } = await response.json();
```

### Archive Weak Ideas

```typescript
// POST /api/ideas/archive
await fetch("/api/ideas/archive", {
  method: "POST",
  body: JSON.stringify({
    ideas: weakIdeas.map(idea => ({
      idea_id: idea.idea_id,
      title: idea.title,
      core_tension: idea.core_tension,
      target_audience: idea.target_audience,
      verdict: idea.verdict,
      discovery_data: JSON.stringify(idea),
    })),
  }),
});
```

## Database Queries

### Save Research and Create Projects

```typescript
// lib/queries/discovery.ts
export async function createProjectsFromDiscovery({
  research,
  ideas,
}: {
  research: {
    title: string;
    theme: string;
    research_content: string;
    sources: Array<{
      url: string;
      title: string;
      author?: string;
      date?: string;
    }>;
  };
  ideas: SelectedIdea[];
}) {
  // Transaction to ensure atomicity
  return await prisma.$transaction(async tx => {
    // 1. Create research archive
    const savedResearch = await tx.researchArchive.create({
      data: {
        title: research.title,
        theme: research.theme,
        research_content: research.research_content,
        projects_count: ideas.length,
        sources: {
          create: research.sources,
        },
      },
    });

    // 2. Create projects
    const projects = await Promise.all(
      ideas.map(idea =>
        tx.project.create({
          data: {
            title: idea.title,
            research_id: savedResearch.id,
            current_stage: "production",
            status: "active",
            stages: {
              create: {
                stage_type: "production",
                yaml_artifact: JSON.stringify({
                  selected_idea: idea,
                  production_settings: {
                    goal: "growth",
                    tone: "curious",
                    blog_words: "1400-2200",
                    video_minutes: "8-10",
                    affiliate_policy: {
                      include: true,
                      placement: "around 60% mark",
                    },
                  },
                }),
                version: 1,
              },
            },
          },
        }),
      ),
    );

    return { research: savedResearch, projects };
  });
}
```

## UI/UX Design

### Discovery Form with Template Selector

```
┌─────────────────────────────────────────────────────────────┐
│ Project: Future of AI in Healthcare      Stage: Discovery    │
├─────────────────────────────────────────────────────────────┤
│ Templates: [Psychology] [Productivity] [Science] [Growth]    │
│           [Viral] [Monetization] [Custom]                    │
├─────────────────────────────────────────────────────────────┤
│ Performance Review                                           │
│ Winners: [+ Add]  []                                         │
│ Losers:  [+ Add]  []                                         │
│                                                              │
│ Theme                                                        │
│ Primary: [psychology        ▾]                              │
│ Subthemes: [habits] [behavior] [+ Add]                      │
│                                                              │
│ Goal: [growth      ▾]                                       │
│                                                              │
│ Temporal Mix                                                 │
│ Evergreen: [70] %  Seasonal: [20] %  Trending: [10] %      │
│                                                              │
│ Ideas Requested: [5]                                        │
│                                                              │
│ [Generate Ideas (AI)] [Save Draft] [Manual YAML Editor]    │
└─────────────────────────────────────────────────────────────┘
```

### Idea Selection Grid

```
┌─────────────────────────────────────────────────────────────┐
│ Select Ideas to Create Projects                              │
├─────────────────────────────────────────────────────────────┤
│ [✓] All  [ ] Viable  [ ] Weak  [ ] Experimental             │
│                                                               │
│ [✓] BC-IDEA-001                                              │
│     Why Habits Fail (And How to Fix Them)                   │
│     Tension: People try to build habits but fail after 3 days│
│     Verdict: viable  •  Keyword: habit formation (low)      │
│                                                               │
│ [✓] BC-IDEA-002                                              │
│     The 2-Minute Rule for Productivity                       │
│     Tension: Overwhelmed by to-do lists, need quick wins    │
│     Verdict: viable  •  Keyword: productivity tips (medium) │
│                                                               │
│ [ ] BC-IDEA-003                                              │
│     Neuroplasticity Explained Simply                         │
│     Tension: Complex science made accessible                │
│     Verdict: experimental  •  Keyword: neuroplasticity (high)│
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ Selected: 2 ideas                                            │
│ [Create 2 Projects] [Save Research to Library] [Archive All]│
└─────────────────────────────────────────────────────────────┘
```

### Project Creation Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Create New Project                                      [X]  │
├─────────────────────────────────────────────────────────────┤
│ [Start Discovery] [Use Existing Research] [Quick Entry]     │
├─────────────────────────────────────────────────────────────┤
│ ┌─ Use Existing Research ────────────────────────────────┐  │
│ │                                                         │  │
│ │ Select Research:                                        │  │
│ │ ┌───────────────────────────────────────────────────┐  │  │
│ │ │ ○ Psychology of Habits (8 projects, 3 winners)    │  │  │
│ │ │ ○ Productivity Systems (12 projects, 5 winners)   │  │  │
│ │ │ ● Science of Sleep (3 projects, 1 winner)         │  │  │
│ │ └───────────────────────────────────────────────────┘  │  │
│ │                                                         │  │
│ │ Project Title: [                                    ]  │  │
│ │                                                         │  │
│ │ This will create a project starting at Production      │  │
│ │ stage with research already linked.                    │  │
│ │                                                         │  │
│ │              [Cancel]  [Create Project]                │  │
│ └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

1. **Build Discovery Form Component**
   - Form fields matching BC_DISCOVERY_INPUT schema
   - Template quick-fill functionality
   - Dropdown for enums, dynamic arrays for lists
   - Validation with Zod

2. **Implement Template System**
   - Fetch templates from database
   - Apply template values to form
   - Support both theme and goal-based templates

3. **Create Idea Selection Grid**
   - Display ideas with checkboxes
   - Filter by verdict
   - Show key metadata (tension, keyword, verdict)

4. **Build Bulk Project Creation API**
   - Transaction-based creation
   - Save research with sources
   - Create multiple projects simultaneously
   - Link projects to research

5. **Implement Project Creation Modal**
   - Three tabs for different entry points
   - Research browser with search
   - Validation for required fields

6. **Add Stage Navigation Flexibility**
   - Remove restrictions on stage transitions
   - Allow jumping between stages
   - Persist stage history

## Success Criteria

- ✅ Discovery form renders with template support
- ✅ Idea selection grid displays generated ideas
- ✅ Bulk project creation works from selected ideas
- ✅ Research saved to library with structured sources
- ✅ Projects correctly linked to research with production input
- ✅ Project creation modal offers three entry points
- ✅ Stage navigation allows full flexibility
