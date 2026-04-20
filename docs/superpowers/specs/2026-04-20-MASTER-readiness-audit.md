# Master Doc: BrightTale — Auditoria, Priorização e Roadmap Launch 4-8 Mai

**Data:** 2026-04-20 (v2 — integrado com milestones + decisões do founder)
**Autor:** Claude + subagentes (audit + inventory + milestones)
**Status:** Decisões aprovadas pelo founder. Pronto para execução.

---

## 1. Sumário Executivo

| Métrica | Valor |
|---------|-------|
| **Launch target** | **Dogfooding + 1 convite** (não público) |
| **Data target** | **8 Mai** (18 dias). 4 Mai só com corte de Affiliates V1. |
| **Capacidade** | Solo dev (founder) |
| **Score alvo** | **75-80** |
| **Score atual SaaS** | 78 / 100 |
| **Score atual Dogfooding** | 86 / 100 |
| **Verdict** | ✅ Dogfooding-ready em 18 dias executando MUST DO sem slip. |

**Escala:** 65=ok-com-muita-reserva · 75=bom-com-supervisão · 85=ótimo-auto-serviço · 95=enterprise.

---

## 2. Estado Real do Projeto (integrado com milestones)

**V2 está 90% completa** (90/100 cards dos milestones done). Capacidades funcionais:
- ✅ Brainstorm → Research → Draft → Review → Assets → Publish WP (end-to-end)
- ✅ Auth Supabase + orgs + roles
- ✅ Stripe code pronto (falta criar Products no Dashboard — 30min)
- ✅ Credits system wired + rate limit
- ✅ YouTube scripts + shorts geração (export manual)
- ✅ Sentry + Axiom logging
- 🟡 Video assembly (bloqueado em FFmpeg worker — V3)
- 🟡 YouTube upload (bloqueado em GCP OAuth — V3)
- 🟡 Publishing UI multi-destino (WP funciona; YT upload pendente)

**Pendências críticas:** nenhuma para dogfooding. Todas as lacunas bloqueantes são para launch público.

---

## 3. Verificação do AUDIT_REPORT.html (externo)

| # | Finding | Audit severity | **Verdict** | Real severity |
|---|---------|----------------|-------------|----------------|
| 1 | RLS `service_role_all` blanket em 10 tabelas afiliado | Crítico | **CONFIRMADO** | Alto (para launch com auth externa). Baixo para dogfooding. |
| 2 | Credits race — debit async pós-AI, sem `FOR UPDATE` | Crítico | **CONFIRMADO com caveat** | Médio-Alto (mesmo em dogfooding — tu pode triggerar concorrente) |
| 3 | IdeaContext fragmentado — AssetsEngine não usa | Média | **REFUTADO** | N/A (design correto) |
| 4 | Dualidade legacy/JSONB em drafts | Alta | **REFUTADO** | N/A (`draft_json` único ativo) |

**Decisão:** Finding #2 (Credits) é **P0** (hold/reserve + `FOR UPDATE`). Finding #1 (RLS) é **P1** — pente fino nas 18 tabelas, mas deferível pós-dogfooding.

**Evidência:**
- RLS: `supabase/migrations/20260417000005_affiliate_005_supabase.sql:39-94`
- Credits: `apps/api/src/lib/credits.ts:85-158` + `apps/api/src/jobs/brainstorm-generate.ts:219`

---

## 4. Decisões Consolidadas (37/37)

| # | Decisão | Status |
|---|---------|--------|
| 1 | Launch = Dogfooding + 1 convite | ✅ |
| 2 | Data target 4 Mai (max 8 Mai) | ✅ |
| 3 | Founder escreve E2E | ✅ |
| 4 | Kanban agora | ✅ |
| 5 | Affiliates = core (mas V1 só catálogo) | ✅ |
| 6 | Kanban admin-only | ✅ |
| 7 | Sync `.md` uma vez, arquivar | ✅ |
| 8 | `phase` FK para tabela `phases` | ✅ |
| 9 | Rebalance `sort_order` automático | ✅ |
| 10 | Canal pode trocar WP ao longo do tempo | ✅ |
| 11 | **WP pode ter N editores (via channel_members)** | ✅ |
| 12 | Sem auto-migration de WP config | ✅ |
| 13 | WP-específico agora (polimorfismo v2) | ✅ |
| 14 | Progress sidebar direita | ✅ |
| 15 | Autopilot com checkpoint em assets + publish | ✅ |
| 16 | Custo + tempo na progress bar | ✅ |
| 17 | Custo default por plano | ✅ |
| 18 | Notificações só email | ✅ |
| 19 | Score threshold configurável, default 40 | ✅ |
| 20 | Retorno decrescente threshold absoluto <5 pts | ✅ |
| 21 | Skip review se score inicial ≥95 | ✅ |
| 22 | Concurrency upload 4 default, config por plano | ✅ |
| 23 | API como gateway de upload | ✅ |
| 24 | Biblioteca de assets por canal | ✅ |
| 25 | Drag-drop auto-distribute — **descartado v1** | ✅ |
| 26 | Alt text on-the-fly no publish | ✅ |
| 27 | Usuário escolhe modelo vision | ✅ |
| 28 | Keyword primária do draft meta (validar output agente) | ✅ TODO |
| 29 | Warning + override, não bloqueia | ✅ |
| 30 | CSV import v1 | ✅ |
| 31 | pgvector — **descartado v1** (catálogo pequeno) | ✅ |
| 32 | UTM tracking v1, webhook pós-$500/mês | ✅ |
| 33 | Manual placement coexiste com sugestões | ✅ |
| 34 | A/B testing — backlog v3 | ✅ |
| 35 | RLS pente fino nas 18 tabelas | ✅ P1 |
| 36 | `FOR UPDATE` no debit | ✅ |
| 37 | Hold/reserve pattern | ✅ |

