# Handoff para Desenvolvedor — BrightTale Launch 8 Mai

**Para:** Dev encarregado da execução
**De:** Founder + Claude (assistente de planejamento)
**Data:** 2026-04-20
**Prazo:** 8 Mai (18 dias, solo dev)

---

## 1. O que tu precisa saber antes de qualquer coisa

### O projeto em 1 minuto

**BrightTale** é um SaaS que gera conteúdo (blog posts, roteiros de vídeo/shorts, podcasts) usando IA em pipeline de 6 etapas:

```
Brainstorm → Research → Draft → Review → Assets → Publish (WordPress)
```

Founder usa pra dogfooding: blog **Bright Curios** + canal YouTube Bright Curios. O launch dia 8 Mai é **interno** (dogfooding + 1 convite), **não é launch público**. Isso baixa a barra de exigência pra coisas como CI/CD, E2E completo, PostHog events — tudo fica pra depois.

### Stack (resumo)

- **Monorepo:** npm workspaces.
- **`apps/app`** (port 3000) — UI Next.js 16 App Router + React 19.
- **`apps/api`** (port 3001) — rotas Next.js, usa Supabase `service_role` (bypass RLS).
- **`apps/web`** (port 3002) — landing.
- **`packages/shared`** — tipos, schemas Zod, mappers snake_case↔camelCase.
- **Supabase** — Postgres + Auth + Storage. 18+ tabelas. RLS ativo em todas (deny-all, só service_role lê).
- **Inngest** pra jobs assíncronos (AI generation).
- **Stripe** pronto no código, sem Products criados ainda (e não vamos criar — dogfooding não tem checkout).

### Regras não-negociáveis

Estas estão em `CLAUDE.md` e em `.claude/rules/*.md`, leia antes de codar:

1. **Envelope `{ data, error }`** em toda resposta de API. Sem exceção.
2. **Zod schemas** em `packages/shared/src/schemas/` pra validar request/response.
3. **Mappers** em `packages/shared/src/mappers/db.ts` pra converter snake↔camel.
4. **Após qualquer migration:** `npm run db:push:dev` + `npm run db:types` pra regenerar tipos.
5. **Segurança:** `INTERNAL_API_KEY` injetado pelo middleware de `apps/app` antes de rewrite para `apps/api`. Nunca expor ao browser.
6. **Sem `any`, sem non-null assertion `!`**, sem `console.log` em commit.

---

## 2. Por que o plano está assim (a lógica)

### Por que dogfooding antes de launch público

- **Você é o melhor beta tester.** O founder vai usar pra Bright Curios todo dia. Bugs aparecem rápido.
- **Zero risco financeiro.** Sem usuários pagantes = sem SLA, sem refund, sem pressão.
- **Itera sem ansiedade.** Feature que quebra não vira incidente público.

### Por que a ordem dos MUST DO é essa

Cada item depende dos anteriores ou habilita os próximos:

1. **D1 — Validar `primaryKeyword` dos agentes** vem primeiro porque é **precondição** do P6 (Alt text). Se o agente não emite `primaryKeyword`, a geração de alt text SEO fica sem insumo. 1 dia de cola que destrava o dia 10.

2. **D2-4 — Credits hold/reserve** vem cedo porque é **segurança financeira**. Auditoria externa confirmou race condition: dois requests concorrentes conseguem passar o check antes de um debitar. Hoje tu é single user, mas mesmo tu pode disparar 2 requests paralelos e ir negativo. Fix agora antes de convidar qualquer pessoa.

3. **D5-9 — WP-per-channel + channel_members** é o maior, vem no meio. Modela o mundo real: Bright Curios tem canal blog + canal YouTube, cada um pode ter WordPress diferente (blog WP, YT não usa WP). Hoje config é user-scoped (cada user tem 1 WP). Vai virar channel-scoped (cada canal tem 1 WP, podendo trocar, e com N editores acessando).

4. **D10-11 — Alt text on-publish** só entra depois de (1) validar keyword e (3) WP-per-channel estar estável — porque alt text usa keyword + config de canal.

5. **D12-13 — WP e2e test** valida o caminho crítico (draft → publish) depois dos itens que tocam WP estarem prontos. Sem esse teste, tu não sabe se quebrou alguma coisa.

