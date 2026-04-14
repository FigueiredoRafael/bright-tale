# Fase 2 — Core

**Objetivo:** Canais, onboarding, YouTube Intelligence, reference modeling e flow simplificado de criação de conteúdo (texto).

**Specs:** `docs/specs/onboarding-channels.md` + `docs/specs/reference-modeling.md` + `docs/specs/v2-simplified-flow.md`

**Depende de:** Fase 1 (auth, orgs, storage, créditos)

**Progresso:** 34/47 concluídos (substancialmente entregue — pendências: bulk generation, image insertion, WP publish, signals/trends, idempotency)

**(Old progress tag)** 19/29 concluídos (F2-001 a F2-009 ✅ · F2-015–F2-018 ✅ · F2-020 ✅ · F2-026 ✅ · F2-027 ✅ · F2-019, F2-021, F2-022, F2-025 🟡 · F2-010 a F2-014 em andamento)

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
✅ **Concluído (substituído por F2-016/017/018)**

Substituído pelas páginas dedicadas: `/channels/[id]/brainstorm/new` (F2-016), `/channels/[id]/research/new` (F2-018) e a hub `/channels/[id]/create` (refatorada). YouTube Intelligence integrada via `analyze-niche`. Ideias persistem com `channel_id` + `brainstorm_session_id`.

**Concluído em:** 2026-04-13

---

### F2-011 — Flow simplificado: Geração (Step 3)
✅ **Concluído (entregue via F2-020/021/022)**

`/channels/[id]/drafts/new` é a UI de geração. Pipeline visual mostra os 3 passos (draft → canonical core → produção). Suporta blog/video/shorts/podcast com debit de créditos por formato.

**Concluído em:** 2026-04-13

---

### F2-012 — Integração direta com APIs de IA (substituir YAML copy-paste)
✅ **Concluído**

- 4 providers implementados: Anthropic, OpenAI, Gemini, Ollama (local)
- Router (`apps/api/src/lib/ai/router.ts`) com 4 tiers: `local` (Ollama) / `free` (Gemini) / `standard` (Gemini+Anthropic) / `premium` / `ultra`
- `generateWithFallback` — runtime fallback em 429/quota/billing/5xx/network com per-provider retry (apenas pra erros transientes; quota não retenta)
- Brainstorm, Research, Canonical Core, Production, Review todos via API
- 8 testes cobrindo chain construction, retries, fallback paths

**Concluído em:** 2026-04-13

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
✅ **Concluído**

- 4 providers em `apps/api/src/lib/ai/providers/`: anthropic, openai, gemini, ollama
- Router cobre 4 tiers × 4 stages, runtime fallback chain configurável por (provider, model)
- `isProviderFailover` vs `shouldRetrySameProvider` separados — quota não retenta mesmo modelo
- Adapter legado mantido só pra compat; pipeline novo usa `generateWithFallback` direto

**Concluído em:** 2026-04-13

---

### F2-030 — Provider Ollama (AI local)
✅ **Concluído**

- `OllamaProvider` em `apps/api/src/lib/ai/providers/ollama.ts` — talks to local server (default `localhost:11434`)
- Tier `local` mapeia todas as etapas pra `ollama/llama3.1:8b`
- Não exige API key; falha graciosamente se servidor offline
- Free e infinito — ideal pra dev sem queimar quota

**Concluído em:** 2026-04-13

---

### F2-031 — Per-stage ModelPicker + Recommended badges
✅ **Concluído**

- Componente `apps/app/src/components/ai/ModelPicker.tsx` com catálogo: Local (Ollama), Gemini, OpenAI, Anthropic — modelos específicos por provider
- `agent_prompts` ganhou colunas `recommended_provider` + `recommended_model`
- Admin define recomendação em `/admin/agents/[slug]`; app renderiza badge **Recommended**
- Páginas brainstorm + research consomem o recomendado e fazem prefill
- Backend aceita override `provider` + `model` em `/brainstorm/sessions` e `/research-sessions`

**Concluído em:** 2026-04-13

---

### F2-032 — Pipeline orgchart no admin
✅ **Concluído**

- `PipelineGraph` em SVG render coluna-por-coluna: brainstorm → research → core → {blog, video, shorts, podcast, engagement} → review
- Cubic Bezier edges, nodes linkam pro editor, slugs faltantes aparecem com borda tracejada
- Sem dependência nova (Tailwind + SVG puros)

