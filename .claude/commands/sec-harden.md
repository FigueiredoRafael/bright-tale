---
description: Generate a patch that fixes a specific finding from the latest pentest report. Does not commit.
argument-hint: "<finding-id>"
---

# /sec-harden

Invoke the `bright-tale-sec` agent in **harden** mode for finding `$1`.

## Input

- `$1`: finding ID like `FIND-idor-ab12cd34` (from the last pentest JSON).

## What the agent does

1. Locates the finding in the most recent `.claude/security/findings/pentest-*.json`.
2. Reads the referenced file(s).
3. Generates a minimal unified-diff patch that addresses the root cause — no bundled refactors.
4. Creates a git worktree at `../bright-tale-harden-<finding-id>/`, applies the patch there.
5. Runs `npm run typecheck` and `npm run test` in the worktree.
6. Writes `.claude/security/findings/harden-<finding-id>.patch` with the diff + test results appended.
7. Reports to chat: what changed, typecheck/test status, the patch path, and a suggested commit message.

## What the agent MUST NOT do

- Apply the patch to the main working tree.
- Commit or push from the worktree.
- Expand scope beyond the finding (no "while I'm here" refactoring).
- Modify `.env*`, `supabase/migrations/*` — if the fix requires a migration, the agent writes the SQL as a proposal only, at `.claude/security/findings/harden-<finding-id>.sql`, and asks the user to review.

## Agent prompt

Delegate to `bright-tale-sec` with:

> Run mode = `harden` for finding id = `$1`. Minimal patch, no scope creep. Validate with typecheck + tests in a worktree. Do not commit. Report patch path + validation status + proposed commit message.
