# Fase 2 — Core

**Objetivo:** Canais, onboarding, YouTube Intelligence, reference modeling e flow simplificado de criação de conteúdo (texto).

**Specs:** `docs/specs/onboarding-channels.md` + `docs/specs/reference-modeling.md` + `docs/specs/v2-simplified-flow.md`

**Depende de:** Fase 1 (auth, orgs, storage, créditos)

**Progresso:** 19/29 concluídos (F2-001 a F2-009 ✅ · F2-015–F2-018 ✅ · F2-020 ✅ · F2-026 ✅ · F2-027 ✅ · F2-019, F2-021, F2-022, F2-025 🟡 · F2-010 a F2-014 em andamento)

> ⚠️ **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F2-001 — Tabela channels + migration
✅ **Concluído**

**Escopo:**
- Criar tabela `channels` (name, niche, market, language, channel_type, is_evergreen, youtube_url, voice config, model config)
- Vincular projects a channels (`projects.channel_id`)
- Zod schemas + types
- RLS (org members only)

**Critérios de aceite:**
- [ ] Migration roda
- [ ] Channel pertence a org
- [ ] Tipos gerados

**Concluído em:** 2026-04-12

---

### F2-002 — API: CRUD de channels
✅ **Concluído**

**Escopo:**
- `GET /api/channels` — listar canais da org
- `POST /api/channels` — criar canal
- `GET /api/channels/:id` — detalhe
- `PUT /api/channels/:id` — atualizar config
- `DELETE /api/channels/:id` — deletar
- `GET /api/channels/:id/stats` — stats do YouTube (se conectado)

**Critérios de aceite:**
- [ ] CRUD funcional
- [ ] Admin+ pode criar/editar, member só lê
- [ ] Envelope `{ data, error }`

**Concluído em:** 2026-04-12

---

### F2-003 — UI: Dashboard de canais
✅ **Concluído**

**Escopo:**
- Página principal mostra lista de canais do usuário
- Card por canal com: nome, nicho, tipo, stats
- Botões: Abrir, Pesquisar, Gerar Conteúdo
- Botão "+ Novo Canal"

**Critérios de aceite:**
- [ ] Lista canais com info resumida
- [ ] Clicar abre o canal
- [ ] Empty state para 0 canais → direciona para onboarding

**Concluído em:** 2026-04-12

---

### F2-004 — Onboarding wizard (7 telas)
✅ **Concluído**

**Escopo:**
- Wizard progressivo (após primeiro login):
  1. Bem-vindo
  2. Já tem canal? Sim/Não
  3. Se sim: colar URL → análise. Se não: escolher nichos
  4. País + idioma
  5. Tipo de canal (texto / com rosto / dark / híbrido)
  6. Resultado da análise de nicho (se novo)
  7. Nome do canal → criar
- Salvar `user_profiles.onboarding_completed`
- Pular se já fez onboarding

**Critérios de aceite:**
- [ ] Wizard completo funciona
- [ ] Cria canal + org ao final
- [ ] Não aparece se já fez
- [ ] Pode voltar para steps anteriores

**Concluído em:** 2026-04-12

---

### F2-005 — YouTube Data API: integração base
✅ **Concluído**

**Escopo:**
- Configurar YouTube Data API v3 (API key)
- Helper: buscar canal por URL/nome
- Helper: buscar top vídeos por keyword + market + language
- Helper: buscar detalhes de vídeo (views, likes, tags, description)
- Rate limiting da API do YouTube (quota: 10.000 units/day)

**Arquivos:**
- `apps/api/src/lib/youtube/client.ts`
- `apps/api/src/lib/youtube/search.ts`
- `apps/api/src/lib/youtube/channel.ts`

**Critérios de aceite:**
- [ ] Busca canal por URL funciona
- [ ] Top vídeos por keyword retorna dados corretos
- [ ] Respeita quota do YouTube

**Concluído em:** 2026-04-12

---

### F2-006 — YouTube Intelligence: análise de nicho
✅ **Concluído**

