---
title: Auth + Teams + Permissões
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# Auth + Teams + Permissões

## Conceito

O BrightTale funciona com **Organizations (Orgs)**. Uma org é o "bucket" compartilhado onde pesquisas, canais, conteúdo e assets vivem. Créditos pertencem à Org, não ao indivíduo. Membros da org compartilham tudo.

```
Organization: "Bright Labs"
├── Billing: Plano Pro (15K créditos/mês)
├── Membros:
│   ├── Rafael (Owner) — acesso total
│   ├── João (Admin) — acesso total exceto billing
│   └── Maria (Member) — cria conteúdo, sem config
├── Canais:
│   ├── Produtividade Dark
│   └── Tech Reviews
├── Assets (bucket compartilhado):
│   ├── Imagens geradas
│   ├── Áudios
│   └── Vídeos
└── Pesquisas, ideias, drafts (tudo compartilhado)
```

---

## 1. Auth Flow

### Supabase Auth

| Método | Implementação |
|---|---|
| **Email + Magic Link** | Primary — sem senha, simples |
| **Google OAuth** | Secondary — login com Google |
| **GitHub OAuth** | Optional — para devs |

### Signup Flow

```
1. Usuário entra email → recebe magic link
2. Clica no link → logado
3. Primeira vez? → Cria org pessoal automaticamente
4. Onboarding (setup de canal)
5. Dashboard
```

### Convite de Membro

```
1. Owner/Admin vai em Settings > Team
2. Clica "Convidar membro"
3. Entra email + role (Admin ou Member)
4. Sistema envia magic link de convite
5. Convidado clica → cria conta (ou loga se já tem) → vinculado à org
```

---

## 2. Modelo de Permissões

### Roles

| Role | Descrição | Quem pode atribuir |
|---|---|---|
| **Owner** | Tudo. Billing, deletar org, transferir ownership | — (quem criou) |
| **Admin** | Tudo exceto billing e deletar org | Owner |
| **Member** | Criar/editar conteúdo, usar créditos | Owner, Admin |
| **Viewer** | Só leitura (ver conteúdo, pesquisas, assets) | Owner, Admin |

### Matriz de Permissões

| Ação | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| **Conteúdo** | | | | |
| Ver projetos, pesquisas, drafts | ✅ | ✅ | ✅ | ✅ |
| Criar/editar conteúdo | ✅ | ✅ | ✅ | ❌ |
| Deletar conteúdo | ✅ | ✅ | Próprio | ❌ |
| Publicar (WordPress/YouTube) | ✅ | ✅ | ✅ | ❌ |
| **Canais** | | | | |
| Ver canais | ✅ | ✅ | ✅ | ✅ |
| Criar/editar canal | ✅ | ✅ | ❌ | ❌ |
| Deletar canal | ✅ | ✅ | ❌ | ❌ |
| **Assets** | | | | |
| Ver assets (imagens, áudio, vídeo) | ✅ | ✅ | ✅ | ✅ |
| Upload/gerar assets | ✅ | ✅ | ✅ | ❌ |
| Deletar assets | ✅ | ✅ | Próprio | ❌ |
| Download assets | ✅ | ✅ | ✅ | ✅ |
| **Team** | | | | |
| Ver membros | ✅ | ✅ | ✅ | ✅ |
| Convidar membros | ✅ | ✅ | ❌ | ❌ |
| Remover membros | ✅ | ✅ | ❌ | ❌ |
| Mudar role | ✅ | ❌ | ❌ | ❌ |
| **Config** | | | | |
| Settings (IA, voz, templates) | ✅ | ✅ | ❌ | ❌ |
| Integrations (WordPress, YouTube) | ✅ | ✅ | ❌ | ❌ |
| API keys | ✅ | ✅ | ❌ | ❌ |
| **Billing** | | | | |
| Ver plano e créditos | ✅ | ✅ | ✅ | ✅ |
| Mudar plano | ✅ | ❌ | ❌ | ❌ |
| Ver faturas | ✅ | ❌ | ❌ | ❌ |
| Adicionar payment method | ✅ | ❌ | ❌ | ❌ |
| **Org** | | | | |
| Editar nome/branding da org | ✅ | ✅ | ❌ | ❌ |
| Deletar org | ✅ | ❌ | ❌ | ❌ |
| Transferir ownership | ✅ | ❌ | ❌ | ❌ |

---

## 3. Créditos: da Org, não do Indivíduo

```
Organization: "Bright Labs" — Plano Pro (15.000 créditos/mês)

Dashboard de créditos:

  Saldo: ████████░░ 72% (10.800 / 15.000)
  Renova em: 15 dias

  Uso por membro:
  │ Membro        │ Créditos usados │ % do total │
  │───────────────│─────────────────│────────────│
  │ Rafael        │ 2.400           │ 57%        │
  │ João          │ 1.500           │ 36%        │
  │ Maria         │ 300             │ 7%         │

  Uso por canal:
  │ Canal              │ Créditos │
  │────────────────────│──────────│
  │ Produtividade Dark │ 3.200    │
  │ Tech Reviews       │ 1.000    │
```

