# Fase 2 — Core

**Objetivo:** Canais, onboarding, YouTube Intelligence, reference modeling e flow simplificado de criação de conteúdo (texto).

**Specs:** `docs/specs/onboarding-channels.md` + `docs/specs/reference-modeling.md` + `docs/specs/v2-simplified-flow.md`

**Depende de:** Fase 1 (auth, orgs, storage, créditos)

**Progresso:** 0/14 concluídos

---

## Cards

### F2-001 — Tabela channels + migration
🔲 **Não iniciado**

**Escopo:**
- Criar tabela `channels` (name, niche, market, language, channel_type, is_evergreen, youtube_url, voice config, model config)
- Vincular projects a channels (`projects.channel_id`)
- Zod schemas + types
- RLS (org members only)

**Critérios de aceite:**
- [ ] Migration roda
- [ ] Channel pertence a org
- [ ] Tipos gerados

**Concluído em:** —

---

### F2-002 — API: CRUD de channels
🔲 **Não iniciado**

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

**Concluído em:** —

---

### F2-003 — UI: Dashboard de canais
🔲 **Não iniciado**

**Escopo:**
- Página principal mostra lista de canais do usuário
- Card por canal com: nome, nicho, tipo, stats
- Botões: Abrir, Pesquisar, Gerar Conteúdo
- Botão "+ Novo Canal"

**Critérios de aceite:**
- [ ] Lista canais com info resumida
- [ ] Clicar abre o canal
- [ ] Empty state para 0 canais → direciona para onboarding

**Concluído em:** —

---

### F2-004 — Onboarding wizard (7 telas)
🔲 **Não iniciado**

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

**Concluído em:** —

---

### F2-005 — YouTube Data API: integração base
🔲 **Não iniciado**

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

**Concluído em:** —

---

### F2-006 — YouTube Intelligence: análise de nicho
🔲 **Não iniciado**

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

**Concluído em:** —

---

### F2-007 — Tabela channel_references + reference_content
🔲 **Não iniciado**

**Escopo:**
- Criar tabelas `channel_references` e `reference_content`
- Até 5 referências por canal (por plano)
- Migration + Zod schemas + types

**Critérios de aceite:**
- [ ] Migration roda
- [ ] Limites por plano enforced (Free: 0, Starter: 2, Creator: 5, Pro: 10)

**Concluído em:** —

---

### F2-008 — API: Reference modeling
🔲 **Não iniciado**

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

**Concluído em:** —

---

### F2-009 — UI: Config de canal + referências
🔲 **Não iniciado**

**Escopo:**
- Página `/channels/:id/settings` com config do canal
- Seção "Referências" com lista + campo para adicionar
- Resultado da análise de referências (tabela + padrões)
- Limite visual por plano

**Critérios de aceite:**
- [ ] Adicionar/remover referências funciona
- [ ] Mostra análise com top vídeos e patterns
- [ ] Mostra limite do plano

**Concluído em:** —

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
🔲 **Não iniciado**

**Escopo:**
- Integrar Inngest para background jobs
- Jobs: bulk-generate, youtube-analyze, reference-analyze
- Status endpoint: `GET /api/jobs/:id/status`
- Retry com backoff (3 tentativas)

**Critérios de aceite:**
- [ ] Job roda em background
- [ ] Status endpoint retorna progresso
- [ ] Retry funciona em caso de falha
- [ ] Frontend mostra progress bar

**Concluído em:** —