**Concluído em:** 2026-04-13

---

### F2-033 — UserMenu + Profile editing
✅ **Concluído**

- `UserMenu` no topbar substitui o avatar estático: mostra email, links pra Perfil/Settings, "Sair" (Supabase signOut + redirect pra `/auth/login`)
- Nova rota `/settings/profile` edita first/last name via `PATCH /api/users/:id` (email read-only)

**Concluído em:** 2026-04-13

---

### F2-034 — Friendly AI errors + onboarding redirect fix
✅ **Concluído**

- `friendlyAiError(raw)` mapeia falhas de provider pra título + dica acionável (quota → "aguarde 1min ou troque provider"; billing → "adicione crédito ou use Gemini grátis"; overload → "tente em segundos"; etc.)
- `useActiveChannel` distingue "lista vazia" de "fetch falhou" — bug do redirect pra onboarding em loop resolvido

**Concluído em:** 2026-04-13

---

### F2-035 — Dev script + README de setup
✅ **Concluído**

- `npm run dev` agora sobe app + api + web + docs + inngest + ollama em paralelo (Ollama gracefully skip se não instalado)
- README reescrito do zero: prerequisites, env files, db push, Ollama models, AI provider matrix, troubleshooting

**Concluído em:** 2026-04-13

---

### F2-036 — Geração assíncrona com modal de progresso em tempo real (brainstorm + research + production)
✅ **Concluído**

Implementado end-to-end pros 3 stages (validado com Ollama + Gemini):
- Migration `job_events` + helper `emitJobEvent`
- Inngest functions: `brainstormGenerate`, `researchGenerate`, `productionGenerate` (canonical-core → produce → review em 3 steps)
- `POST /brainstorm/sessions`, `POST /research-sessions`, `POST /content-drafts/:id/generate` retornam 202 em ~1s
- `GET /{session}/events` — SSE stream com filtro `?since=<iso>` pra ignorar eventos de runs anteriores
- Hook `useJobEvents` + `GenerationProgressModal`: log cronológico, duração por step, warning de stall após 60s
- Auto-navega pra página do draft/session on complete/fail

**Concluído em:** 2026-04-13

---


### F2-038 — Research: picker de ideias existentes + pré-preenchimento
✅ **Concluído**

- Novo componente `IdeaPickerModal` (lista filtrável por título/público, badges de verdict)
- Link "Escolher ideia existente" ao lado do label Tema
- Seleção → preenche topic + guarda `selectedIdeaId` no payload
- Query param `?ideaId=X` agora faz fetch da ideia e pré-preenche Tema

**Concluído em:** 2026-04-13

---

### F2-040 — Create Content hub: tabs + arquivamento de itens usados
✅ **Concluído (v1)**

`/channels/[id]/create` agora tem 3 abas: **Ideias** · **Pesquisas** · **Conteúdo**.

- Cada aba tem busca por título/tema
- Ideias e pesquisas que já viraram `content_drafts` são automaticamente **arquivadas** (ocultas por padrão), com toggle "Mostrar arquivadas (N)" — evita gerar conteúdo duplicado
- Aba Conteúdo agrupada por formato (Blog/Vídeo/Shorts/Podcast) com ícone e cor por tipo
- Cards de conteúdo levam pra `/drafts/:id` (página dedicada)

Cards visuais ricos por formato (hero blog, thumb vídeo, ondinha podcast, etc.) ficam pra v2 quando essas pages forem polidas.

**Concluído em:** 2026-04-13

---

### F2-041 — Drafts/new: remover input de Título redundante
✅ **Concluído**

Ao escolher uma pesquisa, o title da pesquisa virou o título do conteúdo. Não precisa pedir pro usuário re-digitar. Substituído o campo `<Label>Título</Label> + <Input>` por uma linha "**Tema:** _\<título\>_ [editar]" que abre input inline ao clicar.

**Concluído em:** 2026-04-13

---

### F2-048 — Contexto do canal nos agentes (idioma, tom, presentation_style)
✅ **Concluído**

Antes: vídeo de canal pt-BR saía em inglês. Agentes não tinham contexto do canal.

- Nova coluna `channels.presentation_style` (talking_head | voiceover | mixed)
- Todos os jobs (brainstorm/research/production) buscam o canal e injetam
  `channel: { name, niche, language, tone, presentation_style }` no input do agente
