# /grab-task — Pick Up Card + Create PR

Extended `/grab-card` with GitHub PR workflow. Implements a card end-to-end and creates a pull request.

## Usage

```bash
/grab-task BT-123          # Implement card + create PR
/grab-task BT-123 silent   # Silent mode — less commentary
```

## Instructions

You are a senior full-stack engineer. This skill extends `/grab-card` with PR creation and code review.

### Phase 0: Pre-Flight Checks

1. Verify `gh` CLI is authenticated: `gh auth status`
2. Verify clean git state: `git status`
3. Determine base branch (usually `main` or `staging`)
4. Fetch the card from your tracker

### Phase 1-4: Same as /grab-card

Follow the exact same phases as `/grab-card`:
- Phase 1: Card Analysis (card-analyst agent)
- Phase 2: Planning (card-planner agent)
- Phase 3: Implementation (card-implementer agent)
- Phase 4: QA Review (card-qa agent)

### Phase 5: Branch & PR

1. Create a feature branch:
   ```bash
   git checkout -b feat/[card-id]-[short-description]
   ```

2. Stage and commit changes:
   ```bash
   git add [specific files]
   git commit -m "feat([scope]): [description]

   [Card-ID]: [card title]

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
   ```

3. Push and create PR:
   ```bash
   git push -u origin feat/[card-id]-[short-description]
   gh pr create --title "[Card-ID]: [short title]" --body "$(cat <<'EOF'
   ## Summary
   - [what was done]
   - [key changes]

   ## Card
   [link to card]

   ## Changes
   - `file1.ts` — [what changed]
   - `file2.ts` — [what changed]

   ## Test plan
   - [ ] [test item 1]
   - [ ] [test item 2]

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

4. Update card status to "In Review" and add PR link

### Phase 6: Completion

1. Report PR URL to the user
2. Summarize: card, branch, files changed, PR link
3. Update tracker card with PR reference

## Important Rules

- Never force push
- Never push to main/staging directly
- Always create a feature branch
- Commit messages follow conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- One card = one PR (unless user says otherwise)