6. **D14-17 — Affiliates V1** vem por último porque é o único que **não bloqueia** nada. Isolado do pipeline principal. Se slipar, slipou — dá pra viver com placement manual como hoje.

7. **D18 — Smoke + deploy** é o buffer mínimo.

### Por que cortamos tanta coisa

Founder decidiu focar em **qualidade de uso interno** em vez de infraestrutura de escala. Corte específicos:

- **Kanban board interno** → pós-launch. Bonito de ter, mas não muda capacidade de gerar conteúdo.
- **Autopilot evoluído** → o autopilot atual já funciona. Melhorias (retry adaptativo, telemetria, drawer) ficam pro pós-launch.
- **Assets fast ingest** → dor real (upload lento) mas contornável. Founder aguenta por 2 semanas.
- **pgvector + engine AI de afiliados** → catálogo terá <50 produtos. LLM-direto resolve. pgvector só compensa > 100 produtos.
- **GitHub Actions / CI** → founder faz deploy manual. Sem CI é viável pra dogfooding.
- **Playwright E2E completo** → só smoke tests manuais. Founder mesmo escreve eventualmente.
- **PostHog events** → sem usuários externos escaláveis, analytics é ruído.
- **Stripe Products no Dashboard** → sem cobrança em dogfooding.
- **Video editor + FFmpeg worker** → founder exporta roteiro e edita em CapCut. Vida normal.
- **YouTube upload OAuth** → founder faz upload manual.

**Princípio:** tudo que não mexe no pipeline principal de blog ou no meu uso diário, fica pro pós-launch.

### Por que não pegar mais coisa

Timeline conta com **1 dev em 18 dias reais**. Estimativa é 18 dias de trabalho. Buffer = zero. Qualquer feature extra atrasa launch. Se algo está muito fácil e sobra tempo, SHOULD DO tem lista priorizada.

---

## 3. As 6 Tarefas MUST DO — Detalhamento

Pra cada uma, há um spec completo em `docs/superpowers/specs/2026-04-20-*.md`. O que tá abaixo é sumário executivo pra tu se orientar.

### Tarefa 1 — Validar `primaryKeyword` nos agentes (D1, 1d)

**O quê:** os agentes 2 (Research) e 3 (Draft) precisam emitir `primaryKeyword` no output YAML. Hoje provavelmente não emitem.

**Por quê:** alt text SEO do dia 10 precisa desse campo pra gerar descrições otimizadas.

**Como:**
1. Rodar 1 pipeline completo (brainstorm → research → draft) e capturar output YAML.
2. Procurar campo `primaryKeyword` / `seo.primaryKeyword` / `seoKeyword`.
3. Se não existe: editar `agents/agent-2-research.md` e `agents/agent-3-draft.md`, adicionar no schema de saída.
4. Atualizar `packages/shared/src/types/agents.ts` — schemas `BC_RESEARCH_OUTPUT` e `BC_DRAFT_OUTPUT` pra incluir `seo.primaryKeyword: string`.
5. Atualizar mappers e storage (onde o output é persistido) pra preservar o campo.
6. Rodar novo pipeline, validar que campo aparece e persiste.

**Aceite:** `draft_json.seo.primaryKeyword` aparece no DB após gerar 1 draft.

---

### Tarefa 2 — Credits hold/reserve + FOR UPDATE (D2-4, 3d)

**O quê:** atualmente em `apps/api/src/lib/credits.ts`, `checkCredits()` lê balance, retorna, job enfileira, AI roda, `debitCredits()` debita depois. Entre check e debit, outro request pode passar check também. Dois passam. Balance vai negativo.

**Por quê:** audit externa confirmou race. Mesmo single-user tem risco (paralelismo natural do pipeline).

**Como:**
1. Adicionar coluna `credit_balances.reserved BIGINT DEFAULT 0` (ou tabela nova `credit_reservations` — decidir).
2. `checkCredits()` vira `reserveCredits(orgId, amount)`: inicia transação, `SELECT ... FOR UPDATE` no row do balance, se `available - reserved >= amount`, `reserved += amount` e retorna token de reserva.
3. Job executa. Se sucesso: `commitReservation(token)` → `spent += amount`, `reserved -= amount`. Se falha: `releaseReservation(token)` → `reserved -= amount`.
4. Adicionar limpeza de reservas órfãs: cron que libera reservas com idade > timeout (ex: 10min).
5. Testes: simular 2 requests concorrentes com balance apertado — só um deve passar.

