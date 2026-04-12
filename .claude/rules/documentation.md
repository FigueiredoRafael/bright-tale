# Documentation Rules

Applied when editing: `docs/**`, `apps/docs-site/**`

## Two Documentation Locations

1. **`docs/`** — Source-of-truth specs, changelogs, and reference docs
2. **`apps/docs-site/`** — Rendered documentation site (Nextra)

## Content Routing

| Content Type | Location |
|---|---|
| Product specs | `docs/specs/` |
| Changelogs | `docs/changelogs/` |
| Business rules | `docs/SPEC.md` or docs-site feature pages |
| API reference | docs-site `api-reference/` section |
| Database schema | docs-site `database/` section |
| Agent definitions | docs-site `agents/` section |

## Documentation Updates Required

When you change code, check if documentation needs updating:

| Code Change | Docs to Update |
|---|---|
| New/modified API route | API reference in docs-site |
| Database migration | Database schema docs |
| New page/component | Feature docs in docs-site |
| Agent definition change | Agent docs in docs-site |
| Shared schema change | API reference (request/response shapes) |
| Business rule change | `docs/SPEC.md` + relevant feature page |

## Writing Rules

- Use plain language — target audience includes non-technical users
- Include code examples for API endpoints (curl + response)
- Keep docs DRY — link to source-of-truth rather than duplicating
- Date all spec documents
- Mark status: draft / approved / implemented
