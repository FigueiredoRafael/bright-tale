# Milestones — BrightTale

Tracking de progresso do desenvolvimento. Cada fase tem cards independentes. Marque como ✅ ao concluir.

## V2 — Concluído ✅

_Encerrado em 2026-04-14. 90 cards implementados, 10 movidos pra V3._

| Fase | Nome | Cards | Concluídos | Status |
|---|---|---:|---:|---|
| [1](/milestones/phase-1-foundation) | **Fundação** | 12 | 12 | ✅ Concluído |
| [2](/milestones/phase-2-core) | **Core (v2)** | 47 | 46 (+1 N/A) | ✅ Concluído |
| [3](/milestones/phase-3-monetization) | **Monetização** | 12 | 10 (+2 scaffold) | ✅ Core pronto |
| [4](/milestones/phase-4-media) | **Mídia** | 11 | 6 (+5 → V3) | ✅ Core pronto |
| [5](/milestones/phase-5-publishing) | **Publicação** | 9 | 7 (+2 → V3) | ✅ Core pronto |
| [6](/milestones/phase-6-polish) | **Polish** | 9 | 9 | ✅ Concluído |
| | **Total** | **100** | **90 implementados** | **✅** |

_Phase 2 cresceu de 14 → 47 cards ao longo do desenvolvimento (F2-036..F2-049 adicionados conforme bugs/UX surgiam). Phase 3 cresceu de 10 → 12 (F3-011 cupons + F3-012 VIP)._

---

## V3 — Backlog (video assembly + YouTube publishing)

Cards movidos do V2 que dependem de infra externa (FFmpeg, GCP OAuth). O produto V2 funciona end-to-end para blog + áudio; a edição de vídeo é manual (CapCut/Premiere/DaVinci).

| Card | Origem | Descrição | Requisito |
|---|---|---|---|
| F4-006 | Phase 4 | FFmpeg worker: montar vídeo (áudio + clips + legendas) | FFmpeg local ou serviço remoto |
| F4-007 | Phase 4 | API: Video generation routes (Inngest pipeline) | F4-006 |
| F4-009 | Phase 4 | UI: Step 4 Mídia (áudio + vídeo) | F4-006/007 |
| F4-010 | Phase 4 | Shorts: geração de vídeo vertical (9:16, batch 3) | F4-006/007 |
| F4-011 | Phase 4 | Express mode: one-click end-to-end | F4-006/007 |
| F5-001 | Phase 5 | YouTube upload: OAuth 2.0 + resumable upload | GCP OAuth client |
| F5-002 | Phase 5 | UI: Step 5 Publishing (blog + video + shorts) | F5-001 |
| F3-001 | Phase 3 | Stripe checkout: criar Products + Prices no Dashboard | Stripe Dashboard setup |
| F3-009 | Phase 3 | Mercado Pago scaffold | MP API keys |
| F3-010 | Phase 3 | Stripe webhook endpoint no deploy | Deploy prod |

### Para desbloquear

1. **`brew install ffmpeg`** → F4-006/007/009/010/011 (montagem local de vídeo)
2. **GCP Console → OAuth Client** → F5-001/002 (YouTube upload)
3. **Stripe Dashboard → Products/Prices** → F3-001/009/010

## Histórico recente (além dos cards originais)

Melhorias e correções adicionadas durante Phase 2/3 que viraram novos cards:

**Pipeline async + UX de geração**
- **F2-036** Geração assíncrona com modal de progresso (Inngest + SSE) — brainstorm/research/production, com filtro `?since=`, dedup, stall warning, duração por step
- **F2-044** Wizard contínuo (brainstorm → research → drafts com state passado via query params) + stepper visual
- **F2-047** Target length configurável (palavras pro blog, minutos pro vídeo/podcast, segundos pros shorts)

**Qualidade de output**
- **F2-045** Vídeo: dois roteiros distintos — teleprompter (fala limpa) + editor_script (A-roll/B-roll/SFX/BGM/color)
- **F2-046** Pacote YouTube completo — títulos A/B, thumbnails com composição/emoção, pinned comment, descrição SEO
- **F2-048** Contexto do canal (idioma pt-BR, tom, talking_head vs voiceover faceless) injetado em todos os agentes

**Diferenciais de produto**
- **F2-030** Ollama local (zero custo, sem quota)
- **F2-031** ModelPicker com recommended badges
- **F2-034** Friendly AI errors (toast acionável em vez de JSON cru)
- **F2-040** Create Content hub com tabs + auto-arquivamento de ideias/pesquisas usadas
- **F2-049** Token usage tracking + dashboard de custo (USD/BRL)

**Monetização (Phase 3)**
- **F3-002→008** Backend Stripe completo + UI de billing + modal de upgrade + banner de alerta
- **F3-001** ⚠️ código pronto, aguardando setup manual no Stripe Dashboard

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
