# BrightTale — Especificação do Produto

> Documento de referência para regras de negócio, arquitetura e lógica do sistema.
> Última atualização: 2026-04-11

---

## 1. Visão Geral

**BrightTale** é uma plataforma de geração de conteúdo com IA para criadores que precisam produzir blogs e vídeos do YouTube em larga escala sem perder qualidade.

### O que gera

| Mídia | Variantes | Status |
|---|---|---|
| **Blog** | SEO-optimizado + afiliados | ✅ Implementado |
| **Vídeo YouTube** | Canal normal, canal dark, cursos | ✅ Parcial (falta dark/cursos) |
| **Shorts** | YouTube Shorts / Reels | ✅ Implementado |
| **Podcast** | Roteiro + talking points | ✅ Implementado |
| **Engagement** | CTAs, hooks sociais | ✅ Implementado |

### Proposta de Valor

1. Usuário define tema → IA gera conteúdo completo multi-formato
2. Pipeline automatizado (sem copiar/colar YAML manualmente)
3. Publicação direto no WordPress/YouTube
4. Poucos cliques — feito para leigos

---

## 2. Arquitetura do Monorepo

```
bright-tale/
├── apps/
│   ├── app/          ← UI principal (Next.js 16, porta 3000)
│   ├── api/          ← API (Next.js Route Handlers, porta 3001)
│   └── web/          ← Landing page (porta 3002)
├── packages/
│   └── shared/       ← Tipos, schemas Zod, mappers
├── agents/           ← Definições dos agentes (markdown)
├── supabase/         ← Migrations + seed SQL
└── scripts/          ← Scripts auxiliares
```

### Comunicação entre apps

```
Browser → apps/app (middleware injeta X-Internal-Key)
              ↓ rewrite /api/*
         apps/api (valida X-Internal-Key, usa service_role)
              ↓
         Supabase (PostgreSQL, RLS deny-all)
```

- `apps/app` middleware: strip headers do browser, injeta `X-Internal-Key` + `x-request-id`
- `apps/api` middleware: valida `X-Internal-Key`, rejeita requests sem a chave
- DB: RLS deny-all em todas as tabelas, só `service_role` acessa

---

## 3. Pipeline de 4 Agentes

### Fluxo

```
Brainstorm → Research → Production → Review → Publish
   Agent 1     Agent 2     Agent 3     Agent 4    (WordPress/YouTube API)
```

### Agentes

| # | Agente | Arquivo | Papel | Input → Output |
|---|---|---|---|---|
| 1 | **Brainstorm** | `agent-1-brainstorm.md` | Gera 5-10 ideias, mata as fracas | Tema → `BC_BRAINSTORM_OUTPUT` |
| 2 | **Research** | `agent-2-research.md` | Valida claims, busca fontes | Ideia selecionada → `BC_RESEARCH_OUTPUT` |
| 3 | **Production** | `agent-3-production.md` + `agent-3a/3b-*` | Cria conteúdo multi-formato | Research + Ideia → Blog/Video/Shorts/Podcast |
| 4 | **Review** | `agent-4-review.md` | QA + plano de publicação | Assets produzidos → Aprovado/Revisão/Rejeitado |

### Sub-agentes de Produção (Agent 3)

| Sub-agente | Arquivo | Output |
|---|---|---|
| Canonical Core | `agent-3a-content-core.md` | Tese, arco emocional, stats, afiliados, CTAs |
| Blog | `agent-3b-blog.md` | Outline, draft completo, SEO, links internos |
| Video | `agent-3b-video.md` | Títulos, script com capítulos, thumbnail |
| Shorts | `agent-3b-shorts.md` | 3-5 vídeos curtos (15-60s) |
| Podcast | `agent-3b-podcast.md` | Talking points, ângulo pessoal, Q&A |
| Engagement | `agent-3b-engagement.md` | CTAs, hooks, prompts de comentário |

### Contratos YAML (BC_*)

Todos os inputs/outputs dos agentes são YAML validados contra schemas Zod.

**Fluxo atual (manual — a ser substituído):**
1. Plataforma gera `BC_*_INPUT` YAML
2. Usuário copia e cola no ChatGPT (GPT customizado)
3. ChatGPT retorna `BC_*_OUTPUT` YAML
4. Usuário cola de volta na plataforma
5. Plataforma parseia e avança o stage

**Fluxo futuro (automático):**
1. Plataforma gera input
2. Chama API da IA diretamente (Claude, Gemini, OpenAI)
3. Parseia response automaticamente
4. Avança stage sem intervenção manual

