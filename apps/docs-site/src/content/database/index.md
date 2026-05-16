# Database

**Stack:** Supabase (PostgreSQL) com RLS deny-all.

## Convenções

- **RLS:** Habilitado em todas as tabelas (deny-all, só `service_role` acessa)
- **Timestamps:** `created_at` e `updated_at` em todas as tabelas
- **Trigger:** `moddatetime` extension + `handle_updated_at()` para `updated_at`
- **Naming:** snake_case, `_id` para FKs, `_at` para timestamps, `_json` para JSONB, `is_` para booleans
- **User scope:** `user_id` em todas as tabelas de conteúdo

## Tabelas (18+)

| Categoria | Tabelas |
|---|---|
| **Conteúdo** | projects, stages, revisions, research_archives, research_sources, idea_archives, canonical_core |
| **Drafts** | blog_drafts, video_drafts, shorts_drafts, podcast_drafts |
| **Config** | templates, agent_prompts, ai_provider_configs, image_generator_configs, assets |
| **Publishing** | publish_targets |
| **Usuários** | user_profiles, user_roles |
| **Sistema** | idempotency_keys |

## Migrations

Localização: `supabase/migrations/`

Após mudanças no schema:
```bash
# Editar migration em supabase/migrations/
npm run db:push:dev      # Aplicar no dev
npm run db:types         # Regenerar types
```

## Tipos Gerados

`packages/shared/src/types/database.ts` é auto-gerado pelo `npm run db:types` a partir do schema remoto.
