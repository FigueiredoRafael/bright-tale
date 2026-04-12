# Deploy

## Vercel

Cada app é um projeto Vercel separado.

### apps/app

**Variáveis obrigatórias:**
```
API_URL=https://api.brighttale.io
INTERNAL_API_KEY=xxx
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

Sem `API_URL`, o Next.js rewrite vai para `localhost:3001` e Vercel retorna `DNS_HOSTNAME_RESOLVED_PRIVATE` (404).

### apps/api

**Variáveis obrigatórias:**
```
INTERNAL_API_KEY=xxx    # Mesmo valor do app
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
ENCRYPTION_SECRET=xxx
AI_ENABLED=true
AI_PROVIDER=anthropic
```

### Database

```bash
npm run db:push:prod   # Push migrations para produção
```

Requer confirmação manual. Sempre revisar migrations antes de aplicar em prod.