**Escopo:**
- `POST /api/youtube/analyze-niche` (keyword, market, language)
- Busca top 20 vídeos nos últimos 30/90 dias
- IA analisa: padrões de título, duração ideal, temas saturados vs oportunidades
- Salva em `youtube_niche_analyses` (cache 7 dias)
- Gasta créditos (150)

**Critérios de aceite:**
- [ ] Retorna top vídeos com métricas
- [ ] IA identifica oportunidades e temas saturados
- [ ] Cache funciona (não refaz se < 7 dias)
- [ ] Debita créditos

**Concluído em:** 2026-04-12

---

### F2-007 — Tabela channel_references + reference_content
✅ **Concluído**

**Escopo:**
- Criar tabelas `channel_references` e `reference_content`
- Até 5 referências por canal (por plano)
- Migration + Zod schemas + types

**Critérios de aceite:**
- [ ] Migration roda
- [ ] Limites por plano enforced (Free: 0, Starter: 2, Creator: 5, Pro: 10)

**Concluído em:** 2026-04-12

---

### F2-008 — API: Reference modeling
✅ **Concluído**

**Escopo:**
- `POST /api/channels/:id/references` — adicionar referência (URL)
- `POST /api/channels/:id/references/analyze` — analisar todas
- `GET /api/channels/:id/references/:refId/content` — top vídeos/posts
- Análise: top vídeos, padrões de título, engagement, transcrição (top 3/5)
- IA extrai patterns do conteúdo de referência

**Critérios de aceite:**
- [ ] Adicionar referência por URL funciona
- [ ] Análise retorna top vídeos + padrões
- [ ] Transcrição (Whisper) dos top 3 funciona

**Concluído em:** 2026-04-12

---

### F2-009 — UI: Config de canal + referências
✅ **Concluído**

**Escopo:**
- Página `/channels/:id/settings` com config do canal
- Seção "Referências" com lista + campo para adicionar
- Resultado da análise de referências (tabela + padrões)
- Limite visual por plano

**Critérios de aceite:**
- [ ] Adicionar/remover referências funciona
- [ ] Mostra análise com top vídeos e patterns
- [ ] Mostra limite do plano

**Concluído em:** 2026-04-12

---

### F2-010 — Flow simplificado: Pesquisa (Step 1-2)
🔲 **Não iniciado**

**Escopo:**
- Nova UI de criação: campo tema + opção de YouTube analysis
- Mostra resultados: top vídeos do nicho + ideias geradas
- Ideias com "Modelado de: [referência]" quando aplicável
- Selecionar ideia + escolher outputs (blog, vídeo, shorts, podcast)

**Critérios de aceite:**
- [ ] Pesquisa por tema funciona
- [ ] YouTube Intelligence integrado (se ativado)
- [ ] Ideias referenciam canal de origem
- [ ] Selecionar outputs funciona

**Concluído em:** —

---

### F2-011 — Flow simplificado: Geração (Step 3)
🔲 **Não iniciado**

**Escopo:**
- Gerar conteúdo texto (blog, roteiro, shorts, podcast) via API de IA
- Modelo por stage (standard routing)
- Progress indicator durante geração
- Resultado: cards com preview de cada output
- Botões: Ver, Editar, Aprovar

**Critérios de aceite:**
- [ ] Gera blog post funcional
- [ ] Gera roteiro de vídeo funcional
- [ ] Model routing funciona (flash para brainstorm, sonnet para production)
- [ ] Debita créditos corretos

**Concluído em:** —

---

### F2-012 — Integração direta com APIs de IA (substituir YAML copy-paste)
🔲 **Não iniciado**

**Escopo:**
- Chamar Claude/Gemini/GPT diretamente via API
- Parsear response automática (sem colar YAML)
- Fallback entre providers (se um falha, tenta outro)
- Config de modelo por stage (standard/premium/ultra/custom)

**Arquivos:**
- `apps/api/src/lib/ai/providers/` (atualizar)
- `apps/api/src/lib/ai/router.ts` (novo: smart model routing)

**Critérios de aceite:**
- [ ] Brainstorm roda via API (sem copy-paste)
- [ ] Research roda via API
- [ ] Production roda via API
- [ ] Review roda via API
- [ ] Fallback funciona

**Concluído em:** —

---

