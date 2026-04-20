# Spec: Sistema de Afiliados — v1 Catálogo + v2 Engine AI

## 1. Objetivo
Hoje afiliados são 100% manuais. **V1 (launch 4 Mai):** catálogo de produtos por canal + placement manual (sem AI). **V2 (pós-launch):** motor de sugestão AI com embeddings, tracking de clicks, dashboard.

---

## PARTE A — V1 (escopo launch 4 Mai)

### A.1 Catálogo de Afiliados por Canal
- Tabela `channel_affiliate_products`: `channel_id`, `name`, `url`, `description`, `commission_rate`, `tags[]`, `keywords[]`, `active`, `notes`, `created_at`, `updated_at`.
- CRUD `/admin/channels/:id/affiliates` — lista, form de add/edit, toggle active.
- Import CSV manual — upload de arquivo com `name,url,description,commission_rate,tags`. Parse + bulk insert.

### A.2 Placement Manual no BlogEditor (já existe)
- `BlogEditor` já aceita `placement`, `copy`, `product_link_placeholder`, `rationale` manuais.
- Adicionar: seletor "escolher do catálogo do canal" preenche `product_link_placeholder` + puxa metadata.

### A.3 Tracking Básico (UTM)
- Ao publicar no WP, links de afiliado recebem `?utm_source=brighttale&utm_campaign={draft_slug}&aff={product_id}`.
- Clicks visíveis via PostHog (depois que PostHog estiver ativo — v2 ok).
- **Não há webhook de comissão real v1.**

### A.4 Migração + Routes V1
- `supabase/migrations/<ts>_affiliate_catalog.sql` — NOVA (1 tabela apenas).
- `apps/api/src/routes/affiliates/*`:
  - `GET/POST /api/channels/:id/affiliates`
  - `PUT/DELETE /api/channels/:id/affiliates/:productId`
  - `POST /api/channels/:id/affiliates/import` — CSV upload
- `packages/shared/src/schemas/affiliates.ts` — Zod novo.

### A.5 UI V1
- `apps/app/src/app/(app)/admin/channels/[id]/affiliates/page.tsx` — NOVA
- `apps/app/src/components/production/BlogEditor.tsx` — adicionar dropdown "select from catalog"

### A.6 Critérios de Aceite V1
- [ ] Catálogo CRUD por canal funcional.
- [ ] CSV import com ≥ 50 produtos funciona.
- [ ] BlogEditor permite selecionar produto do catálogo.
- [ ] Links publicados no WP têm UTM com `aff={product_id}`.

**Esforço V1:** 4-5 dias. 1 dev.

---

## PARTE B — V2 (backlog pós-launch)

### B.1 Motor de Sugestão AI
- Input: draft content + research cards + channel products.
- AI analisa e retorna top-N produtos relevantes com:
  - Score de relevância (0-1)
  - Posicionamento sugerido (após H2 específico)
  - Copy sugerida
  - Rationale
- **Decisão pgvector:** adiado. Com catálogo <100 produtos por canal, mandar tudo pra LLM é viável (~$0.05/draft). pgvector revisita quando catálogo > 100.
- Implementação v2 sem pgvector: Haiku/Flash recebe todos os produtos active + draft, retorna top-5.

### B.2 UI de Sugestões
- Painel lateral no `BlogEditor` com cards de sugestões.
- Ações por sugestão: Aceitar (insere no draft), Editar copy, Rejeitar, Swap produto.

### B.3 Tracking de Performance
- Tabela `affiliate_placements`: draft_id, product_id, position, copy_used, accepted_at.
- Tabela `affiliate_clicks`: placement_id, clicked_at, converted_bool.
- Webhook de comissão por rede — só quando rede passar de $500/mês.
- Dashboard: CTR + conversion por produto, canal, posição.

### B.4 A/B de Copy (fase 3)
- Avaliação de viabilidade postponed para antes do launch público.
- Requer plugin WP ou edge function para split traffic.

### B.5 pgvector (fase 3, se catálogo escalar)
- Coluna `channel_affiliate_products.embedding vector(1536)`.
- Extensão pgvector no Supabase.
- Pipeline: embed draft → cosine similarity → top-20 → LLM final ranking.

---

## Arquivos Afetados (total)

**V1:**
- `supabase/migrations/<ts>_affiliate_catalog.sql`
- `apps/api/src/routes/affiliates/index.ts`
- `apps/app/src/app/(app)/admin/channels/[id]/affiliates/page.tsx`
- `apps/app/src/components/production/BlogEditor.tsx`
- `packages/shared/src/schemas/affiliates.ts`
- `packages/shared/src/mappers/db.ts`

**V2 (backlog):**
- `supabase/migrations/<ts>_affiliate_placements_clicks.sql`
- `apps/api/src/routes/affiliates/suggest.ts`
- `apps/api/src/lib/ai/affiliate-matcher.ts`
- `apps/app/src/components/production/AffiliateSuggestionsPanel.tsx`

---

## Roadmap Resumido

| Fase | Escopo | Prazo |
|------|--------|-------|
| V1 | Catálogo + CSV + placement manual + UTM | Launch 4 Mai |
| V2 | Engine AI (sem pgvector) + tracking completo | 4-8 semanas pós-launch |
| V3 | A/B copy + pgvector (se escalar) | Quando catálogo > 100/canal ou receita > $500/mês |
