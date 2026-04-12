# /qa-milestone — Generate and Execute QA Test Plans

Generate QA test plans for all cards in a milestone, then mark them pass/fail after manual testing.

## Usage

```bash
/qa-milestone v0.2              # Generate QA plans for milestone v0.2
/qa-milestone v0.2 verify       # Mark cards pass/fail after testing
```

## Instructions

### Phase 1: Generate QA Plans

For each card in the milestone:

1. Fetch card details from tracker
2. Read the implementation (git log, changed files)
3. Generate a test plan:

```markdown
## QA: [Card Title] ([Card ID])

### Acceptance Criteria
- [ ] [from card]

### Happy Path Tests
1. [Step-by-step test]
2. [Expected result]

### Edge Cases
1. [Edge case scenario]
2. [Expected behavior]

### Regression Checks
1. [Feature that might be affected]
2. [How to verify it still works]

### API Tests (if applicable)
```bash
curl -X POST http://localhost:3001/api/... \
  -H "X-Internal-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
# Expected: { data: ..., error: null }
```
```

Save all plans to `.claude/plans/milestone-[name]-qa.md`

### Phase 2: Verify (with `verify` argument)

Walk through each card's test plan with the user:

1. Present the test plan for card N
2. Ask: "Did this pass? Any issues?"
3. Record result (pass/fail + notes)
4. If fail: create a bug card in tracker with reproduction steps
5. Update card status:
   - Pass → "Done"
   - Fail → "In Progress" with bug card linked

### Final Report

```markdown
## QA Report: Milestone [name]

| Card | Title | Status | Notes |
|------|-------|--------|-------|
| BT-101 | ... | ✅ PASS | |
| BT-102 | ... | ❌ FAIL | Created BT-110 for regression |
| BT-103 | ... | ✅ PASS | |

### Summary
- Passed: X/Y
- Failed: Z (bug cards created)
- Blocking release: [yes/no]
```
