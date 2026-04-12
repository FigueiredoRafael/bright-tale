# /create-milestone-cards — Generate Cards from a Spec/PRD

Read a spec or PRD document and generate individual implementation cards in your project tracker.

## Usage

```bash
/create-milestone-cards docs/specs/token-system.md    # From a spec file
/create-milestone-cards                                # Will ask for document path
```

## Instructions

You generate well-decomposed implementation cards from a product spec.

### Phase 1: Resolve Document

1. If ARGUMENTS contains a file path, read it
2. If no argument, ask the user for the spec file path
3. Read the document fully

### Phase 2: Analyze Document

Spawn a **prd-analyzer** agent:

```
Analyze this product spec for the BrightTale content platform.

Document: [full content]

Extract:
1. Features/requirements (numbered list)
2. Data model changes (new tables, columns, migrations)
3. API endpoints needed (method, path, description)
4. Business rules and validations
5. UI changes (pages, components)
6. Gaps or ambiguities to resolve

BrightTale context:
- Monorepo: apps/app (UI), apps/api (API), packages/shared (types/schemas)
- Database: Supabase PostgreSQL
- API envelope: { data, error }
- Validation: Zod schemas in packages/shared
```

**Present analysis to user.** Resolve any gaps or ambiguities before proceeding.

### Phase 3: Generate Card Breakdown

Spawn a **card-generator** agent:

```
Generate implementation cards from this analyzed spec.

Analysis: [from Phase 2]
Spec: [original document]

Rules:
- Each card should be independently implementable (1-3 day scope)
- Group into tiers: Tier 1 (no dependencies), Tier 2 (depends on Tier 1), etc.
- Each card needs: title, description, acceptance criteria, labels, estimate (points)
- Include a "blockedBy" list for dependency tracking
- Card description template:

## Problem
[What needs to be built]

## Implementation
[High-level approach — files to create/modify]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Technical Notes
[Any important context]
```

### Phase 4: Review & Approve

Present the full card breakdown to the user:
- Total cards and point estimate
- Cards organized by tier
- Dependency graph

Ask: "Approve this breakdown? Any changes?"

### Phase 5: Create Cards

For each approved card, create it in your tracker:

```typescript
mcp__linear__save_issue({
  team: "brighttale",
  title: "...",
  description: "...",
  labels: ["area:api", "type:feature"],  // adapt labels
  // state, milestone, etc.
})
```

Add `blockedBy` relationships between dependent cards.

### Phase 6: Update Source Document

Add a section to the original spec with card references:

```markdown
## Implementation Cards
- [BT-101] Card title — Tier 1 (X points)
- [BT-102] Card title — Tier 1 (Y points)
- [BT-103] Card title — Tier 2, blocked by BT-101 (Z points)
Total: N points
```

### Phase 7: Final Report

```
## Card Creation Report

Spec: [document path]
Total Cards: X
Total Points: Y

### Tier 1 (no dependencies)
- BT-101: [title] (X pts)
- BT-102: [title] (Y pts)

### Tier 2
- BT-103: [title] (Z pts) — blocked by BT-101

### Recommended Order
1. BT-101 → BT-103
2. BT-102 (parallel)
```
