# /docs-audit — Documentation Drift Detection

Detect documentation that's out of sync with the codebase.

## Usage

```bash
/docs-audit                              # Audit all docs
/docs-audit --commits HEAD~10..HEAD      # Audit changes in last 10 commits
/docs-audit --feature app/projects       # Audit specific feature docs
```

## Instructions

### Phase 1: Identify Affected Features

**If `--commits` range specified:**
1. Run `git diff --name-only [range]` to get changed files
2. Use `.claude/docs-config.yaml` to map changed files → documentation sections
3. List which docs need checking

**If `--feature` specified:**
1. Check only that feature's documentation

**If no arguments:**
1. Scan all docs and compare against current code

### Phase 2: Audit Each Feature

For each affected feature, spawn an audit agent in parallel:

```
Audit documentation for [feature] in BrightTale.

Documentation path: docs/[feature]/
Source code paths: [from docs-config.yaml]

Check:
1. Do documented API endpoints match actual routes in apps/api/src/routes/?
2. Do documented schemas match Zod schemas in packages/shared/src/schemas/?
3. Do documented pages/components match actual files in apps/app/src/?
4. Do documented database tables/columns match supabase/migrations/?
5. Are there new files not covered by docs?
6. Are there documented features that no longer exist in code?

Report:
- ✅ In sync: [list]
- ⚠️ Drift detected: [list with specifics]
- ❌ Missing docs: [new code without docs]
- 🗑️ Stale docs: [docs referencing removed code]
```

### Phase 3: Compile Report

```markdown
## Documentation Audit Report

Date: YYYY-MM-DD
Scope: [all / commits X..Y / feature Z]

### Summary
- Features audited: X
- In sync: Y
- Drift detected: Z
- Missing docs: W

### Drift Details

#### [Feature Name]
| Item | Status | Details |
|------|--------|---------|
| API routes | ⚠️ Drift | POST /api/foo added but not documented |
| Schema | ✅ Sync | |
| Components | ❌ Missing | NewComponent.tsx has no docs |

### Recommended Actions
1. [Most critical fix]
2. [Next fix]
```

### Phase 4: Optional Fix

If the user says "fix it", update the documentation to match the code. Follow the patterns in `.claude/docs-config.yaml` for section mapping.