### F2-013 — Bulk generation
🔲 **Não iniciado**

**Escopo:**
- A partir de uma pesquisa, gerar N blog posts ou N roteiros
- `POST /api/content/bulk-generate` (idea_id, formats[], quantity)
- Job queue (Inngest) para processamento
- Progress tracking (status de cada item)
- Limites por plano (Free: ❌, Starter: 3, Creator: 5, Pro: 10)

**Critérios de aceite:**
- [ ] Gerar 4 blog posts de uma pesquisa funciona
- [ ] Progress tracking mostra status de cada
- [ ] Respeita limites do plano
- [ ] Debita créditos por item

**Concluído em:** —

---

### F2-014 — Inngest: setup de job queue
🟡 **Em andamento**

**Escopo:**
- Integrar Inngest para background jobs
- Jobs: bulk-generate, youtube-analyze, reference-analyze
- Status endpoint: `GET /api/jobs/:id/status`
- Retry com backoff (3 tentativas)

**Critérios de aceite:**
- [x] Inngest client criado + `isDev` em desenvolvimento
- [x] `content/generate` event wired
- [ ] Status endpoint
- [ ] Retry e progress bar no frontend

**Concluído em:** —

---

## Phase 2.5 — Migração e refino do workflow de conteúdo

> Migra o pipeline de 5 etapas do legado `bright-curios-automation-workflow` pro monorepo, troca YAML copy-paste por chamadas diretas de API, e implementa a UX por etapa conforme spec da reunião. Ver [memória Phase 2.5 Plan](../../../../../../.claude/projects/-Users-rafaelfigueiredo-projects-bright-labs-bright-tale/memory/project_phase_2_5_plan.md).

### F2-015 — Schema: tabelas do novo pipeline
✅ **Concluído**

**Escopo:**
- Migration criando `brainstorm_sessions`, `research_sessions`, `content_drafts`, `content_assets`; adiciona `brainstorm_session_id` em `idea_archives`
- Todas com `org_id`, `channel_id`, `user_id`, RLS deny-all, trigger `updated_at`
- Zod schemas em `packages/shared/src/schemas/pipeline.ts`
- Mappers + testes em `packages/shared/src/mappers/__tests__/pipeline.test.ts`
- Legacy `blog_drafts`/`video_drafts`/`research_archives` mantidos até F6-009

**Critérios de aceite:**
- [x] Migration roda (20260413050000_phase_2_5_pipeline_tables.sql)
- [x] FKs corretos (idea → brainstorm_session, draft → idea + research_session, asset → draft)
- [x] Types gerados, Zod schemas publicados
- [x] Testes de mapper snake↔camel (4/4 passing)

**Concluído em:** 2026-04-13

---

### F2-016 — Brainstorm: modos de input
✅ **Concluído**

**Escopo entregue:**
- POST/GET `/api/brainstorm/sessions` cria `brainstorm_sessions` row, roda agente, persiste ideias em `idea_archives` com channel_id + brainstorm_session_id, debita 50 créditos
- Página `/channels/[id]/brainstorm/new` com 3 modos (blind / fine_tuned / reference_guided)
- System prompt vem do `agent_prompts` via promptLoader (F2-027)
- 5 testes (auth, validação, happy-path para blind e reference_guided)

**Pendente para futuro card:**
- Extração ativa de conteúdo da URL no modo reference_guided (hoje só repassa pro agente)

**Concluído em:** 2026-04-13

---

### F2-017 — Brainstorm: cards de ideia + seleção
✅ **Concluído**

**Escopo entregue:**
- Cards de ideia na página de brainstorm com badge de verdict (viable/weak/experimental), target audience, ângulo e tags de repurposing
- Cards também aparecem em Create Content via filtro `?channel_id` em `/api/ideas/library` (F2-009 melhorado)
- Picking → redireciona para Create Content (ideia já visível no card "Suas ideias geradas")

**Concluído em:** 2026-04-13

---

### F2-018 — Research: níveis + foco configurável
✅ **Concluído**

