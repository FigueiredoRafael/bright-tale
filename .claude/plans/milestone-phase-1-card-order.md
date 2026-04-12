# Phase 1 — Card Execution Order

## Recommended Order

### Block 1: Fastify Foundation (SP1 — prerequisite)
Everything depends on this. Detailed plan already exists at `docs/superpowers/plans/2026-04-10-fastify-foundation.md`.

1. **SP1-Task1:** Migration A — `user_profiles` table
2. **SP1-Task2:** Migration B — `user_id` on 13 tables
3. **SP1-Task3:** Swap `apps/api/package.json` (remove Next.js, add Fastify)
4. **SP1-Task4:** Remove Next.js artifacts, update tsconfig + vitest config
5. **SP1-Task5:** Health route (TDD)
6. **SP1-Task6:** Auth routes (TDD)
7. **SP1-Task7:** Final acceptance check

### Block 2: Auth UI + Organizations (sequential)
8. **F1-001:** Supabase Auth UI — login/signup pages in `apps/app`
9. **F1-002:** Organizations table + migration
10. **F1-006:** Add `org_id` to all existing tables (do right after orgs table exists)

### Block 3: Org API + Team (sequential)
11. **F1-003:** Organization CRUD API
12. **F1-004:** Team management API (members + invites)
13. **F1-005:** UI: Settings > Team

### Block 4: Credits (sequential)
14. **F1-008:** Credit usage table + migration
15. **F1-009:** Credit middleware (check + debit)
16. **F1-010:** UI: Credit dashboard

### Block 5: Infrastructure (parallelizable)
17. **F1-007:** Supabase Storage (buckets + policies)
18. **F1-011:** Rate limiting (Upstash Redis)
19. **F1-012:** Sentry + structured logging

## Parallelization Opportunities
- Block 5 cards (F1-007, F1-011, F1-012) are independent of each other and can run in parallel
- Block 4 can run in parallel with Block 3 (after Block 2 completes)

## Blocked Cards
- All cards blocked on SP1 (Fastify migration) completing first
- F1-003 → F1-004 → F1-005 are strictly sequential
- F1-008 → F1-009 → F1-010 are strictly sequential