### Canonical Core

Framework central que alimenta todos os formatos:

| Campo | Propósito |
|---|---|
| `thesis` | Argumento central (1 frase) |
| `argument_chain` | Fluxo lógico de argumentos |
| `emotional_arc` | Batidas emocionais (setup, conflito, resolução) |
| `key_stats` | Dados que sustentam a tese |
| `key_quotes` | Citações de especialistas |
| `affiliate_moment` | Produto, link, copy, racional |
| `cta_subscribe` | CTA de inscrição |
| `cta_comment_prompt` | Prompt de engajamento |

---

## 4. Banco de Dados

**Stack:** Supabase (PostgreSQL) com RLS deny-all + `service_role` bypass.

### Tabelas Principais

#### Conteúdo
| Tabela | Propósito | Campos-chave |
|---|---|---|
| `projects` | Container de projeto | title, current_stage, status, winner, user_id |
| `stages` | Artefatos por stage | project_id, stage_type, yaml_artifact, version |
| `revisions` | Histórico de revisões | stage_id, yaml_artifact, version |
| `research_archives` | Biblioteca de pesquisa | title, theme, research_content, user_id |
| `research_sources` | Fontes de pesquisa | research_id, url, title, author |
| `idea_archives` | Biblioteca de ideias | title, core_tension, verdict, tags, is_public |
| `canonical_core` | Framework de conteúdo | thesis, argument_chain, emotional_arc, affiliate_moment |

#### Drafts por Formato
| Tabela | Campos específicos |
|---|---|
| `blog_drafts` | slug, meta_description, full_draft, outline_json, primary_keyword, affiliate_*, wordpress_post_id |
| `video_drafts` | title_options[], thumbnail_json, script_json, total_duration_estimate |
| `shorts_drafts` | shorts_json, short_count, total_duration |
| `podcast_drafts` | episode_title, talking_points_json, personal_angle, guest_questions[] |

#### Configuração
| Tabela | Propósito |
|---|---|
| `templates` | Templates reutilizáveis (self-referencing para herança) |
| `agent_prompts` | Definições dos agentes (name, slug, stage, instructions) |
| `ai_provider_configs` | Credenciais de IA (provider, api_key, is_active) |
| `image_generator_configs` | Config de geração de imagem (Gemini Imagen) |
| `assets` | Mídia (imagens, thumbnails) com project_id opcional |
| `wordpress_configs` | Credenciais WordPress por usuário |

#### Usuários
| Tabela | Propósito |
|---|---|
| `user_profiles` | Perfil (nome, email, avatar, is_premium, premium_plan, premium_expires_at) |
| `user_roles` | Role mapping (admin, user) |

#### Sistema
| Tabela | Propósito |
|---|---|
| `idempotency_keys` | Retry safety (token, request_hash, response, expires_at) |

---

## 5. Rotas da API

**Envelope padrão:** `{ data: T | null, error: { code, message } | null }`

### Projects
| Método | Rota | Descrição |
|---|---|---|
| GET | `/projects` | Listar (paginação, filtros: status, stage, winner, search) |
| POST | `/projects` | Criar projeto |
| GET | `/projects/:id` | Detalhe |
| PUT | `/projects/:id` | Atualizar |
| DELETE | `/projects/:id` | Deletar |
| POST | `/projects/bulk-create` | Criar em massa (discovery) |
| POST | `/projects/bulk` | Operações em massa (delete, archive, export) |
| POST | `/projects/:id/winner` | Marcar como winner |

### Research
| Método | Rota | Descrição |
|---|---|---|
| GET | `/research` | Listar pesquisas |
| POST | `/research` | Criar pesquisa |
| GET/PATCH/DELETE | `/research/:id` | CRUD |
| GET | `/research/by-idea/:ideaId` | Pesquisa por ideia |
| GET/POST/DELETE | `/research/:id/sources` | Fontes da pesquisa |

### Ideas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/ideas/library` | Listar (filtros: verdict, source_type, tags, search) |
| POST | `/ideas/library` | Criar (com detecção de similaridade) |
| GET/PATCH/DELETE | `/ideas/library/:id` | CRUD |
| POST | `/ideas/archive` | Arquivar ideia |

### Stages
| Método | Rota | Descrição |
|---|---|---|
| POST | `/stages` | Criar artefato de stage |
| GET | `/stages/:projectId` | Listar stages do projeto |
| GET/PUT/PATCH | `/stages/:projectId/:stageType` | CRUD por tipo |
| POST/GET | `/stages/:projectId/:stageType/revisions` | Revisões |

