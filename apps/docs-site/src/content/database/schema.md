# Schema Completo

> **Pipeline ativo (v2):** `channels → idea_archives → brainstorm_sessions → research_sessions → content_drafts`. As tabelas `projects`, `stages`, `revisions`, `research_archives`, `blog_drafts`, `video_drafts`, `podcast_drafts`, `shorts_drafts` são do **pipeline legado (v1)** e serão removidas em F6-009.

---

## Pipeline v2

### channels

Um canal de conteúdo por org (blog, YouTube, ou híbrido).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| org_id / user_id | uuid FK | |
| name / niche / niche_tags | text | |
| market | text | default 'br' |
| language | text | default 'pt-BR' — **injetado nos agent inputs** |
| tone | text | informative/casual/técnico/irreverente |
| channel_type | text | default 'text' |
| presentation_style | text | `talking_head` \| `voiceover` \| `mixed` — define cues de produção no video script |
| media_types | text[] | ['blog', 'video', 'shorts', 'podcast'] — filtra tabs no /content e Biblioteca |
| youtube_url / youtube_channel_id | text | |
| blog_url / wordpress_config_id | text / uuid FK | |
| voice_{provider,id,speed,style} | text/num | Preferences pra TTS (Phase 4) |
| model_tier | text | default 'standard' |
| youtube_subs / youtube_monthly_views | int | cache |

### idea_archives

Ideias persistidas do brainstorm.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| idea_id | text unique | BC-IDEA-NNN humanizado |
| title / core_tension / target_audience | text | |
| verdict | text | viable \| weak \| experimental |
| discovery_data | text (JSON) | monetization/angle/repurposing |
| source_type | text | brainstorm / manual |
| channel_id | uuid FK | |
| brainstorm_session_id | uuid FK | |

### brainstorm_sessions

Uma run de brainstorm por registro.

| Coluna | Descrição |
|---|---|
| id, org_id, user_id, channel_id | |
| input_mode | blind / fine_tuned / reference_guided |
| input_json | { topic, fineTuning, referenceUrl } |
| model_tier / status | running/completed/failed |
| error_message | |

### research_sessions

Pesquisa async com níveis.

| Coluna | Descrição |
|---|---|
| id, org_id, user_id, channel_id, idea_id | |
| level | surface/medium/deep |
| focus_tags | text[] |
| input_json | { topic, level, focusTags, instruction } |
| cards_json | output do agente |
| approved_cards_json | cards aprovados no review humano |
| status | running/completed/reviewed/failed |

### content_drafts

Drafts finais (blog/video/shorts/podcast).

| Coluna | Descrição |
|---|---|
| id, org_id, user_id, channel_id | |
| idea_id / research_session_id | FK opcional pra rastrear origem |
| type | blog/video/shorts/podcast |
| title | |
| canonical_core_json | agent-3a output |
| draft_json | agent-3b-{type} output (body + teleprompter + editor_script + pacote YouTube) |
| review_feedback_json | agent-4 output (score, verdict, SEO checks, strengths, issues) |
| production_params | { target_word_count } ou { target_duration_minutes } |
| status | draft/in_review/approved/scheduled/published/failed |
| scheduled_at / published_at / published_url | |

### job_events (F2-036)

Eventos de progresso de jobs async, consumidos via SSE.

| Coluna | Descrição |
|---|---|
| id | uuid PK |
| session_id | uuid — brainstorm_session / research_session / content_draft id |
| session_type | brainstorm / research / production |
| stage | queued / loading_prompt / calling_provider / parsing_output / saving / completed / failed |
| message | texto humano |
| metadata | jsonb |
| created_at | |

Índice: `(session_id, created_at)`. RLS deny-all (só service_role).

### usage_events (F2-049)

Registro de cada chamada de IA + custo estimado.

| Coluna | Descrição |
|---|---|
| id | uuid PK |
| org_id / user_id / channel_id | |
| stage | brainstorm/research/production/review |
| sub_stage | canonical-core / produce-{type} / null |
| session_id / session_type | rastreio reverso (qual draft/session originou) |
| provider | anthropic/openai/gemini/ollama |
| model | ex. gemini-2.5-flash |
| input_tokens / output_tokens | int |
| cost_usd | numeric(10,6) — 0 pra ollama |

Índices: `(org_id, created_at desc)`, `(user_id, created_at desc)`, `(session_id)`.

### agent_prompts

Prompts dos agentes. Editado no admin (`apps/web`), apenas leitura no `apps/app`.

