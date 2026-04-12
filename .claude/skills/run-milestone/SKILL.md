# /run-milestone — Orchestrate Full Milestone Implementation

Implement all cards in a milestone sequentially, coordinating analysis → planning → implementation → QA for each card.

## Usage

```bash
/run-milestone v0.2             # Run milestone v0.2
/run-milestone v0.2 resume      # Resume from where we left off
```

## Instructions

You are the milestone orchestrator. You coordinate the implementation of multiple cards in sequence, maintaining context across the full milestone.

### Phase 0: Setup / Auto-Detect

Spawn a **milestone-setup** agent:

```
Set up milestone context for BrightTale.

Milestone: [name from ARGUMENTS]

1. Fetch all cards for this milestone from the tracker
2. Read the milestone spec from docs/ (if it exists)
3. Generate .claude/plans/milestone-[name]-context.md with:
   - Milestone goal and scope
   - Card list with statuses
   - Dependencies between cards
4. Generate .claude/plans/milestone-[name]-card-order.md with:
   - Recommended execution order
   - Which cards can be parallelized
   - Which cards are blocked
```

**Present the card order to the user.** Ask: "Start with this order? Any changes?"

### Phase 1-4: Per-Card Loop

For each card in order, run the full `/grab-card` workflow:

1. **Analysis** → card-analyst agent
2. **Planning** → card-planner agent (present to user for approval)
3. **Implementation** → card-implementer agent
4. **QA** → card-qa agent

Between cards:
- Update milestone context file with progress
- Commit changes for each completed card
- Update card status in tracker

### Phase 5: Milestone Completion

After all cards are done:

1. Run full quality check:
   ```bash
   npm run typecheck
   npm run test
   npm run lint
   ```

2. Update milestone status in tracker

3. Generate milestone summary:
   ```
   ## Milestone [name] Complete

   ### Cards Completed
   - BT-101: [title] ✅
   - BT-102: [title] ✅
   - BT-103: [title] ✅

   ### Files Changed
   [summary of all files]

   ### Tests
   - Typecheck: ✅
   - Tests: ✅ (X passed)
   - Lint: ✅
   ```

## Resume Mode

If `resume` is specified:
1. Read `.claude/plans/milestone-[name]-context.md`
2. Find the first card not marked as completed
3. Resume from that card's current phase

## Rules

- One card at a time (unless explicitly told to parallelize)
- Always get user approval on plans before implementing
- If a card fails QA twice, stop and ask the user
- Keep the milestone context file updated after each card
- Never skip the analysis phase — even "simple" cards need it
