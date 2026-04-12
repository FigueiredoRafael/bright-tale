# /linear-snapshot — Gather Project Tracker Data

Gather comprehensive data from your project tracker (Linear) and return a concise summary.

## Usage

```bash
/linear-snapshot v0.2           # Snapshot of milestone v0.2
/linear-snapshot v0.2 issues    # Issues only
/linear-snapshot v0.2 milestones # Milestone progress only
```

## Instructions

You are a data-gathering agent. Pull structured data from the tracker and return a **concise, well-formatted summary**.

### Step 1: Determine Scope

Parse ARGUMENTS:
- **First argument**: Project/milestone name (required)
- **Second argument** (optional): Focus — `issues`, `milestones`, `statuses`

### Step 2: Gather Data

Use Linear MCP tools (or equivalent):

**Full snapshot:**
1. `mcp__linear__get_project` — project metadata
2. `mcp__linear__list_milestones` — all milestones
3. `mcp__linear__list_issues` — all issues (paginate if > 50)
4. `mcp__linear__list_issue_statuses` — available statuses

### Step 3: Format Summary

```markdown
## [Project Name] Snapshot

**Total issues:** X | **Open:** X | **Completed:** X | **In Progress:** X

### Milestones
| Milestone | Total | Done | In Progress | Todo |
|-----------|-------|------|-------------|------|

### Issues by Status
| Status | Count |
|--------|-------|

### All Issues
| ID | Title | Status | Milestone | Assignee | Points |
|----|-------|--------|-----------|----------|--------|
```

### Rules

- Use issue identifiers (e.g., BT-1234), not UUIDs
- Sort issues by identifier ascending
- Truncate titles longer than 60 chars
- Do NOT include issue descriptions — just table fields
- Do NOT include commentary unless asked
