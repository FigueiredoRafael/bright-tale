# Segurança

## Headers & Autenticação

| Mecanismo | Descrição |
|---|---|
| `INTERNAL_API_KEY` | Shared secret entre app ↔ api (nunca no browser) |
| Header stripping | app middleware remove `x-internal-key` e `x-user-id` do browser |
| `x-request-id` | Tracing end-to-end (UUID injetado pelo middleware) |
| `SUPABASE_SERVICE_ROLE_KEY` | Só no api, nunca no app |
| AES-256-GCM | API keys dos providers encriptadas no banco |

## Fluxo de Autenticação

```
1. Browser faz request para /api/*
2. apps/app middleware:
   - Remove x-internal-key e x-user-id do request original
   - Injeta X-Internal-Key do env
   - Injeta x-request-id (UUID)
   - Rewrite para apps/api
3. apps/api middleware:
   - Valida X-Internal-Key
   - Se inválido → 401
   - Se válido → processa request com service_role
```

## Row Level Security (RLS)

- **Todas as tabelas** têm RLS habilitado
- Política: **deny-all** — nenhum acesso público
- Apenas `service_role` (usado pelo api) consegue ler/escrever
- Isolamento de dados por `user_id` em queries

## Criptografia

API keys dos providers de IA são encriptadas antes de salvar no banco:
- Algoritmo: AES-256-GCM
- Secret: `ENCRYPTION_SECRET` (32 chars, no `.env`)
- Decrypt apenas no momento de uso

## Variáveis de Ambiente

```
# apps/app
API_URL=https://api.brighttale.io    # URL do api em produção
INTERNAL_API_KEY=xxx                  # Shared secret (mesmo valor nos dois)
NEXT_PUBLIC_SUPABASE_URL=xxx          # Safe to expose
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx     # Safe to expose

# apps/api
INTERNAL_API_KEY=xxx                  # Shared secret (mesmo valor)
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx         # NUNCA no app
ENCRYPTION_SECRET=xxx                 # Para AES-256-GCM
```

## Produção (Vercel)

- Sem `API_URL`, o rewrite vai para `localhost:3001` → Vercel bloqueia com `DNS_HOSTNAME_RESOLVED_PRIVATE`
- `INTERNAL_API_KEY` deve ser idêntico nos dois projetos Vercel