- Migration do prompt exige: output NO idioma do channel.language; tom adaptado;
  talking_head usa cues `[lean forward]`, voiceover/faceless produz prosa limpa
  estilo audiobook (vírgulas pra breath, reticências pra pausa) — pronta pra
  ElevenLabs TTS sem pós-processamento

**Concluído em:** 2026-04-13

---

### F2-049 — Token usage tracking & cost dashboard
✅ **Concluído**

- Provider interface com `lastUsage?: TokenUsage` — Anthropic/OpenAI/Gemini/Ollama populam após cada call
- `lib/ai/pricing.ts` — USD por 1M tokens por modelo (Ollama = $0)
- `lib/ai/usage-log.ts` — `logUsage()` grava em `usage_events` (one row por AI call)
- Migration `usage_events` (org_id, user_id, channel_id, stage, sub_stage, session_id/type, provider, model, input_tokens, output_tokens, cost_usd)
- `generateWithFallback` retorna `usage` junto com result
- Jobs registram uso em todos os pontos (brainstorm + research + production.core + production.produce + production.review)
- `GET /usage/summary?days=N` — totais + groupings (provider/stage/model/day)
- UI `/settings/usage` — 4 stat cards (calls, tokens in, tokens out, custo USD+BRL) + 4 breakdown cards com barras proporcionais

**Concluído em:** 2026-04-13

---

### F2-045 — Vídeo: roteiro de teleprompt + roteiro do editor
✅ **Concluído**

Output do agente de vídeo era um JSON solto sem separação clara. Atualizado:
- `teleprompter_script`: roteiro limpo, só falas (sem cues), pronto pra teleprompter
- `editor_script`: briefing pra editor com A-roll, B-roll com timestamps, lower-thirds, SFX, BGM, efeitos visuais, transições, pacing, color — escrito como um chief editor guiando um editor júnior
- Migration `20260413080000_video_agent_dual_script.sql` apenda a directive ao prompt existente
- Página do draft renderiza ambos: teleprompter como artigo legível, editor_script em card próprio com font-mono

**Concluído em:** 2026-04-13

---

### F2-044 — Wizard de criação contínuo (Brainstorm → Pesquisa → Conteúdo)
✅ **Concluído (v1: nav contínua + stepper)**

Antes: depois do brainstorm voltava pra Create Content (perdia contexto). Depois da pesquisa, idem. Usuário tinha que recomeçar o setup do próximo passo manualmente.

Agora:
- **Brainstorm** → clicar numa ideia leva pra `/research/new?ideaId=X` (idea pré-selecionada)
- **Pesquisa** → "Aprovar cards" leva pra `/drafts/new?researchSessionId=X` (research pré-selecionada)
- **Stepper visual** no topo das 3 páginas mostra Ideia → Pesquisa → Conteúdo, com check verde nos completos

v2 (futuro): wizard single-page com state shared entre os steps (sem navegação) pra permitir voltar/editar steps anteriores.

**Concluído em:** 2026-04-13

---

### F2-042 — Drafts: imagens do post (hero + inline) + posicionamento visual
🔲 **Não iniciado**

Hoje a página do draft só mostra texto. Adicionar:
- Botão "Gerar imagem hero" → chama image provider configurado em Settings (F1-XX)
- Sugestão automática de N imagens inline com prompts derivados do conteúdo
- Drag-and-drop pra reposicionar (hero, depois do parágrafo X, etc.)
- Preview do post com imagens no lugar
- Persistir image refs em `content_assets` linkado ao draft

**Concluído em:** —

---

### F2-043 — Drafts: WordPress publish a partir de content_drafts
🔲 **Não iniciado**

`/api/wordpress/publish` hoje só aceita `project_id` (pipeline legado). Refatorar pra também aceitar `draftId` e mapear `content_drafts.draft_json` → payload do WP. "Publicar" no draft atual só seta status='published' (sinalização manual).

**Concluído em:** —

---

### F2-039 — Research: sinais de decisão (Google Trends + YouTube Intelligence)
🔲 **Não iniciado**

Pesquisa hoje volta texto corrido. Pra decidir se vale produzir o conteúdo, usuário precisa de sinais quantitativos. Adicionar card "Sinais do nicho" no output do research (Medium/Deep):
- 📈 **Google Trends** 12m (subindo/estável/caindo + gráfico sparkline) via `google-trends-api` (free)
- 🎥 **YouTube Intelligence** — top 3 vídeos, avg views/likes, tópicos recorrentes (`/api/youtube/analyze-niche` já existe)
- 🔥 Queries relacionadas (do Google Trends)
- 💡 Recomendação: "Momento ideal" vs "Nicho saturado" baseado em trend + competição YouTube

