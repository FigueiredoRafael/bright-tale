---
title: Testing Requirements (MANDATORY)
status: approved
milestone: all
author: Rafael
date: 2026-04-12
---

# Testing Requirements — Mandatory for All Cards

Every card in every milestone MUST ship with automated tests. Without tests, a card is NOT done, regardless of whether the code works locally.

---

## Why

- Manual QA scales poorly and misses regressions
- Tests are the only way to guarantee behavior stays correct as the codebase grows
- They document expected behavior better than any written spec
- They enable aggressive refactoring without fear

---

## Minimum coverage per card type

| Card type | Required tests |
|---|---|
| **API route** | Success path + error path + auth/permission rejection + schema validation |
| **DB migration** | Migration applies cleanly + RLS policies block cross-tenant access + triggers fire correctly |
| **UI page / component** | Render test + at least one interaction (click, submit, navigate) |
| **Lib / helper function** | Unit tests covering happy path + edge cases + error conditions |
| **Integration (YouTube, Stripe, OpenAI, etc.)** | Tests with mocked responses + one E2E test against real service when feasible |
| **Background job (Inngest)** | Test that triggers the function and asserts side effects + retry behavior |
| **Middleware** | Test for authorized pass-through + unauthorized reject + header injection |

---

## Test stack

| Layer | Tool |
|---|---|
| Unit / integration (API + shared) | **Vitest** |
| Component / page (app + web) | **Vitest** + `@testing-library/react` |
| End-to-end (user flows) | **Playwright** (when available) |
| Database RLS | Supabase migration tests or Vitest with service_role client |

---

## Acceptance criteria template

Every card in the milestone docs must have a `**Testes:**` section with specific test cases, not just a generic "write tests" item. Example:

```markdown
**Testes obrigatórios:**
- [ ] `GET /api/channels` retorna canais apenas do org do usuário
- [ ] `POST /api/channels` valida schema Zod (400 em payloads inválidos)
- [ ] `DELETE /api/channels/:id` retorna 403 se não for owner/admin
- [ ] RLS bloqueia SELECT em channel de outro org
```

---

## Rules of engagement

1. **Tests are part of the card, not a follow-up.** Don't merge "F2-001" and open "F2-001b: add tests" — same card, same PR.
2. **If testing is too expensive for a card, split the card.** One card for implementation, one for tests. Both must land before the feature is considered shipped.
3. **Pre-commit hook must run tests.** Currently runs typecheck + lint + build. Add `npm run test` to every workspace's pre-commit flow as tests are added.
4. **Don't skip tests to hit deadlines.** A card with 80% of its tests is better than a card with 0% of them.
5. **Test must fail for a real reason.** A test that passes regardless of the code change is worse than no test — it gives false confidence.

---

## Card completion checklist (copy into every card)

```markdown
- [ ] Código implementado
- [ ] Typecheck passa (`npm run typecheck`)
- [ ] Build Vercel passa (`npm run build`)
- [ ] Testes automatizados cobrem o escopo (ver tipos acima)
- [ ] Todos testes passam (`npm run test`)
- [ ] Critérios de aceite do card validados manualmente
- [ ] Docs atualizados (se o card muda API/schema/UX público)
```

Only when ALL boxes are checked, the card becomes ✅ Concluído.