### Content Drafts (Blog, Video, Podcast, Shorts)

Cada tipo segue o mesmo padrão CRUD:

| Método | Rota |
|---|---|
| GET | `/{type}` — listar |
| POST | `/{type}` — criar |
| GET | `/{type}/:id` — detalhe |
| PUT/PATCH | `/{type}/:id` — atualizar |
| DELETE | `/{type}/:id` — deletar |
| GET | `/{type}/:id/export` — exportar markdown |

Onde `{type}` = `blogs`, `videos`, `podcasts`, `shorts`

### Canonical Core
| Método | Rota | Descrição |
|---|---|---|
| GET | `/canonical-core` | Listar (filtros: idea_id, project_id) |
| POST | `/canonical-core` | Criar |
| GET/PUT/DELETE | `/canonical-core/:id` | CRUD |

### Templates
| Método | Rota | Descrição |
|---|---|---|
| GET | `/templates` | Listar |
| POST | `/templates` | Criar |
| GET | `/templates/:id` | Raw |
| GET | `/templates/:id/resolved` | Com herança resolvida |
| PUT/DELETE | `/templates/:id` | Atualizar/deletar |

### Assets & Images
| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/assets` | CRUD de assets |
| GET | `/assets/:id/download` | Download |
| DELETE | `/assets/:id` | Deletar |
| GET | `/assets/project/:projectId` | Assets do projeto |
| POST | `/assets/generate` | Gerar imagem via IA |
| GET | `/assets/unsplash/search` | Buscar no Unsplash |

### AI & Config
| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/ai/config` | CRUD providers de IA |
| GET/PUT/DELETE | `/ai/config/:id` | Provider específico |
| POST | `/ai/discovery` | Rodar agente de brainstorm |
| GET/POST | `/image-generation/config` | Config de geração de imagem |

### WordPress
| Método | Rota | Descrição |
|---|---|---|
| POST | `/wordpress/publish` | Publicar blog no WordPress |
| GET | `/wordpress/tags` | Tags do WordPress |
| GET | `/wordpress/categories` | Categorias do WordPress |
| CRUD | `/wordpress/config` | Gerenciar credenciais |

### Agents
| Método | Rota | Descrição |
|---|---|---|
| GET | `/agents` | Listar prompts |
| GET/PUT | `/agents/:slug` | Ver/editar prompt |

### Users (Admin)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/users` | Listar (admin, com KPIs) |
| GET | `/users/:id` | Perfil |
| PATCH | `/users/:id` | Atualizar perfil |
| PATCH | `/users/:id/role` | Mudar role (admin/user) |
| DELETE | `/users/:id` | Deletar |

### Export
| Método | Rota | Descrição |
|---|---|---|
| POST | `/export/jobs` | Criar job de export |
| GET | `/export/jobs/:id` | Status do job |
| GET | `/export/jobs/:id/download` | Download |

---

## 6. Páginas do Frontend

### Navegação Principal

| Rota | Página | Descrição |
|---|---|---|
| `/` | Dashboard | Visão geral, pipeline de projetos |
| `/projects` | Projetos | Lista/grid com busca, filtros, bulk actions |
| `/projects/[id]` | Projeto | Todas as stages + navegação entre elas |
| `/projects/[id]/discovery` | Discovery | Formulário de brainstorm |
| `/research` | Pesquisas | Biblioteca de pesquisa |
| `/research/[id]` | Pesquisa | Detalhe com fontes e projetos linkados |
| `/ideas` | Ideias | Biblioteca de ideias |
| `/blogs` | Blogs | Lista de drafts |
| `/blogs/[id]` | Blog Editor | Editor rich text + preview |
| `/videos` | Vídeos | Lista de scripts |
| `/videos/[id]` | Video Editor | Editor de script com capítulos |
| `/podcasts` | Podcasts | Lista de episódios |
| `/shorts` | Shorts | Lista de shorts |
| `/images` | Image Bank | Galeria global de imagens geradas |
| `/templates` | Templates | Gerenciamento de templates |

### Settings

| Rota | Descrição |
|---|---|
| `/settings/ai` | Configurar providers (Anthropic, OpenAI, etc.) |
| `/settings/image-generation` | Configurar Gemini Imagen |
| `/settings/wordpress` | Credenciais WordPress |
| `/settings/agents` | Ver/editar prompts dos agentes |

---

## 7. Integrações de IA

### Providers Suportados

