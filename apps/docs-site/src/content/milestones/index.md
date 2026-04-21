# Milestones — BrightTale

Tracking de progresso do desenvolvimento, organizado por versão.

## Versões

| Versão | Status | Cards | Target |
|---|---|---:|---|
| [**v0.2** — Launch](/milestones/0.2) | 🟡 Beta | 6 | 2026-05-08 |
| [**v0.1** — Fundação](/milestones/0.1) | ✅ Stable | 90/110 | 2026-04-14 |

---

## Backlog (futuro)

Cards que dependem de infra externa ou decisões de escopo pendentes. Sem versão atribuída ainda.

| Card | Origem | Descrição | Requisito |
|---|---|---|---|
| F4-006 | Phase 4 | FFmpeg worker: montar vídeo | FFmpeg local ou serviço remoto |
| F4-007 | Phase 4 | API: Video generation routes (Inngest) | F4-006 |
| F4-009 | Phase 4 | UI: Step 4 Mídia (áudio + vídeo) | F4-006/007 |
| F4-010 | Phase 4 | Shorts: geração de vídeo vertical | F4-006/007 |
| F4-011 | Phase 4 | Express mode: one-click end-to-end | F4-006/007 |
| F5-001 | Phase 5 | YouTube upload: OAuth 2.0 + resumable upload | GCP OAuth client |
| F5-002 | Phase 5 | UI: Step 5 Publishing (blog + video + shorts) | F5-001 |
| F3-001 | Phase 3 | Stripe checkout: criar Products + Prices | Stripe Dashboard setup |
| F3-009 | Phase 3 | Mercado Pago scaffold | MP API keys |
| F3-010 | Phase 3 | Stripe webhook endpoint no deploy | Deploy prod |

### Para desbloquear

1. **`brew install ffmpeg`** → F4-006/007/009/010/011
2. **GCP Console → OAuth Client** → F5-001/002
3. **Stripe Dashboard → Products/Prices** → F3-001/009/010

---

## Legenda

| Status | Significado |
|---|---|
| 🔲 | Não iniciado |
| 🟡 | Em progresso |
| ✅ | Concluído |
| ⛔ | Bloqueado |

## Como usar

1. Abra a versão que vai trabalhar
2. Pegue o próximo card não iniciado
3. Quando terminar, mude para ✅ e adicione data
4. Use Claude Code com `/grab-card` referenciando o card ID (ex: `F1-001`)

## Regra obrigatória: Testes automatizados

**Todo card DEVE incluir testes automatizados antes de ser marcado como concluído.**

| Tipo de card | Cobertura mínima |
|---|---|
| **API route** | Testes de sucesso + erro + autorização + validação de schema |
| **DB migration** | Teste que valida schema + RLS policies + triggers |
| **UI page/component** | Render test + interaction test (happy path) |
| **Lib/helper** | Testes unitários com edge cases |
| **Integration** | Testes com mocks + teste E2E se possível |

Stack de testes: **Vitest** (unit/integration) + **Playwright** (E2E, quando aplicável).
