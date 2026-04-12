# /triage-bug — Bug Investigation and Card Creation

Investigate a bug report, find the root cause, and create a well-documented tracker card.

## Usage

```bash
/triage-bug                    # Start interactive bug triage
/triage-bug "error message"    # Start with a specific error
```

## Instructions

### Phase 1: Intake

Gather information from the user:
1. **What happened?** (error message, screenshot, user report)
2. **Where?** (which page/endpoint/feature)
3. **Reproduction steps?** (if known)
4. **Severity?** (blocking, major, minor, cosmetic)

### Phase 2: Deep Investigation

1. **Parse the error** — Extract stack trace, error codes, context
2. **Search codebase** — Find related files and understand the code path:
   ```
   - apps/app/src/ for frontend issues
   - apps/api/src/routes/ for API issues
   - packages/shared/src/schemas/ for validation issues
   - supabase/migrations/ for schema issues
   ```
3. **Read relevant files** — Understand current implementation
4. **Check tests** — Run `npm run test` to see if existing tests catch it
5. **Check lessons learned** — Read `.claude/lessons-learned/` for related past bugs
6. **Identify root cause** — Don't just document symptoms

### Phase 3: Findings & Proposal

Present to the user:

```markdown
## Bug Analysis

### Symptom
[What the user sees]

### Root Cause
[What's actually wrong in the code]

### Affected Files
- `path/to/file.ts:123` — [what's wrong here]

### Proposed Fix
[How to fix it — be specific]

### Impact
- Severity: [critical/major/minor]
- Users affected: [all/subset/edge case]
- Other features at risk: [list]
```

Ask: "Create a tracker card? Or fix it now?"

### Phase 4: Create Card (if user wants)

```typescript
mcp__linear__save_issue({
  team: "brighttale",
  title: "Fix: [concise description]",
  description: `## Problem
[symptom]

## Root Cause
[what's actually wrong]

## Affected Files
- \`path/to/file.ts:123\`

## Proposed Fix
[approach]

## Reproduction
1. [step]
2. [step]
3. [expected vs actual]`,
  labels: ["type:bug", "area:api"],  // adapt labels
  // priority, state, etc.
})
```

### Phase 5: Lesson Learned (optional)

If this bug reveals a pattern worth remembering:

```markdown
# Append to .claude/lessons-learned/bugs.md

## [Date] — [Bug Title]
**Card:** BT-XXX
**Root cause:** [brief]
**Pattern to watch for:** [what to check in future code]
**Prevention:** [how to avoid this class of bug]
```

## Platform Auto-Detection

| Error context | Area label |
|---|---|
| `apps/app/` or frontend error | `area:app` |
| `apps/api/` or API error | `area:api` |
| `packages/shared/` | `area:shared` |
| `supabase/` or DB error | `area:database` |
| Agent/AI related | `area:ai` |
| WordPress publishing | `area:wordpress` |