| Provider | Uso | Status |
|---|---|---|
| **OpenAI** | Geração de texto (GPT) | ✅ Implementado |
| **Anthropic** | Geração de texto (Claude) | ✅ Implementado |
| **Gemini Imagen** | Geração de imagens | ✅ Implementado |
| **Mock** | Desenvolvimento/testes | ✅ Implementado |

### Prioridade de Configuração

1. `AI_ENABLED=false` → usa mock
2. `AI_PROVIDER` env var (openai/anthropic/mock)
3. Config no banco (`ai_provider_configs` com is_active=true)
4. Fallback → mock

### Padrão Adapter

```
AIProvider (interface)
  ├── OpenAIProvider
  ├── AnthropicProvider
  ├── GeminiImagenProvider
  └── MockProvider
        ↓
ProviderAIAdapter (wrapper)
        ↓
AIAdapter (abstração para o app)
```

---

## 8. Regras de Negócio — A Implementar

### 8.1 Sistema de Tokens

**Conceito:** Cada ação que consome IA gasta tokens. Planos definem limites mensais.

**Ações que consomem tokens:**
- Brainstorm (geração de ideias)
- Research (pesquisa com IA)
- Production (geração de conteúdo — blog, vídeo, etc.)
- Review (revisão com IA)
- Geração de imagens

**Métricas por usuário:**
- Tokens consumidos no período
- Tokens restantes
- Histórico de consumo

### 8.2 Planos e Pricing

| Plano | Tokens/mês | Preço | Status |
|---|---|---|---|
| **Free** | X (a definir) | R$ 0 | 🔲 A implementar |
| **Starter** | Y | ~R$ X | 🔲 A definir |
| **Pro** | Z | ~R$ Y | 🔲 A definir |
| **Enterprise** | Ilimitado | Sob consulta | 🔲 A definir |
| **Custo** | Preço de custo | Convite | 🔲 A definir |

**Campos existentes no banco:**
- `user_profiles.is_premium` (boolean)
- `user_profiles.premium_plan` ('monthly' | 'yearly')
- `user_profiles.premium_started_at` / `premium_expires_at`

### 8.3 Feature Flags

| Flag | Descrição | Default |
|---|---|---|
| `AI_ENABLED` | Habilita/desabilita IA | true |
| `AI_PROVIDER` | Provider padrão | mock |
| `ENABLE_BULK_LIMITS` | Limita operações em massa | false |
| `MAX_BULK_CREATE` | Max projetos por bulk-create | 50 |

**A implementar:** Feature flags no banco (por plano/usuário), gate no frontend (UserGate).

### 8.4 Sistema de Afiliados

**Conceito:** Usuários podem indicar novos clientes e ganhar comissão.

**Campos já existentes nos drafts:**
- `blog_drafts.affiliate_placement` / `affiliate_copy` / `affiliate_link`
- `canonical_core.affiliate_moment_json`

**A implementar:**
- Tabela de afiliados (referral codes, comissões)
- Dashboard de afiliados
- Tracking de conversões
- Pagamento de comissões

### 8.5 Pagamentos

**A implementar:**
- Integração com gateway (Stripe? Mercado Pago?)
- Checkout para upgrade de plano
- Billing history
- Cancelamento/downgrade

### 8.6 Observabilidade

**A implementar:**
- Logs estruturados (Datadog/Sentry)
- Métricas de uso por token
- Alertas de consumo
- Request tracing (x-request-id já existe)

---

## 9. Segurança

### Headers & Autenticação

| Mecanismo | Descrição |
|---|---|
| `INTERNAL_API_KEY` | Shared secret entre app ↔ api (nunca no browser) |
| Header stripping | app middleware remove `x-internal-key` e `x-user-id` do browser |
| `x-request-id` | Tracing end-to-end (injetado pelo middleware) |
| `SUPABASE_SERVICE_ROLE_KEY` | Só no api, bypassa RLS |
| Criptografia AES-256-GCM | API keys dos providers encriptadas no banco |

### RLS

Todas as tabelas têm RLS habilitado com política deny-all. Apenas `service_role` (usado pelo api) consegue ler/escrever. Isolamento de dados por `user_id`.

### Idempotência

Requests sensíveis usam `idempotency_keys` para retry safety (TTL: 1h).

---

## 10. Tipos de Conteúdo — Lógica por Mídia

### Blog

**Pipeline:** Brainstorm → Research → Canonical Core → Blog Draft → Review → WordPress

**Campos específicos:**
- Outline (JSON com seções hierárquicas)
- Full draft (HTML/Markdown)
- SEO: primary_keyword, secondary_keywords, meta_description, slug
- Afiliados: placement, copy, link, rationale
- Links internos: internal_links_json
- Publicação: wordpress_post_id