| Coluna | Descrição |
|---|---|
| id / name | |
| slug | brainstorm / research / content-core / blog / video / shorts / podcast / engagement / review |
| stage | brainstorm / research / production / review |
| instructions | text — system prompt completo |
| input_schema | text (opcional) |
| org_id | null = global, senão override por org |
| recommended_provider / recommended_model | badges "Recommended" no ModelPicker |

### credit_settings

Configuração global de custos de crédito (singleton, `lock_key='global'`). Editado no admin, lido em toda geração de conteúdo.

| Coluna | Descrição |
|---|---|
| id | uuid PK |
| lock_key | text — sempre 'global' (singleton via unique constraint) |
| cost_blog / cost_video / cost_shorts / cost_podcast | int — Custo em créditos por formato; usado em `calculateDraftCost(type, settings)` |
| cost_canonical_core | int — Custo por execução do agent-3a (canonical core) |
| cost_review | int — Custo por execução do agent-4 (review) |
| cost_research_surface | int — Custo por pesquisa superficial |
| cost_research_medium | int — Custo por pesquisa padrão |
| cost_research_deep | int — Custo por pesquisa profunda |
| created_at / updated_at | timestamptz |

## Infraestrutura & auth

### organizations

| Coluna | Descrição |
|---|---|
| id | uuid PK |
| name / slug / logo_url | |
| stripe_customer_id / stripe_subscription_id | Billing (F3) |
| plan | free/starter/creator/pro |
| billing_cycle | monthly/annual |
| plan_started_at / plan_expires_at | |
| credits_total / credits_used / credits_reset_at | Plano mensal |
| credits_addon | Créditos avulsos (F3-005) |

### org_memberships / org_invites

Membros do org e convites pendentes (email token).

### credit_usage

Log individual de débitos de crédito (diferente de `usage_events` que é sobre tokens de IA). Ambas co-existem; credit_usage é "quanto usei do plano", usage_events é "quanto custou em tokens".

---

## Pipeline legado (v1 — será removido em F6-009)

## projects

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| title | text | Título do projeto |
| current_stage | text | Stage atual (brainstorm, research, production, review, publish) |
| completed_stages | text[] | Stages completados |
| status | text | active, paused, completed, archived |
| winner | text | Formato vencedor (blog, video, etc.) |
| research_id | uuid FK | Pesquisa vinculada |
| pipeline_state_json | jsonb | Estado da máquina XState (v3): contexto do pipeline, modo (step-by-step/auto-pilot), resultados acumulados. Legado: `mapLegacyPipelineState()` migra forma antiga automaticamente. |
| user_id | uuid FK | Dono do projeto |
| created_at / updated_at | timestamptz | |

## stages

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK | Projeto |
| stage_type | text | brainstorm, research, production, review, publish |
| yaml_artifact | text | YAML do output do agente |
| version | int | Versão atual |

## revisions

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| stage_id | uuid FK | Stage |
| yaml_artifact | text | YAML da revisão |
| version | int | Número da versão |

## research_archives

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| title | text | Título da pesquisa |
| theme | text | Tema |
| research_content | jsonb | Conteúdo estruturado |
| projects_count | int | Projetos que usam esta pesquisa |
| winners_count | int | Projetos winners |
| user_id | uuid FK | |

## research_sources

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| research_id | uuid FK | |
| url | text | URL da fonte |
| title | text | Título |
| author | text | Autor |
| date | date | Data da publicação |

## idea_archives

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| idea_id | text | ID do brainstorm (bc-idea-XXX) |
| title | text | |
| core_tension | text | |
| target_audience | text | |
| verdict | text | viable, weak |
| discovery_data | jsonb | Dados completos do brainstorm |
| source_type | text | brainstorm, manual, import |
| tags | text[] | |
| is_public | boolean | |
| usage_count | int | |
| markdown_content | text | |
| user_id | uuid FK | |

## blog_drafts

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| title | text | |
| slug | text | URL slug |
| meta_description | text | SEO |
| full_draft | text | Conteúdo completo |
| outline_json | jsonb | Estrutura de seções |
| primary_keyword | text | Keyword principal |
| secondary_keywords | text[] | Keywords secundárias |
| affiliate_placement | text | Onde posicionar afiliado |
| affiliate_copy | text | Copy do afiliado |
| affiliate_link | text | Link do afiliado |
| internal_links_json | jsonb | Links internos |
| status | text | draft, review, published |
| project_id | uuid FK | |
| idea_id | uuid FK | |
| wordpress_post_id | int | ID no WordPress |
| user_id | uuid FK | |

