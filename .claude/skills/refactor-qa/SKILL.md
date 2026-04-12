# /refactor-qa — QA Bug Triage During Refactors

Triage bugs found during QA into tracker cards.

## Usage

```bash
/refactor-qa              # Start QA session
/refactor-qa backlog      # Send issues to backlog instead
```

## Instructions

When the user reports an error or issue:

1. **Investigate** — Search the codebase for root cause
2. **Document** — Gather all relevant context
3. **Propose** — Suggest potential solutions
4. **Create Card** — Create a well-documented tracker card

## Area Auto-Detection

| File Path Pattern | Label |
|---|---|
| `apps/app/**` | `area:app` |
| `apps/api/**` | `area:api` |
| `packages/shared/**` | `area:shared` |
| `supabase/**` | `area:database` |
| `agents/**` | `area:agents` |

## Card Content Template

**Title:** Clear, actionable (imperative mood, ~50-70 chars)

**Description:**
```markdown
## Problem
[What's happening / what the user reported]

## Error Details
[paste error logs verbatim]

## Root Cause
[What was discovered during investigation]

## Affected Files
- `path/to/file.ts:123` — [brief description]

## Proposed Solution
[Recommended fix — be specific]

## Reproduction
[Steps to trigger the issue]
```

## Investigation Process

1. Parse the error — Extract stack trace, error message, context
2. Search codebase — `Grep` / `Glob` to find related files
3. Read relevant files — Understand current implementation
4. Run tests — `npm run test` to check for regressions
5. Check lessons learned — `.claude/lessons-learned/`
6. Identify root cause — Don't just document symptoms
7. Create card — Include ALL context for immediate action