**Aceite:** 2 requests paralelos com balance 100 e custo 60 cada → só 1 passa. Balance nunca negativo.

**Arquivos:** `apps/api/src/lib/credits.ts`, nova migration, jobs em `apps/api/src/jobs/*` pra chamar commit/release nos caminhos de sucesso/erro.

---

### Tarefa 3 — WP-per-channel + channel_members (D5-9, 5d)

**O quê:** migrar de "WP config por usuário" para "WP config por canal, com N editores".

**Por quê:** founder gerencia múltiplos canais (Bright Curios blog, podcast futuro, etc). Cada canal publica em WP diferente. E vai ter editores no time (outra pessoa escrevendo, founder revisa).

**Como:**

1. **Migration nova** — `supabase/migrations/<ts>_channel_members_wp_migration.sql`:
   - Tabela `channel_members` (channel_id, user_id, role enum [owner, editor, viewer], added_at, added_by_user_id). Unique (channel_id, user_id).
   - Adicionar coluna `wordpress_configs.created_by_user_id` (copiando valor atual de `user_id`).
   - `channels.wordpress_config_id` — já existe FK nullable. Garantir que é a fonte de verdade.
   - Backfill: para cada canal existente (Bright Curios), adicionar row em `channel_members` com `user_id` do owner e `role='owner'`.
   - Rodar `npm run db:push:dev` + `npm run db:types`.

2. **Schemas/mappers** — `packages/shared/src/schemas/channels.ts` + mappers.

3. **API routes** — `apps/api/src/routes/wordpress.ts`:
   - Requests agora aceitam `channel_id` em vez de filtrar por `user_id`.
   - Middleware de permissão: lê `channel_members`, checa role do requester.
   - Matriz de permissão (detalhada no spec WP):
     - `viewer`: lê metadata.
     - `editor`: lê password, publica.
     - `owner`: tudo + gerencia membros + swap WP config.

4. **UI** — settings do canal em `apps/app/src/app/(app)/channels/[id]/settings/page.tsx` (ou equivalente):
   - Form de WP config.
   - Lista de membros + add/remove (só owner).
   - Modal de "trocar WP config" (só owner).

5. **Publish flow** — rota de publish passa a receber `channel_id`, busca o `wordpress_config_id` ativo do canal.

**Aceite:**
- Bright Curios canal existente continua funcionando (backfill correto).
- Founder pode adicionar "editor@test.com" como editor, editor vê config mas não pode deletar.
- Editor publica com sucesso usando WP do canal.
- Swap de WP config registra histórico (se optarmos por `channel_wordpress_history`, ver spec).

**Spec detalhado:** `2026-04-20-wordpress-per-channel.md` (leia as AMENDMENTS no topo).

---

### Tarefa 4 — Alt text on-publish (D10-11, 2d)

**O quê:** hoje alt text existe (salvo em `assets.alt_text`), mas fallback é título do blog = SEO ruim. Quando vazio, gerar automaticamente no momento do publish.

**Por quê:** blog Bright Curios precisa de SEO sólido. Alt texts duplicados ou "imagem de X" são penalidade.

**Como:**

1. **Migration** — `alt_text_source` enum em `assets`: `'ai' | 'manual' | 'fallback' | 'auto_on_publish'`.
2. **Route nova** — `POST /api/assets/:id/generate-alt-text`:
   - Input: `articleContext` (title + keyword + H2 próximo).
   - Chama Gemini Flash vision (hardcoded via env `ALT_TEXT_VISION_MODEL=gemini-flash`).
   - Retorna alt text (≤125 chars, não começa com "Imagem de", keyword ≤ 1x).
3. **Publish flow** — em `apps/api/src/routes/wordpress.ts`, antes do `stitchImagesAfterH2`:
   - Iterar imagens do post.
   - Se `alt_text` vazio ou igual ao blog title: chamar `generate-alt-text` passando contexto.
   - Salvar `alt_text_source = 'auto_on_publish'`.
