# Schema Completo

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
