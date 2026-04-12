# /changelog — Generate Release Changelog

Generate user-friendly and technical changelogs from git history.

## Usage

```bash
/changelog v0.2.0          # Generate changelog for version v0.2.0
/changelog                  # Will ask for version info
```

## Instructions

### Step 1: Gather Version Info

Ask the user for:
- **Version number** (e.g., v0.2.0)
- **Date range** (auto-detect from last tag/changelog, allow override)

### Step 2: Analyze Commits

```bash
git log --since="YYYY-MM-DD" --oneline
git diff [start]...[end] --stat
```

Categorize changes by:
- **Component:** App (UI), API, Shared, Database, Agents
- **Type:** New Features, Improvements, Bug Fixes, Breaking Changes
- Parse ticket numbers (BT-XXX) when present

### Step 3: Generate Changelogs

Create folder: `docs/changelogs/YYYY-MM-DD_v[version]/`

#### File 1: `CHANGELOG.md` (User-Friendly)

```markdown
---
Version: vX.X.X
Release Date: YYYY-MM-DD
Commit Range: [hash]...[hash]
---

# BrightTale vX.X.X

## New Features
- [Description in plain language — what the user can now do]

## Improvements
- [UX/UI/performance improvements described for end users]

## Bug Fixes
- [What was fixed, described for end users]
```

**Rules:**
- Write for non-technical users (content creators)
- No file paths, code, or jargon
- Focus on "what changed for you"

#### File 2: `CHANGELOG_TECHNICAL.md` (Developer)

```markdown
---
Version: vX.X.X
Release Date: YYYY-MM-DD
Commit Range: [hash]...[hash]
---

# BrightTale vX.X.X — Technical Changelog

## App (apps/app)
### New Features
- **[Feature]** — `commit hash`
  - Files: `path/to/file.tsx`
  - Description: [what changed and why]

### Bug Fixes
- **[Fix]** — `commit hash`
  - Root cause: [what was wrong]
  - Fix: [what was changed]

## API (apps/api)
[same structure]

## Shared (packages/shared)
[same structure]

## Database
### Migrations
- `YYYYMMDD_name.sql` — [what changed]

## Breaking Changes
[if any]
```

### Step 4: Summary

```
Created changelogs/YYYY-MM-DD_vX.X.X/
  - CHANGELOG.md (user-friendly)
  - CHANGELOG_TECHNICAL.md (developer)

Analyzed X commits:
  - App: X changes
  - API: X changes
  - Shared: X changes
  - Database: X migrations
```
