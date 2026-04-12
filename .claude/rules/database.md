# Database Rules

Applied when editing: `supabase/migrations/**`, `packages/shared/src/types/database.ts`

## Migration Discipline

1. **One migration per logical change** — don't bundle unrelated schema changes
2. **Naming:** `YYYYMMDDHHMMSS_descriptive_name.sql`
3. **Always add `updated_at` trigger** for new tables:
   ```sql
   CREATE TRIGGER handle_updated_at BEFORE UPDATE ON new_table
     FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
   ```
4. **Always enable RLS** on new tables:
   ```sql
   ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
   ```
5. **Add `user_id` column** to all user-scoped tables (references `auth.users`)

## Schema Change Coordination

After any migration:
1. Run `npm run db:push:dev` to apply
2. Run `npm run db:types` to regenerate `packages/shared/src/types/database.ts`
3. Update Zod schemas in `packages/shared/src/schemas/` if needed
4. Update mappers in `packages/shared/src/mappers/db.ts` if needed

## Column Naming

- Use `snake_case` for all column names
- Use `_id` suffix for foreign keys (e.g., `project_id`)
- Use `_at` suffix for timestamps (e.g., `created_at`)
- Use `_json` suffix for JSONB columns (e.g., `config_json`)
- Use `is_` prefix for booleans (e.g., `is_active`)

## Performance

- Add indexes for columns used in WHERE/JOIN/ORDER BY
- Use `JSONB` (not `JSON`) for structured data
- Use `TEXT` for variable-length strings (not `VARCHAR`)