### Limites por membro (opcional, configurável pelo Owner)

```
Settings > Team > Rafael
  ☐ Sem limite (usa do pool da org)
  ● Limite mensal: [5.000] créditos
```

---

## 4. Data Model

```sql
-- =============================================
-- ORGANIZATIONS
-- =============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                     -- "Bright Labs"
  slug TEXT UNIQUE NOT NULL,              -- "bright-labs"
  logo_url TEXT,
  
  -- Billing (Stripe)
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',      -- free, starter, creator, pro
  billing_cycle TEXT DEFAULT 'monthly',   -- monthly, annual
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  
  -- Créditos
  credits_total INTEGER NOT NULL DEFAULT 1000,    -- do plano
  credits_used INTEGER NOT NULL DEFAULT 0,        -- usado no ciclo atual
  credits_reset_at TIMESTAMPTZ,                   -- quando reseta
  credits_addon INTEGER DEFAULT 0,                -- comprados avulso (não resetam)
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ORG MEMBERSHIPS
-- =============================================

CREATE TABLE org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',   -- owner, admin, member, viewer
  
  -- Limite opcional de créditos
  credit_limit INTEGER,                  -- null = sem limite (pool da org)
  credits_used_cycle INTEGER DEFAULT 0,  -- usado neste ciclo
  
  invited_by UUID REFERENCES auth.users,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(org_id, user_id)
);

-- =============================================
-- INVITES
-- =============================================

CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users NOT NULL,
  
  token TEXT UNIQUE NOT NULL,            -- token do magic link
  status TEXT DEFAULT 'pending',         -- pending, accepted, expired, revoked
  expires_at TIMESTAMPTZ NOT NULL,       -- 7 dias
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- MODIFICATIONS TO EXISTING TABLES
-- =============================================

-- Tudo pertence à org (não ao usuário diretamente)
ALTER TABLE channels ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE projects ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE research_archives ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE idea_archives ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE blog_drafts ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE video_drafts ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE shorts_drafts ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE podcast_drafts ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE canonical_core ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE templates ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE assets ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE wordpress_configs ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE ai_provider_configs ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;
ALTER TABLE agent_prompts ADD COLUMN org_id UUID REFERENCES organizations;  -- nullable (system prompts)

-- Credit usage pertence à org + registra quem usou
ALTER TABLE credit_usage ADD COLUMN org_id UUID REFERENCES organizations NOT NULL;

-- user_id continua existindo (quem criou/executou), mas org_id é o dono real
```

### RLS Policies

```sql
-- Exemplo: projetos visíveis para membros da org
CREATE POLICY "org_members_can_view_projects"
  ON projects FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Exemplo: só members+ podem criar
CREATE POLICY "org_members_can_create_projects"
  ON projects FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_memberships 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'member')
    )
  );

-- Exemplo: viewers não podem deletar
CREATE POLICY "org_admins_can_delete_projects"
  ON projects FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR (
      -- Member pode deletar o próprio
      user_id = auth.uid()
      AND org_id IN (
        SELECT org_id FROM org_memberships
        WHERE user_id = auth.uid()
      )
    )
  );
```

---

## 5. API Routes

| Método | Rota | Descrição | Role mínimo |
|---|---|---|---|
| **Auth** | | | |
| POST | `/api/auth/signup` | Criar conta + org pessoal | — |
| POST | `/api/auth/login` | Magic link / OAuth | — |
| POST | `/api/auth/logout` | Logout | — |
| POST | `/api/auth/refresh` | Refresh token | — |
| **Org** | | | |
| GET | `/api/org` | Org atual do usuário | Viewer |
| PUT | `/api/org` | Atualizar org | Admin |
| DELETE | `/api/org` | Deletar org | Owner |
| **Team** | | | |
| GET | `/api/org/members` | Listar membros | Viewer |
| POST | `/api/org/invites` | Convidar membro | Admin |
| DELETE | `/api/org/invites/:id` | Revogar convite | Admin |
| POST | `/api/org/invites/:token/accept` | Aceitar convite | — |
| PATCH | `/api/org/members/:userId/role` | Mudar role | Owner |
| DELETE | `/api/org/members/:userId` | Remover membro | Admin |
| PATCH | `/api/org/members/:userId/credit-limit` | Setar limite de créditos | Owner |
| **Credits** | | | |
| GET | `/api/credits/balance` | Saldo da org | Viewer |
| GET | `/api/credits/usage` | Histórico geral | Viewer |
| GET | `/api/credits/usage/by-member` | Uso por membro | Admin |
| GET | `/api/credits/usage/by-channel` | Uso por canal | Viewer |