**Escopo entregue:**
- POST `/api/research-sessions` aceita `level` (surface/medium/deep) + `focusTags[]` + `topic`/`ideaId`
- Custos por nível: Surface 60 / Medium 100 / Deep 180
- System prompt = base do agent-2 (via promptLoader) + level directive append
- Página `/channels/[id]/research/new` com seletor visual + foco multi-select
- 3 testes (validação de level, happy path, review)

**Concluído em:** 2026-04-13

---

### F2-019 — Research: cards tipados + ranking + review humana
🟡 **Parcial**

**Escopo entregue:**
- Cards renderizam type, title/quote/claim, author, url, relevance
- PATCH `/api/research-sessions/:id/review` salva approved_cards_json + status='reviewed'
- UI permite aprovar/rejeitar (toggle por card) — todos aprovados por padrão

**Pendente:**
- [ ] Botão "Recomendar os melhores" (ordenação por relevance score automática)
- [ ] Edição inline por card
- [ ] Backfill em legacy `research_archives`

**Concluído em:** 2026-04-13 (parcial)

---

### F2-020 — Content: canonical core via API + seletor de mídia
✅ **Concluído**

**Escopo entregue:**
- POST/GET/PATCH `/api/content-drafts` (CRUD + listagem por canal/tipo)
- POST `/api/content-drafts/:id/canonical-core` roda agent-3a (system prompt = `content-core` slug com fallback `production`), debita 80 créditos, persiste em `canonical_core_json`
- Puxa approved cards do `research_sessions` quando draft está linkado
- Seletor de tipo (blog/video/shorts/podcast) na UI

**Concluído em:** 2026-04-13

---

### F2-021 — Sub-fluxo Blog (geração + assets + review)
🟡 **Parcial — geração core entregue**

**Escopo entregue:**
- POST `/api/content-drafts/:id/produce` roda agent-3b-{type} (slug por tipo, com fallback production), persiste `draft_json`, marca status='in_review', debita custo do tipo (blog 200 / video 200 / shorts 100 / podcast 150)
- UI `/channels/[id]/drafts/new` com seletor de formato + pipeline visual (draft → core → produção → done)

**Pendente:**
- [ ] Assets por parágrafo via Gemini Imagen (vincular em `content_assets`)
- [ ] Editor inline do output
- [ ] Review interno via agent-4 (feedback por bloco)
- [ ] Export HTML/Markdown

**Concluído em:** 2026-04-13 (parcial)

---

### F2-022 — Sub-fluxo Vídeo (geração + thumbnail + áudio + review)
🟡 **Parcial — geração core entregue (mesmo endpoint que F2-021)**

**Escopo:**
- `/api/content/video` chama agent-3b-video com seletor de estilo (talking head, documentário, tutorial) + duração alvo
- Opcional: thumbnail via Gemini Imagen
- Opcional: áudio por seção via ElevenLabs ou OpenAI TTS
- Review interno do script via agent-4
- Créditos: 200 + 30 (thumb) + 100/min (ElevenLabs) ou 50/min (OpenAI)

**Critérios de aceite:**
- [ ] Script gerado e salvo
- [ ] Thumbnail opcional funciona
- [ ] Áudio opcional funciona (provider configurável)
- [ ] Review inline funciona

---

### F2-023 — Video preview rich (teleprompter + metadata)
🔲 **Não iniciado**

**Escopo:**
- Roteiro com timestamps, B-roll notes, capítulos
- Teleprompter: modo linha-por-linha, velocidade configurável, fonte grande
- Preview thumbnail
- Player de áudio (se gerado)
- Comentário fixado recomendado (agent-3b-engagement)
- Descrição SEO com keywords + links

**Critérios de aceite:**
- [ ] Teleprompter scroll controlado funciona
- [ ] Todos os metadados renderizam
- [ ] Comentário + descrição gerados via agent-3b-engagement

---

### F2-024 — Publish Blog: taxonomia + scheduling
🔲 **Não iniciado**

**Escopo:**
- Migrar PublishingForm do bright-curios
- Autocomplete de categorias + tags via WordPress REST (`/wp/v2/categories`, `/wp/v2/tags`)
- Datepicker com timezone + scheduling via WordPress (`status=future` + `date`)
- Status de publicação no draft: rascunho / agendado / publicado