**Arquivos:**
- `apps/api/src/lib/signals/trends.ts` (novo) — wrapper Google Trends
- `apps/api/src/routes/research-sessions.ts` — chamar trends + youtube em paralelo
- `apps/app/src/components/research/NicheSignalsCard.tsx` (novo)

**Concluído em:** —

---

### F2-037 — Brainstorm: contagem fixa, idempotência e seleção de ideias
🔲 **Não iniciado**

**Problemas atuais (descobertos em 2026-04-13):**

1. **Volume descontrolado:** prompt diz "Be thorough" sem cap → modelo gera 15-20 ideias quando o usuário só queria ~5. Polui banco e UI.
2. **Idempotência ausente:** se o request é retentado (proxy timeout, fallback chain, F5 do navegador), múltiplos batches são persistidos pra mesma sessão. Vimos 25+ ideias salvas após 1 click + erro de quota.
3. **Sem seleção:** todas as ideias geradas vão direto pro `idea_archives`. Usuário não pode escolher só as 3-5 que interessam — tem que deletar uma a uma.
4. **Erro mascarado:** quando o provider falha mas o fallback parcial salva algo, o frontend mostra erro "INTERNAL" sem revelar que houve dados gerados.

**Escopo:**

- **Cap de ideias:** UI tem campo `Quantas ideias gerar?` (default 5, range 3-10). Backend valida e injeta no prompt: `"Generate exactly ${count} ideas. Do not generate more or fewer."`
- **Idempotência:**
  - Frontend gera `idempotencyKey` (UUID) por click, manda no header `X-Idempotency-Key`
  - Backend: tabela `brainstorm_runs(idempotency_key UNIQUE, session_id, status, result_json)` — se a key já existe, retorna o resultado anterior em vez de re-rodar
  - Mesmo com retries internos do `generateWithFallback`, só 1 batch é persistido (deduplicação por key)
- **Modo "draft" antes de salvar:**
  - Geração nova vai pra `brainstorm_drafts` (tabela temporária, não em `idea_archives`)
  - UI mostra ideias como cards com checkbox; usuário marca quais quer salvar
  - Botão "Salvar selecionadas (N)" → move só as marcadas pra `idea_archives`
  - "Descartar tudo" → limpa o draft, devolve créditos NÃO (já gastou IA)
  - Drafts expiram em 24h
- **Erro coerente:** se geração teve sucesso parcial, retorna `{data: {ideas, partial: true}, error: {message, code: 'PARTIAL_SUCCESS'}}` — frontend mostra ideias E aviso ("Geramos só 3 das 5 pedidas — quota Gemini")

**Arquivos novos/alterados:**
- `supabase/migrations/YYYYMMDDHHMMSS_brainstorm_drafts_and_runs.sql`
- `packages/shared/src/schemas/brainstorm.ts` — adicionar `count?: number` (3-10)
- `apps/api/src/lib/idempotency.ts` (novo) — middleware de idempotency-key
- `apps/api/src/routes/brainstorm.ts` — usar drafts + idempotency
- `apps/api/src/routes/brainstorm-drafts.ts` (novo) — endpoints `GET/POST/DELETE`
- `apps/app/src/app/(app)/channels/[id]/brainstorm/new/page.tsx` — campo count + idempotency-key
- `apps/app/src/components/brainstorm/IdeasDraftPicker.tsx` (novo) — checkbox UI

**Critérios de aceite:**
- [ ] UI tem campo "Quantas ideias?" (slider ou input, 3-10)
- [ ] Backend gera exatamente N (±1 tolerância) ideias
- [ ] Mesma idempotency-key chamada 2x retorna o mesmo resultado, sem re-rodar IA
- [ ] Ideias geradas vão pra draft, não pra `idea_archives`
- [ ] Usuário seleciona com checkbox e clica "Salvar selecionadas"
- [ ] Drafts expiram em 24h (cron Inngest)
- [ ] Sucesso parcial mostra ideias + aviso amigável
- [ ] Testes: idempotency, cap de count, draft → archive flow

**Estimativa:** 1-2 dias

**Concluído em:** —
