# Milestones — BrightTale V2

Tracking de progresso do desenvolvimento. Cada fase tem cards independentes. Marque como ✅ ao concluir.

## Progresso Geral

| Fase | Nome | Cards | Concluídos | Status |
|---|---|---:|---:|---|
| [1](/milestones/phase-1-foundation) | **Fundação** | 12 | 12 | ✅ Concluído |
| [2](/milestones/phase-2-core) | **Core** | 14 | 14 | ✅ Concluído |
| [3](/milestones/phase-3-monetization) | **Monetização** | 10 | 0 | 🔲 Não iniciado |
| [4](/milestones/phase-4-media) | **Mídia** | 11 | 0 | 🔲 Não iniciado |
| [5](/milestones/phase-5-publishing) | **Publicação** | 9 | 0 | 🔲 Não iniciado |
| [6](/milestones/phase-6-polish) | **Polish** | 8 | 0 | 🔲 Não iniciado |
| | **Total** | **64** | **26** | |

## Legenda

| Status | Significado |
|---|---|
| 🔲 | Não iniciado |
| 🟡 | Em progresso |
| ✅ | Concluído |
| ⛔ | Bloqueado (ver nota) |

## Como usar

1. Abra a fase que vai trabalhar
2. Pegue o próximo card não iniciado
3. Quando terminar, mude para ✅ e adicione data
4. Use Claude Code com `/grab-card` referenciando o card ID (ex: `F1-001`)

## ⚠️ Regra obrigatória: Testes automatizados

**Todo card DEVE incluir testes automatizados antes de ser marcado como concluído.**

Um card só é considerado "pronto" quando:
- [ ] Código implementado + typecheck passa
- [ ] **Testes unitários/integração cobrindo o escopo do card**
- [ ] Build de produção (Vercel) passa
- [ ] Critérios de aceite validados

### Cobertura mínima esperada por tipo de card

| Tipo de card | Cobertura mínima |
|---|---|
| **API route** | Testes de sucesso + erro + autorização + validação de schema |
| **DB migration** | Teste que valida schema + RLS policies + triggers |
| **UI page/component** | Render test + interaction test (ao menos o happy path) |
| **Lib/helper** | Testes unitários com edge cases |
| **Integration (ex. YouTube, Stripe)** | Testes com mocks + teste E2E se possível |

Stack de testes: **Vitest** (unit/integration) + **Playwright** (E2E, quando aplicável).

**Não é opcional.** Cards sem testes não avançam. Se a complexidade do teste exceder o esforço do card, quebrar em dois cards (um de implementação + um de testes).

## Specs de referência

Cada card referencia o spec relevante em `docs/specs/`:

| Spec | Arquivo |
|---|---|
| Auth + Teams | `docs/specs/auth-teams.md` |
| Onboarding + Canais | `docs/specs/onboarding-channels.md` |
| Flow V2 | `docs/specs/v2-simplified-flow.md` |
| Reference Modeling | `docs/specs/reference-modeling.md` |
| Pricing + Créditos | `docs/specs/pricing-plans.md` |
| Payments | `docs/specs/payments-stripe.md` |
| Infrastructure | `docs/specs/infrastructure.md` |
| **Testing (MANDATORY)** | **`docs/specs/testing-requirements.md`** |