## video_drafts

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| title | text | |
| title_options | text[] | 3 opções de título |
| thumbnail_json | jsonb | Conceito de thumbnail |
| script_json | jsonb | Script com capítulos |
| total_duration_estimate | text | |
| status | text | |
| project_id / idea_id / user_id | uuid FK | |

## shorts_drafts

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| shorts_json | jsonb | Array de clips |
| short_count | int | |
| total_duration | text | |
| status | text | |
| project_id / idea_id / user_id | uuid FK | |

## podcast_drafts

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| episode_title | text | |
| episode_description | text | |
| intro_hook | text | |
| talking_points_json | jsonb | |
| personal_angle | text | |
| guest_questions | text[] | |
| outro | text | |
| status | text | |
| project_id / idea_id / user_id | uuid FK | |

## canonical_core

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| idea_id | uuid FK | |
| project_id | uuid FK | |
| thesis | text | |
| argument_chain_json | jsonb | |
| emotional_arc_json | jsonb | |
| key_stats_json | jsonb | |
| key_quotes_json | jsonb | |
| affiliate_moment_json | jsonb | |
| cta_subscribe | text | |
| cta_comment_prompt | text | |
| user_id | uuid FK | |

## templates

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| name | text | |
| type | text | brainstorm, production, etc. |
| config_json | jsonb | |
| parent_template_id | uuid FK (self) | Herança |
| user_id | uuid FK | |

## agent_prompts

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| name | text | |
| slug | text | Identificador único |
| stage | text | brainstorm, research, production, review |
| instructions | text | System prompt do agente |
| input_schema | text | Schema de input |
| output_schema | text | Schema de output |

## ai_provider_configs / image_generator_configs

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| provider | text | openai, anthropic, gemini-imagen |
| api_key | text | Encriptada (AES-256-GCM) |
| model | text | Modelo padrão |
| is_active | boolean | |
| config_json | jsonb | Config adicional |
| user_id | uuid FK | |

## assets

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK (nullable) | Pode ser standalone |
| asset_type | text | image, video, etc. |
| source | text | gemini-imagen, unsplash, upload |
| local_path | text | Caminho local |
| prompt | text | Prompt usado para gerar |
| role | text | thumbnail, section-image, etc. |
| content_type | text | blog, video, etc. |
| content_id | uuid | ID do draft vinculado |
| user_id | uuid FK | |

## wordpress_configs

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| site_url | text | |
| username | text | |
| password | text | Encriptada |
| user_id | uuid FK | |

## user_profiles

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK (ref auth.users) | |
| first_name | text | |
| last_name | text | |
| email | text | |
| avatar_url | text | |
| is_premium | boolean | |
| premium_plan | text | monthly, yearly |
| premium_started_at | timestamptz | |
| premium_expires_at | timestamptz | |
| is_active | boolean | |

## user_roles

| Coluna | Tipo | Descrição |
|---|---|---|
| user_id | uuid FK | |
| role | text | admin, user |

## idempotency_keys

| Coluna | Tipo | Descrição |
|---|---|---|
| token | text PK | |
| purpose | text | |
| request_hash | text | |
| response | jsonb | |
| consumed | boolean | |
| expires_at | timestamptz | |

## credit_reservations (V2-006)

Holds in-flight credit reservations created by background jobs. A reservation transitions: `held` → `committed` (job succeeded) or `released` / `expired` (job failed or timed out). The `reserve_credits`, `commit_reservation`, `release_reservation`, and `expire_stale_reservations` Postgres RPCs use `SELECT FOR UPDATE` on `organizations` to prevent race conditions.

**Architectural boundary:** The TS façade (`apps/api/src/lib/credits/reservations.ts`) is intentionally thin — it calls the RPCs and maps error codes. All locking logic lives in SQL.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | |
| token | uuid unique | Opaque handle returned to caller; used in commit/release calls |
| org_id | uuid FK → organizations | Org holding the reservation |
| user_id | uuid FK → auth.users | Member who triggered the job |
| amount | integer | Credits reserved (estimated job cost) |
| actual_amount | integer | Credits actually charged on commit (may be less than amount) |
| status | text | `held` \| `committed` \| `released` \| `expired` |
| created_at | timestamptz | |
| expires_at | timestamptz | Stale threshold: `created_at + 15 minutes` |

Índice: `(org_id, status)`, `(expires_at)` (para sweep do cron). RLS deny-all (só service_role).

The companion column `organizations.credits_reserved` is kept in sync by the RPCs (incremented on reserve, decremented on commit/release/expire) so that the balance formula can subtract it without a JOIN:

```
available = (credits_total − credits_used − credits_reserved) + credits_addon + signup_bonus_remaining
```