**Critérios de aceite:**
- [ ] Publish imediato funciona
- [ ] Agendamento cria post no futuro no WP
- [ ] Taxonomia é aplicada corretamente
- [ ] Teste E2E mockado da WP API

---

### F2-025 — Admin UI: agentes (web/admin)
🟡 **Parcial — versionamento e dry-run pendentes**

**Escopo entregue:**
- Nova rota `apps/web/admin/(protected)/agents/` — lista todos os agentes
- Página de edição por slug com server action (`actions.ts`) que escreve direto via admin client
- Editor com textarea para `instructions`, `input_schema`, `output_schema`
- Item "Agentes" adicionado ao sidebar do admin shell
- Mensagem confirma que cache de 5min será respeitado (F2-027)

**Pendente (próximo passo):**
- [ ] Versionamento (`agent_prompt_versions` ou snapshot em coluna)
- [ ] Dry-run sem debitar créditos
- [ ] Editor com syntax highlight (Monaco)

**Concluído em:** 2026-04-13 (parcial)

---

### F2-026 — App: remover edição de agentes (só visualização)
✅ **Concluído**

**Escopo:**
- `/settings/agents` no app reescrito como read-only (lista + viewer com lock)
- `PUT /api/agents/:slug` agora exige role `admin` (consulta `user_roles` antes de aplicar update)
- Testes do PUT cobrem: sem auth → 401, sem role admin → 403, admin → 200

**Critérios de aceite:**
- [x] Usuário final não consegue alterar instructions via app (UI sem botão de salvar)
- [x] Backend bloqueia (403) se chamar PUT sem role admin
- [x] Testes 13/13 passing em `apps/api/src/__tests__/routes/agents.test.ts`

**Concluído em:** 2026-04-13

---

### F2-027 — Job: ler instructions de agent_prompts (não hardcoded)
✅ **Concluído**

**Escopo:**
- Novo `apps/api/src/lib/ai/promptLoader.ts` — cache in-memory com TTL 5min
- `content-generate.ts` agora carrega prompt por slug (brainstorm, research, content-core, blog, video, shorts, podcast, review) e passa como `systemPrompt` ao provider
- Canonical core rodando como step separado antes de production-{format}
- Fallback para slug da etapa quando variante não está cadastrada (ex: blog → production)

**Critérios de aceite:**
- [x] Alterar instructions no admin reflete na próxima geração (após TTL)
- [x] Jobs não referenciam strings hardcoded (adapter legado mantido mas não usado no job)
- [x] Testes do loader (4/4) cobrindo hit/miss/cache/clear

**Concluído em:** 2026-04-13

---

### F2-028 — Migração: agents + módulos do bright-curios
🔲 **Não iniciado**

**Escopo:**
- Copiar/adaptar `src/lib/modules/{blog,video,shorts,podcast,engagement}/` do legado para `packages/shared/src/modules/` (schemas, mappers, validators, exporters)
- Adaptar imports, remover dependências de Prisma
- Ajustar types ao novo modelo (org_id, channel_id, user_id)

**Critérios de aceite:**
- [ ] Todos os módulos compilam no monorepo
- [ ] Exporters (HTML/MD) passam teste com fixture
- [ ] Validators rodam sobre outputs reais dos agentes

---

### F2-029 — Migração: AI layer + provider routing
🔲 **Não iniciado**

**Escopo:**
- Migrar `src/lib/ai/adapter.ts`, `providers/{anthropic,openai,gemini,mock}.ts`, `promptGenerators.ts`, `imageProvider.ts` para `apps/api/src/lib/ai/`
- Router `getRouteForStage(stage, tier)` já existe — garantir que cobre Surface/Medium/Deep e os 10 agents
- Fallback entre providers (se um falha, tenta o próximo)
- Model tier por etapa: standard (flash/haiku) / premium (sonnet/gpt-4o) / ultra (opus/o1)

**Critérios de aceite:**
- [ ] 4 providers funcionais (anthropic, openai, gemini, mock)
- [ ] Fallback testado (mock com falha → provider real)
- [ ] Router cobre todas as combinações stage × tier
- [ ] Teste integration com 1 call real por provider (skippable via env)