**Review específico:** Verifica SEO, legibilidade, fact-checking, affiliate placement.

### Video YouTube

**Pipeline:** Brainstorm → Research → Canonical Core → Video Draft → Review → (export manual)

**Campos específicos:**
- title_options[] (3 opções de título)
- thumbnail_json (conceito visual)
- script_json (capítulos com timestamps, B-roll, sound design)
- total_duration_estimate

**Variantes a implementar:**
- **Canal normal:** Vídeos educativos/informativos com rosto
- **Canal dark:** Narração + imagens/vídeos stock (sem rosto)
- **Cursos:** Série de vídeos estruturados (módulos + aulas)

**Review específico:** Verifica ritmo, retenção, thumbnail appeal, CTA positioning.

### Shorts

**Pipeline:** Brainstorm → Research → Canonical Core → Shorts Draft → Review

**Campos específicos:**
- shorts_json (array de 3-5 clips)
- Cada clip: hook, corpo, CTA, duração (15-60s)
- Captions, transições

### Podcast

**Pipeline:** Brainstorm → Research → Canonical Core → Podcast Draft → Review

**Campos específicos:**
- episode_title, episode_description
- intro_hook
- talking_points_json (com timings)
- personal_angle
- guest_questions[]
- outro

---

## 11. Módulos de Conteúdo

Cada tipo de conteúdo tem um módulo em `apps/api/src/lib/modules/{tipo}/`:

| Arquivo | Propósito |
|---|---|
| `schema.ts` | Schema Zod para validação do output do agente |
| `mapper.ts` | Mapeia output do agente → modelo do banco |
| `validator.ts` | Validação antes de salvar |
| `exporter.ts` | Converte draft → markdown para download |

**Módulos:** blog, video, podcast, shorts, engagement

---

## 12. Template System

Templates permitem reutilizar configurações entre projetos.

| Campo | Descrição |
|---|---|
| `name` | Nome do template |
| `type` | Tipo (brainstorm, production, etc.) |
| `config_json` | Configuração em JSON |
| `parent_template_id` | Herança (self-referencing) |

**Resolução:** `GET /templates/:id/resolved` retorna o template com campos do pai mesclados.

---

## 13. Decisões Canônicas

| Decisão | Escolha | Razão |
|---|---|---|
| API envelope | `{ data, error }` sempre | Consistência, facilita handling no frontend |
| DB ↔ API | snake_case ↔ camelCase (mappers) | Convenção de cada camada |
| shared package | Source-level (sem build) | Simplicidade, hot reload |
| Agent contracts | YAML + Zod validation | Parseable, estruturado |
| RLS | Deny-all + service_role | Segurança máxima |
| Idempotência | Token-based (1h TTL) | Retry safety em mutations |
| Bulk export | JSON (ZIP adiado) | Simplicidade |
| Legacy ideas | 30 dias de compat | Não quebrar dados existentes |
| Hard delete | Sem soft-delete | Simplicidade (pode mudar) |
| Template herança | Self-referencing | Flexibilidade sem complexidade |

---

## 14. Ambiente & Deploy

### Variáveis de Ambiente

```
# Root (.env.local)
SUPABASE_ACCESS_TOKEN=           # Para CLI

# apps/app (.env.local)
API_URL=                         # URL do api (prod: https://api.brighttale.io)
INTERNAL_API_KEY=                # Shared secret
NEXT_PUBLIC_SUPABASE_URL=        # Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Anon key (safe to expose)

# apps/api (.env.local)
INTERNAL_API_KEY=                # Shared secret (mesmo valor)
SUPABASE_URL=                    # Supabase URL
SUPABASE_SERVICE_ROLE_KEY=       # Service role (NUNCA no app)
ENCRYPTION_SECRET=               # AES-256-GCM para API keys no banco
AI_ENABLED=true
AI_PROVIDER=anthropic            # openai | anthropic | mock
```

### Deploy (Vercel)

- Cada app é um projeto Vercel separado
- `API_URL` obrigatório no app (sem ele, rewrite vai pro localhost → erro DNS)
- `INTERNAL_API_KEY` deve ser igual nos dois projetos

### Comandos

```bash
npm run dev            # app + api em paralelo
npm run build          # build all
npm run test           # testes all
npm run typecheck      # TypeScript check
npm run lint           # ESLint
npm run db:push:dev    # push migrations
npm run db:types       # regenerar tipos
npm run db:reset       # reset local + seed
```