---

## 5. Escopo Launch 4-8 Mai (SOLO dev, 14-18 dias)

**Capacidade real:** 1 dev (founder) em 14 dias = ~14 dias de trabalho sequencial (assumindo 1d/dia efetivo). Target 4 Mai apertado, 8 Mai realista.

### 5.1 MUST DO (não pode faltar no dogfooding)

| # | Item | Esforço | Dia alvo (8 Mai) |
|---|------|---------|------------------|
| 1 | **Validar + configurar `primaryKeyword` output agentes 2 e 3** (precondição P6) | 1d | D1 |
| 2 | **A1 Credits hold/reserve + `FOR UPDATE`** | 3d | D2-4 |
| 3 | **P1 WP-per-channel + `channel_members` (incluir migration do canal Bright Curios existente)** | 5d | D5-9 |
| 4 | **P6 Alt text on-publish (hardcoded gemini-flash)** | 2d | D10-11 |
| 5 | **F7-003 WordPress publish e2e test** | 2d | D12-13 |
| 6 | **Affiliates V1 — catálogo CRUD + CSV + dropdown BlogEditor** | 4d | D14-17 |
| 7 | **Smoke test + deploy staging + launch** | 1d | D18 |

**Total sequencial:** 18 dias. **Encaixa no prazo máximo 8 Mai.** 4 Mai só se scope reduzir.

### 5.2 Ajuste para 4 Mai (se ainda quiser tentar)

Cortar ou reduzir 1 item:

- **Opção A — cortar Affiliates V1:** 14 dias exato. Mas afiliado foi classificado como "core". Posterga-se 4 dias.
- **Opção B — Affiliates V1 reduzido:** só dropdown de produtos hardcoded no BlogEditor (sem admin CRUD). 2d em vez de 4d = **16 dias total** (6 Mai). Catálogo CRUD posterga.
- **Opção C — manter 8 Mai:** meta honesta, sem desespero, inclui affiliates completo.

**Recomendação:** Opção C (8 Mai). Pressão para 4 Mai gera débito técnico que contamina dogfooding.

### 5.3 SHOULD DO (se sobrar dia, incluir nessa ordem)

| # | Item | Esforço |
|---|------|---------|
| 8 | **P3 Pipeline sidebar collapse (progress + custo + tempo)** | 3d |
| 9 | **F7-001 Sentry source maps + alertas** (recomendado pelo founder) | 1d |
| 10 | **A2 RLS pente fino 18 tabelas** | 5d |

### 5.4 CAN CUT — pós-launch (confirmado pelo founder)

- **P0 Kanban** — movido para pós-launch (Wave 2).
- P4 Assets fast ingest (dor contornável).
- P2 Autopilot evoluído (autopilot atual funciona).
- P7 Affiliates V2 engine AI.
- I1 GitHub Actions CI/CD.
- I2 Playwright E2E completo.
- I3 PostHog events.
- F3-001 / F7-002 Stripe setup (sem checkout em dogfooding).
- F2-019, F2-021, F2-022, F2-025 polish milestones.
- F7-005 a F7-010 (Series/Products/Shorts/Notifications).
- AFF-* rebuild original (substituído por Affiliates V1).

---

## 6. Cronograma Proposto — SOLO DEV, Target 8 Mai

```
D1    ┤ Validar primaryKeyword agents + config code
D2-4  ┤ A1 Credits hold/reserve + FOR UPDATE + tests
D5-9  ┤ P1 WP-per-channel + channel_members + backfill Bright Curios
D10-11┤ P6 Alt text on-publish (gemini hardcoded)
D12-13┤ F7-003 WP e2e smoke test
D14-17┤ Affiliates V1 catálogo + CSV + BlogEditor dropdown
D18   ┤ Final smoke + deploy + launch (8 Mai)
```

