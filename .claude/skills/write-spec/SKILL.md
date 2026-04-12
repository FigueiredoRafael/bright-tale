# /write-spec — Collaborative Spec Writing

Guided conversation to write a product/technical spec, with codebase research and review.

## Usage

```bash
/write-spec token-system        # Write spec for token system
/write-spec                     # Will ask what to spec
```

## Instructions

You are a product-minded engineer writing a spec collaboratively with the user.

### Phase 1: Gather Context

Ask the user:

1. **What are we building?** (1-2 sentence description)
2. **Any reference specs?** (existing docs, competitor features, etc.)
3. **Target milestone/version?** (e.g., v0.2, v0.3)
4. **Any constraints?** (timeline, tech limitations, dependencies)

### Phase 2: Research

Spawn a **spec-researcher** agent:

```
Research the BrightTale codebase for context on: [feature description]

Run these research tracks in parallel:

1. DATABASE: Check supabase/migrations/ for related tables, existing columns that might support this feature
2. API: Check apps/api/src/routes/ for related endpoints, existing patterns
3. FRONTEND: Check apps/app/src/ for related pages, components, state management
4. SCHEMAS: Check packages/shared/src/schemas/ for related Zod schemas

For each track, report:
- What already exists that's relevant
- Patterns and conventions to follow
- Gaps that need filling
- Existing code that might need changes
```

Present research findings to the user. Discuss implications.

### Phase 3: Draft Spec

Write the spec using this template:

```markdown
---
title: [Feature Name]
status: draft
milestone: [version]
author: [user]
date: [today]
points: TBD
---

# [Feature Name]

## Problem
[Why this feature is needed — the user pain or business need]

## Solution
[High-level approach]

## Requirements

### Must Have
- [ ] [Requirement 1]
- [ ] [Requirement 2]

### Nice to Have
- [ ] [Requirement 3]

## Data Model

### New Tables
| Table | Column | Type | Description |
|-------|--------|------|-------------|

### Modified Tables
| Table | Change | Description |
|-------|--------|-------------|

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/... | ... | Required |

### Request/Response Examples
```json
// POST /api/...
// Request
{ "field": "value" }
// Response
{ "data": { ... }, "error": null }
```

## UI Changes

### New Pages
| Route | Description |
|-------|-------------|

### Modified Pages
| Route | Changes |
|-------|---------|

## Agent Workflow Impact
[If this affects the 4-agent pipeline — describe how]

## Security Considerations
[Auth, RLS, validation, rate limiting, etc.]

## Migration Plan
[How to roll this out — especially for existing users/data]

## Open Questions
- [ ] [Question 1]
- [ ] [Question 2]
```

### Phase 4: Review

Spawn a **spec-reviewer** agent:

```
Review this spec against the BrightTale codebase.

Spec: [full spec content]

Check:
1. Are the data model changes consistent with existing schema conventions?
2. Do API endpoints follow the existing pattern (envelope, Zod validation)?
3. Are there edge cases not covered?
4. Are there existing features that would be affected?
5. Is the migration plan realistic?
6. Security gaps?

Report gaps and suggestions.
```

Present review to user. Iterate if needed.

### Phase 5: Save

Save the spec to `docs/specs/[feature-name].md`

Suggest next step: "Run `/create-milestone-cards docs/specs/[feature-name].md` to generate implementation cards."
