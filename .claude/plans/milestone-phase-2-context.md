# Milestone: Phase 2 — Core

## Goal
Channels, onboarding, YouTube Intelligence, reference modeling, and simplified content creation flow (text).

## Specs
- `docs/specs/onboarding-channels.md`
- `docs/specs/reference-modeling.md`
- `docs/specs/v2-simplified-flow.md`

## Dependencies
- Phase 1 (auth, orgs, storage, credits) — COMPLETE

## Progress: 0/14

### Cards

| Card | Title | Status | Dependencies |
|------|-------|--------|-------------|
| F2-001 | Channels table + migration | Not started | Phase 1 |
| F2-002 | API: CRUD de channels | Not started | F2-001 |
| F2-003 | UI: Dashboard de canais | Not started | F2-002 |
| F2-004 | Onboarding wizard (7 telas) | Not started | F2-002 |
| F2-005 | YouTube Data API: integração base | Not started | — |
| F2-006 | YouTube Intelligence: análise de nicho | Not started | F2-005 |
| F2-007 | channel_references + reference_content tables | Not started | F2-001 |
| F2-008 | API: Reference modeling | Not started | F2-007, F2-005 |
| F2-009 | UI: Config de canal + referências | Not started | F2-008 |
| F2-010 | Flow simplificado: Pesquisa (Step 1-2) | Not started | F2-006, F2-008 |
| F2-011 | Flow simplificado: Geração (Step 3) | Not started | F2-010, F2-012 |
| F2-012 | Integração direta com APIs de IA | Not started | — |
| F2-013 | Bulk generation | Not started | F2-011, F2-014 |
| F2-014 | Inngest: setup de job queue | Not started | — |

## Execution Order

### Block 1: Channels foundation (sequential)
1. F2-001 — Channels table + migration
2. F2-002 — Channels CRUD API
3. F2-003 — Channels dashboard UI

### Block 2: Onboarding
4. F2-004 — Onboarding wizard

### Block 3: YouTube + References (parallelizable with Block 2)
5. F2-005 — YouTube Data API client
6. F2-007 — Reference tables + migration
7. F2-006 — YouTube Intelligence: niche analysis
8. F2-008 — Reference modeling API
9. F2-009 — Channel config + references UI

### Block 4: AI Integration (independent)
10. F2-012 — Direct AI API integration (replaces YAML copy-paste)
11. F2-014 — Inngest job queue setup

### Block 5: Simplified Flow (depends on Blocks 3+4)
12. F2-010 — Research flow (Step 1-2)
13. F2-011 — Generation flow (Step 3)
14. F2-013 — Bulk generation
