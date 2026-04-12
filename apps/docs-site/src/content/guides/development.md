# Desenvolvimento

## Comandos

```bash
npm run dev            # app + api em paralelo
npm run dev:app        # só frontend (porta 3000)
npm run dev:api        # só API (porta 3001)
npm run dev:web        # landing page (porta 3002)
npm run build          # build all workspaces
npm run typecheck      # TypeScript check
npm run lint           # ESLint
```

## Database

```bash
npm run db:start       # Inicia Supabase local
npm run db:stop        # Para Supabase
npm run db:reset       # Reset + migrations + seed
npm run db:push:dev    # Push migrations para projeto dev
npm run db:push:prod   # Push para prod (com confirmação)
npm run db:types       # Regenera types de database.ts
npm run db:seed        # Gera seed.sql e aplica
```

## Criar Nova Feature (checklist)

1. **Migration** — Criar arquivo em `supabase/migrations/`
2. **Push** — `npm run db:push:dev`
3. **Types** — `npm run db:types`
4. **Schema Zod** — Criar/atualizar em `packages/shared/src/schemas/`
5. **Types TS** — Criar/atualizar em `packages/shared/src/types/`
6. **Mapper** — Atualizar `packages/shared/src/mappers/db.ts`
7. **API Route** — Criar em `apps/api/src/routes/`
8. **Frontend** — Criar páginas e componentes em `apps/app/src/`
9. **Testes** — Adicionar em `__tests__/`

## Convenções

- API envelope: `{ data, error }` sempre
- DB → API: `fromDb()` mapper (snake_case → camelCase)
- API → DB: `toDb()` mapper (camelCase → snake_case)
- Validação: Zod schemas de `@brighttale/shared`
- Componentes: shadcn/ui + Tailwind
- Imports: `@/*` para local, `@brighttale/shared` para shared