4. **Validação SEO:** warnings inline no `AssetsEngine` (UI), permite override.

**Aceite:** publicar post com 3 imagens sem alt → WP recebe 3 alts únicos e descritivos. Post publicado novamente usa os alts já salvos (não regenera).

**Spec detalhado:** `2026-04-20-image-alt-text-seo.md`.

---

### Tarefa 5 — WordPress publish e2e test (D12-13, 2d)

**O quê:** teste automatizado que roda pipeline inteiro contra uma instância WP real (sandbox) e valida que:
- Post é criado no WP com título, conteúdo, imagens, alt texts, afiliado link.
- Categories e tags setados.
- Publicado (não draft).

**Por quê:** sem esse teste, qualquer mudança pode quebrar publish silenciosamente.

**Como:**

1. Setup WP sandbox — `docker-compose` com WordPress + MySQL local, ou conta wordpress.com trial.
2. Teste em `apps/api/src/routes/__tests__/wordpress-e2e.test.ts`:
   - Cria project + brainstorm + research + draft completo.
   - Gera 2 imagens (ou usa fixtures).
   - Chama publish endpoint.
   - Assertiva: GET no WP API confirma post existe + metadata correta.
3. Skip por default em CI (não tem WP). Rodar manual com `WP_E2E=1 npm run test:api`.

**Aceite:** `WP_E2E=1 npm run test:api` passa em <60s.

---

### Tarefa 6 — Affiliates V1 (D14-17, 4d)

**O quê:** CRUD de catálogo de produtos afiliados por canal + CSV import + dropdown no BlogEditor.

**Por quê:** founder quer sugerir afiliados em posts sem copiar URL toda vez. Catálogo central resolve.

**Como:**

1. **Migration** — `channel_affiliate_products` (channel_id, name, url, description, commission_rate, tags[], keywords[], active, notes).
2. **API** — `apps/api/src/routes/affiliates/index.ts`:
   - `GET/POST /api/channels/:id/affiliates`
   - `PUT/DELETE /api/channels/:id/affiliates/:productId`
   - `POST /api/channels/:id/affiliates/import` — multipart CSV.
3. **Admin UI** — `apps/app/src/app/(app)/admin/channels/[id]/affiliates/page.tsx` — lista + form + CSV upload.
4. **BlogEditor** — adicionar dropdown "Selecionar produto do catálogo" que preenche `product_link_placeholder` + metadata.
5. **UTM** — quando publish adiciona `?utm_source=brighttale&aff={product_id}` no link publicado.

**Aceite:**
- CSV com 50 produtos importa em <5s.
- BlogEditor mostra produtos do canal atual num dropdown.
- Link publicado no WP tem UTM.

**Spec detalhado:** `2026-04-20-affiliate-suggestions.md` (só a PARTE A — V1).

---

## 4. Estratégia de Execução — Paralelização Via Agentes

Aqui entra a parte interessante.

O founder usa **Claude Code com agentes em background**. Em vez de implementar tudo sequencialmente, a ideia é:

- **Tarefas independentes** (ex: Tarefa 2 Credits + Tarefa 6 Affiliates não tocam mesmos arquivos) → rodam em **agentes paralelos em background**.
- **Tarefas dependentes** (ex: Tarefa 4 Alt text precisa da Tarefa 1 feita) → sequenciais.

Na prática, o founder vai disparar um agente de background pra cada MUST DO item que pode rodar isolado, cada um num worktree git separado (`isolation: worktree`), e mergiar as branches no final quando passam os testes.

**Ordem prática após tua aprovação:**

1. Agente A → Tarefa 1 (validação keyword agents) — rápido, 1d.
2. Quando A termina, Agente B (Credits) + Agente C (WP-per-channel) em **paralelo** — independentes.
3. Quando B e C terminam, Agente D (Alt text) + Agente E (WP e2e) + Agente F (Affiliates) em **paralelo**.
4. Review + merge + smoke.

Tu recebe: reviews dos PRs gerados pelos agentes. Tu valida lógica, aprova ou pede ajuste.

