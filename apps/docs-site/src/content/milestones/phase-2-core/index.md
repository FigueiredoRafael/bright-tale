# Fase 2 — Core

**Objetivo:** Canais, onboarding, YouTube Intelligence, reference modeling e flow simplificado de criação de conteúdo (texto).

**Specs:** `docs/specs/onboarding-channels.md` + `docs/specs/reference-modeling.md` + `docs/specs/v2-simplified-flow.md`

**Depende de:** Fase 1 (auth, orgs, storage, créditos)

**Progresso:** 10/29 concluídos (F2-001 a F2-009 ✅ · F2-015 ✅ · F2-010 a F2-014 em andamento)

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
🔲 **Não iniciado**

**Escopo:**
- 3 modos no Step 1 do Create Content:
  - **Prompt cego** — campo livre com tema
  - **Fine-tuning avançado** — campos extras (nicho, tom, público, objetivo, restrições)
  - **Guiado por referência** — colar URL (blog/YouTube/podcast) → extrair contexto (scraping + YouTube API já existe)
- Montar `BC_BRAINSTORM_INPUT` automaticamente
- Chamada direta `/api/brainstorm` (Anthropic/OpenAI/Gemini via router)
- Remover fluxo YAML

**Critérios de aceite:**
- [ ] 3 modos funcionais e testáveis
- [ ] Extração de contexto por URL funciona (validar com 3 URLs reais)
- [ ] API call direta retorna ideas parseadas
- [ ] Créditos debitados (50)

---

### F2-017 — Brainstorm: cards de ideia + seleção
🔲 **Não iniciado**

**Escopo:**
- Output em cards por ideia: título, ângulo, veredicto (viável/experimental/fraco), potencial de monetização, ângulos de repurposing
- Clicar confirma seleção, persiste em `ideas` com `brainstorm_session_id` + `channel_id`
- Constrói `BC_RESEARCH_INPUT` automaticamente

**Critérios de aceite:**
- [ ] Cards renderizam todos os campos do output do agent-1
- [ ] Seleção persiste no DB
- [ ] Navegação direta para Step 2 (Research) com idea pré-carregada

---

### F2-018 — Research: níveis + foco configurável
🔲 **Não iniciado**

**Escopo:**
- Seletor de nível: Surface (top 3 fontes, estatísticas básicas) / Medium (5-8 fontes, quotes) / Deep (10+ fontes, contra-argumentos)
- Foco multi-select: estatísticas / expert advice / pro tips / processos validados
- Router de créditos: Surface 60 / Medium 100 / Deep 180
- Chamada direta `/api/research`

**Critérios de aceite:**
- [ ] Nível escolhido altera prompt do agent-2
- [ ] Foco filtra tipo de resultado
- [ ] Créditos debitados conforme nível
- [ ] Teste cobre os 3 níveis

---

### F2-019 — Research: cards tipados + ranking + review humana
🔲 **Não iniciado**

**Escopo:**
- Output em cards por tipo: Fonte (URL, autor, data, relevância), Dado (claim, fonte, contexto), Citação (quote, nome, cargo)
- Ranking por score de relevância + botão "Recomendar os melhores"
- Review humana: aprovar / rejeitar / editar por card antes de avançar
- Salvar aprovados em `research_sessions` + legacy `research_archives`

**Critérios de aceite:**
- [ ] 3 tipos de card renderizados com dados corretos
- [ ] Ranking ordena pelo score do agent
- [ ] Ações approve/reject/edit persistem
- [ ] Só cards aprovados seguem para Step 3

---

### F2-020 — Content: canonical core via API + seletor de mídia
🔲 **Não iniciado**

**Escopo:**
- Geração do Canonical Core via agent-3a (`/api/content/canonical-core`)
- Seletor de mídia: Blog ou Vídeo (determina sub-fluxo)
- Persistir em `content_drafts` com `type` e `canonical_core_json`
- Créditos: 80

**Critérios de aceite:**
- [ ] Canonical core gerado e salvo
- [ ] Seletor direciona para sub-fluxo correto
- [ ] Teste cobre ambos caminhos

---

### F2-021 — Sub-fluxo Blog (geração + assets + review)
🔲 **Não iniciado**

**Escopo:**
- `/api/content/blog` chama agent-3b-blog com canonical core
- Opcional: geração de assets por parágrafo/seção via Gemini Imagen (botão "Gerar imagens")
- Editor inline com review interno do agent-4 (feedback por bloco)
- Export HTML/Markdown
- Créditos: 200 (blog) + 30 por imagem

**Critérios de aceite:**
- [ ] Draft salvo em `content_drafts`
- [ ] Imagens geradas e vinculadas em `content_assets`
- [ ] Review inline renderiza feedback do agent-4
- [ ] Export funciona

---

### F2-022 — Sub-fluxo Vídeo (geração + thumbnail + áudio + review)
🔲 **Não iniciado**

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
🔲 **Não iniciado**

**Escopo:**
- Nova página `apps/web/admin/(protected)/agents/` — lista + editor por agente
- CRUD sobre `agent_prompts` via `GET/PUT /api/agents` (já existem)
- Editor: `instructions`, `input_schema`, `output_schema` (Monaco ou textarea com syntax)
- Versionamento simples: salvar histórico de versões (nova tabela `agent_prompt_versions` ou coluna `previous_instructions_json[]`)
- Preview: rodar um dry-run com input de teste

**Critérios de aceite:**
- [ ] Lista todos os 10 agentes do seed
- [ ] Editar + salvar persiste no DB
- [ ] Histórico de versões acessível
- [ ] Dry-run executa sem debitar créditos

---

### F2-026 — App: remover edição de agentes (só visualização)
🔲 **Não iniciado**

**Escopo:**
- Auditar `apps/app/src/app/(app)/settings/agents/` — edição de prompt deve ser admin-only
- Opções: remover página completamente OU deixar read-only ("Veja as instruções do agente que gera esse conteúdo")
- Decisão de produto: read-only para transparência

**Critérios de aceite:**
- [ ] Usuário final não consegue alterar instructions via app
- [ ] Se read-only, dados vêm via `GET /api/agents` sem expor schemas internos
- [ ] Teste de autorização

---

### F2-027 — Job: ler instructions de agent_prompts (não hardcoded)
🔲 **Não iniciado**

**Escopo:**
- Refatorar `apps/api/src/jobs/content-generate.ts` pra buscar `instructions` do `agent_prompts` por slug (brainstorm, research, production, content-core, blog, video, shorts, podcast, engagement, review)
- Provider layer (`apps/api/src/lib/ai/providers/`) recebe `systemPrompt` via parâmetro, não arquivo estático
- Cache de prompts em memória com TTL curto (5min) pra evitar lookup a cada step

**Critérios de aceite:**
- [ ] Alterar instructions no admin reflete na próxima geração (após TTL)
- [ ] Jobs não referenciam strings hardcoded
- [ ] Teste que mocka DB retornando prompt custom e verifica que é usado

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
