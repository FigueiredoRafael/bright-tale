# /estimate-spec — Point Estimation for a Spec

Analyze a spec document and provide story point estimates without creating cards.

## Usage

```bash
/estimate-spec docs/specs/token-system.md    # Estimate from spec file
/estimate-spec                                # Will ask for document path
```

## Instructions

### Phase 1: Resolve Document

Read the spec file from ARGUMENTS or ask the user.

### Phase 2: Analyze Document

Spawn a **prd-analyzer** agent to extract features, data model changes, API endpoints, and business rules.

### Phase 3: Estimate Each Work Item

For each identified work item, spawn a **point-estimator** agent:

```
Estimate story points for this work item in the BrightTale codebase.

Work Item: [description]
Files likely affected: [from analysis]

BrightTale context:
- Monorepo: apps/app (Next.js UI), apps/api (API routes), packages/shared (types/schemas)
- Database: Supabase PostgreSQL with migrations in supabase/migrations/
- Validation: Zod schemas
- Testing: Vitest

Point scale:
- 1 point: Config change, small UI tweak, simple CRUD endpoint
- 2 points: New component, new API route with validation, schema change
- 3 points: Feature with multiple files, new module, migration + API + UI
- 5 points: Complex feature spanning multiple systems, new integration
- 8 points: Major feature, new subsystem, significant refactor
- 13 points: Epic-level work, should probably be broken down further

Investigate the codebase to understand complexity. Report:
- Estimate (points)
- Rationale (1-2 sentences)
- Risk level (low/medium/high)
```

### Phase 4: Present Estimate

```markdown
## Estimate: [Spec Title]

| # | Work Item | Points | Risk | Rationale |
|---|-----------|--------|------|-----------|
| 1 | ... | 3 | Low | ... |
| 2 | ... | 5 | Med | ... |

### Summary
- **Total Points:** X
- **High-risk items:** Y
- **Suggested breakdown:** [if any item is 8+ points, suggest splitting]
```

### Phase 5: Save Estimate

Update the spec's frontmatter with the estimate:
```yaml
points: X
estimated_at: YYYY-MM-DD
```