**Caveats da paralelização:**
- Quando dois agentes tocam mesmo arquivo, vira conflito de merge — evitamos fazendo agentes em **domínios diferentes** (Credits=backend lib, Affiliates=novo namespace, WP-per-channel=migrations+routes+UI de canal).
- Migrations em paralelo precisam de timestamps diferentes — óbvio, mas atenção.
- `packages/shared/src/schemas/` é área de conflito potencial. Agentes adicionam arquivos novos, não editam o mesmo.

---

## 5. O que preciso de ti agora

Antes de sair codando, preciso que **tu leia e reaja**.

### Checklist de revisão

- [ ] Li o `CLAUDE.md` e as regras em `.claude/rules/*.md`.
- [ ] Li os 6 specs individuais em `docs/superpowers/specs/2026-04-20-*.md`.
- [ ] Li o `2026-04-20-MASTER-readiness-audit.md` (visão geral).
- [ ] Entendi por que cada MUST DO está na posição que está.
- [ ] Entendi o que foi cortado e por quê.
- [ ] Entendi como a execução paralela via agentes vai funcionar.

### Perguntas que preciso que tu responda

1. **Estimativas de esforço** (Credits 3d, WP 5d, Alt text 2d, e2e test 2d, Affiliates 4d, total 18d): alguma tu acha subestimada? Em qual tu tem dúvida?

2. **Dependências entre tarefas:** tu vê alguma dependência escondida que eu perdi? (Ex: "se Affiliates precisa de alteração em BlogEditor e Alt text também, eles conflitam.")

3. **Trade-offs de arquitetura:**
   - Em Credits: aceita hold/reserve pattern ou prefere só `FOR UPDATE` sem reserve? (Trade-off: hold é mais seguro, mais código.)
   - Em WP-per-channel: faz tabela `channel_wordpress_history` pra audit de swaps, ou só guarda no `updated_at` + logs Axiom?
   - Em Affiliates V1: CSV upload real ou só JSON paste v1?

4. **Agent execution:** tu se sente confortável revisando PRs gerados por agentes, ou prefere escrever tudo tu mesmo? Founder pode ajustar o modelo.

5. **Mudanças no escopo:** algo no MUST DO tu cortaria? Algo no SHOULD DO tu promoveria?

6. **Ambientes:** tem acesso ao Supabase dev project? Ao Stripe dashboard (mesmo que não vá usar)? Ao WP sandbox pra e2e test?

7. **Dúvidas abertas:** qualquer coisa que ficou vaga ou que faz tu ficar desconfortável de começar.

---

## 6. Como tu responde

Escreve uma mensagem (ou comentário neste arquivo, se preferir) respondendo o checklist + as 7 perguntas. Depois:

- **Se tu aprova o plano como está:** founder dispara os agentes. Ação começa.
- **Se tu quer ajustes:** founder + Claude revisam o master doc, ajustam, e tu reaprova.
- **Se tu quer escrever tudo solo sem agentes:** tudo bem também. Ajustamos a estratégia.

---

## 7. Links de referência

- **Master doc:** `docs/superpowers/specs/2026-04-20-MASTER-readiness-audit.md`
- **Audit externo verificado:** mesmo master doc, seção 3.
- **Inventário do projeto:** mesmo master doc, seção 2.
- **Specs individuais:**
  - `2026-04-20-wordpress-per-channel.md` (com AMENDMENTS no topo)
  - `2026-04-20-image-alt-text-seo.md`
  - `2026-04-20-affiliate-suggestions.md` (ler só PARTE A — V1)
  - `2026-04-20-assets-fast-ingest.md` (pós-launch, FYI)
  - `2026-04-20-autopilot-plan.md` (pós-launch, FYI)
  - `2026-04-20-pipeline-stage-collapse.md` (SHOULD DO se sobrar tempo)
  - `2026-04-20-kanban-board-design.md` (pós-launch, FYI)
- **Código:**
  - `CLAUDE.md` (raiz) — visão geral + comandos
  - `.claude/rules/*.md` — regras por tipo de arquivo
  - `supabase/migrations/` — schema atual
  - `packages/shared/src/` — tipos compartilhados

---

**Aguardo tua revisão. Sem pressa pra aprovar — pressa pra começar depois que aprovar.**
