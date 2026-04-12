# /grab-card — Pick Up and Implement a Single Card

Pick up a single card from your project tracker (e.g., Linear) and implement it end-to-end with full PM orchestration.

## Usage

```bash
/grab-card BT-123        # Implement card BT-123
/grab-card BT-123 silent # Silent mode — less commentary, more action
```

## Instructions

You are a senior full-stack engineer implementing a card. You coordinate analysis, planning, implementation, and QA — delegating deep work to specialized agents.

### Phase 0: Fetch Card

1. Use `mcp__linear__get_issue` (or your tracker's equivalent) to fetch the card by identifier
2. Read the card title, description, acceptance criteria, labels, and assignee
3. If the card has blockers or dependencies, report them and ask how to proceed

### Phase 1: Card Analysis

Spawn a **card-analyst** agent:

```
Analyze this card for implementation in the BrightTale codebase.

Card: [title]
Description: [description]
Acceptance Criteria: [list]

The codebase is a monorepo:
- apps/app — Next.js 16 UI (port 3000)
- apps/api — Next.js API (port 3001)
- packages/shared — Types, Zod schemas, mappers
- supabase/migrations — PostgreSQL schema

Investigate the codebase to understand:
1. What files need to change
2. What the current behavior is
3. Any risks or concerns
4. A plain-language explainer of what this card does

Check .claude/lessons-learned/ for related past issues.
```

**After analysis, present findings to the user:**
- Summary of what needs to change
- Risks or concerns (if any)
- Plain-language explainer
- Ask: "Proceed to planning?"

### Phase 2: Planning

Spawn a **card-planner** agent:

```
Create a detailed implementation plan for this card.

Card: [title]
Analysis findings: [from Phase 1]
Codebase context: [key files identified]

Create a step-by-step plan with:
1. Each discrete change (file + what to do)
2. Dependencies between steps
3. Test plan (what to test after)
4. Before & After section (what changes from user perspective)

Save the plan to .claude/plans/[card-id].md
```

**Present the plan to the user.** Ask: "Approve this plan? Any changes?"

### Phase 3: Implementation

Spawn a **card-implementer** agent for each step (or do it yourself for small cards):

```
Implement this step from the approved plan.

Step: [step details]
Plan: [full plan from Phase 2]

Rules:
- Follow the plan exactly. If you need to deviate, document why.
- No console.logs, no TODO comments, no commented-out code
- Run typecheck after changes: npm run typecheck
- Run tests if they exist: npm run test
- API responses must use { data, error } envelope
- Use Zod schemas from @brighttale/shared for validation
```

**After each step:**
- Verify typecheck passes
- Run relevant tests
- Track progress

### Phase 4: QA Review

Spawn a **card-qa** agent:

```
QA review the implementation of card [id].

Acceptance criteria: [list]
Files changed: [list]
Plan: [the plan]

Verify:
1. All acceptance criteria are met
2. No regressions introduced
3. Code follows project conventions (see CLAUDE.md)
4. API envelope { data, error } used correctly
5. Zod schemas validate input/output
6. No security issues (SQL injection, XSS, header spoofing)
7. Check .claude/lessons-learned/ for anti-patterns

Report: PASS or FAIL with specific issues.
```

**If QA fails:** Fix the issues and re-run QA. Loop max 2 times, then ask the user.

### Phase 5: Completion

1. Update card status in tracker (e.g., `mcp__linear__save_issue` → "Done" or "In Review")
2. Post a comment on the card summarizing what was done
3. Report to the user: what was implemented, files changed, tests passing

## Context Management

- Save analysis to `.claude/plans/[card-id]-analysis.md`
- Save plan to `.claude/plans/[card-id].md`
- Clean up plan files after completion (or leave for reference)

## Step Evaluation Policy

Before implementing each step, ask yourself:
1. Do I have enough context to implement this correctly?
2. Does this step depend on a previous step's output?
3. Is this step still valid given what I've learned?

If any answer is "no", adjust the plan before proceeding.
