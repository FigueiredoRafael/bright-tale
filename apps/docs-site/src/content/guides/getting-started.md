# Getting Started

## Pré-requisitos

- Node.js 18+
- Docker (para Supabase local)
- Git

## 1. Clone & Install

```bash
git clone <repository-url>
cd bright-tale
npm install
```

## 2. Variáveis de Ambiente

Criar os seguintes arquivos:

**`.env.local` (root)**
```env
SUPABASE_ACCESS_TOKEN=your-supabase-access-token
```

**`apps/app/.env.local`**
```env
API_URL=http://localhost:3001
INTERNAL_API_KEY=your-shared-secret
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**`apps/api/.env.local`**
```env
INTERNAL_API_KEY=your-shared-secret
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_SECRET=your-32-char-secret
AI_ENABLED=true
AI_PROVIDER=mock
```

## 3. Database

```bash
npm run db:start      # Inicia Supabase local (Docker)
npm run db:reset      # Reset + migrations + seed
```

## 4. Run

```bash
npm run dev           # Inicia app (3000) + api (3001)
```

Abra http://localhost:3000.
