# Milestone: Phase 1 — Foundation (Fase 1 — Fundação)

## Goal
Auth, organizations, storage, and credit system. Nothing else works without this foundation.

## Specs
- `docs/specs/auth-teams.md` + `docs/specs/infrastructure.md`
- `docs/superpowers/specs/2026-04-10-fastify-foundation-design.md` (SP1 — Fastify migration)
- `docs/superpowers/plans/2026-04-10-fastify-foundation.md` (SP1 implementation plan)

## Progress: 0/12 cards + SP1 prerequisite

### Prerequisite: SP1 — Fastify Foundation
**Status:** Not started
- Migrate `apps/api` from Next.js to Fastify 4.x
- Install `@tn-figueiredo/auth-fastify` for user auth
- Add `user_profiles` table (Migration A)
- Add `user_id` to 13 content tables (Migration B)
- Health route + auth routes + tests

### Cards

| Card | Title | Status | Dependencies |
|------|-------|--------|-------------|
| F1-001 | Supabase Auth: signup + login (UI) | Not started | SP1 |
| F1-002 | Organizations table + migration | Not started | SP1 |
| F1-003 | API: CRUD de organizations | Not started | F1-002 |
| F1-004 | API: Team management (members + invites) | Not started | F1-002, F1-003 |
| F1-005 | UI: Settings > Team | Not started | F1-004 |
| F1-006 | Add org_id to all existing tables | Not started | F1-002 |
| F1-007 | Supabase Storage: buckets + policies | Not started | F1-002 |
| F1-008 | Credit usage table + migration | Not started | F1-002 |
| F1-009 | Credit middleware (check + debit) | Not started | F1-008 |
| F1-010 | UI: Credit dashboard | Not started | F1-009 |
| F1-011 | Rate limiting (Upstash Redis) | Not started | SP1 |
| F1-012 | Sentry + structured logging | Not started | SP1 |