**Buffer:** zero. Slippage de 1 dia empurra launch para 9 Mai.

### Se sobrar dia (SHOULD DO em ordem)

- +3d: P3 Pipeline collapse
- +1d: Sentry source maps + alerts
- +5d: RLS pente fino

### Checkpoints

| Dia | Revisar |
|-----|---------|
| D4 | A1 Credits passou em stress test? Se não, re-plan. |
| D9 | P1 WP + members deployado em dev? Migration Bright Curios rodou? |
| D13 | WP e2e test passou? Se não, afiliates desce para SHOULD. |
| D17 | Smoke completo. Go/no-go decisão. |

---

## 7. Análise dos Milestones Pendentes

Das 10 pendências Phase 7 + 4 parciais Phase 2, classificação para dogfooding:

| Card | Escopo | Dogfooding fit |
|------|--------|----------------|
| F7-001 Sentry | source maps + alert config (scaffold existe) | Nice (1d) |
| F7-002 Stripe pricing | 30min manual Dashboard | SKIP (sem checkout) |
| F7-003 WP e2e test | 2d | **MUST** |
| F7-004 Image gen finalization | hero + thumbnails | SKIP (parcial funciona) |
| F7-005 Series | 5-7d | SKIP |
| F7-006 Products + CTA | 5-7d | SKIP |
| F7-007 Product highlight | 3d | SKIP |
| F7-008 Shorts recommendations | 5d | SKIP |
| F7-009 Support chatbot | 5-7d | SKIP |
| F7-010 Push notifications | 5d | SKIP |
| F2-019 Research ranking | 3-5d UX | SKIP |
| F2-021 Blog editor + export | 5-7d | SKIP (JSON export funciona) |
| F2-022 Video editor + audio | 7-10d (bloqueado FFmpeg) | SKIP |
| F2-025 Admin agents versioning | 3d | SKIP |
| AFF-* rebuild | 10-15d | **REPLACED** por Affiliates V1 plano |

**Conclusão:** apenas F7-003 é MUST. Todo resto defer.

---

## 8. Score Projetado Pós-Launch (14 dias)

### Dogfooding lens
Atual 86 → após MUST DO: **91** (ganho em WP multi-editor, alt-text SEO, pipeline UX, affiliate catálogo).

### SaaS público lens
Atual 78 → após MUST DO: **81-82**.

Para chegar a 85+ público: executar Wave 2 pós-launch (I1, I2, I3, A2, F7-001 completo). ~3 semanas adicionais.

**Dentro do target 75-80 ✅ (ultrapassa com folga na lens dogfooding).**

---

## 9. Questões Resolvidas (founder)

1. ✅ **Validar `primaryKeyword`** — incluir instrução no prompt dos agentes 2 e 3 + configurar código para receber. D1 do cronograma.
2. ✅ **1 dev (solo)** — founder. Timeline ajustado para 18 dias.
3. ✅ **Migrar canal Bright Curios** — owner auto-backfill como `channel_members.role=owner`. Incluir na migration P1.
4. ✅ **Vision model hardcoded** `gemini-flash` via env var. UI de seleção — backlog.
5. ✅ **Kanban pós-launch** — fora da Wave 1.
6. ✅ **Sentry source maps + alerts** — incluído em SHOULD DO (1d).

---

## 10. Próximos Passos Imediatos

1. Founder aprova este master doc.
2. Founder responde as 6 questões da seção 9.
3. Claude gera specs técnicas detalhadas por MUST DO item (DB migration SQL, route handlers, UI components).
4. Founder abre branch `launch-4-mai` e inicia D1.
5. Checkpoint D7 — avaliar progresso, re-priorizar se necessário.
6. Checkpoint D13 — smoke test + decisão go/no-go para launch D14.
7. Se slip: target 8 Mai, focar MUST DO.

---

## 11. Links para Specs Individuais

- `2026-04-20-wordpress-per-channel.md` (830 linhas + amendments)
- `2026-04-20-pipeline-stage-collapse.md`
- `2026-04-20-autopilot-plan.md` (backlog pós-launch)
- `2026-04-20-assets-fast-ingest.md` (backlog pós-launch)
- `2026-04-20-image-alt-text-seo.md`
- `2026-04-20-affiliate-suggestions.md` (V1 + V2 split)
- `2026-04-20-kanban-board-design.md` (original + flaws anotadas)

---

**Versão:** v2 — 2026-04-20 — integrado com respostas do founder + milestones.
