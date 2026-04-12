---
title: Onboarding + Multi-Channel Management
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# Onboarding + Gestão de Canais

## Conceito

O usuário pode gerenciar **múltiplos canais/projetos de conteúdo**. Cada canal tem seu nicho, idioma, mercado-alvo e configurações próprias. O onboarding guia o setup do primeiro canal.

---

## 1. Estrutura Multi-Canal

```
Usuário (Rafael)
├── Canal 1: "Produtividade Dark" (YouTube, PT-BR, Brasil, dark channel)
│   ├── Config: nicho, idioma, voz, modelo IA
│   ├── Pesquisas
│   ├── Projetos (blogs, vídeos, shorts)
│   └── Analytics
├── Canal 2: "Tech Reviews" (YouTube + Blog, EN, USA, com rosto)
│   ├── Config: ...
│   ├── Pesquisas
│   └── Projetos
└── Canal 3: "Finanças Simples" (Blog only, PT-BR, Brasil)
    ├── Config: ...
    └── Projetos
```

### Dashboard Centralizado

```
┌────────────────────────────────────────────────────────┐
│  Meus Canais                           [+ Novo Canal]  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🎬 Produtividade Dark                            │  │
│  │ YouTube • PT-BR • Brasil • Dark Channel          │  │
│  │ 12 vídeos publicados • Est. R$ 38.750/mês        │  │
│  │ [Abrir] [Pesquisar] [Gerar Conteúdo]             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 📝 Tech Reviews                                  │  │
│  │ YouTube + Blog • EN • USA • Com rosto            │  │
│  │ 8 posts + 4 vídeos • Est. $2.100/mês             │  │
│  │ [Abrir] [Pesquisar] [Gerar Conteúdo]             │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 💰 Finanças Simples                              │  │
│  │ Blog • PT-BR • Brasil                            │  │
│  │ 15 posts publicados • 3.200 views/mês            │  │
│  │ [Abrir] [Pesquisar] [Gerar Conteúdo]             │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Onboarding (primeiro acesso)

Flow progressivo — wizard simples com perguntas diretas.

### Tela 1: Bem-vindo

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  👋 Bem-vindo ao BrightTale!                          │
│                                                        │
│  Vamos configurar seu primeiro canal de conteúdo.      │
│  Leva menos de 2 minutos.                              │
│                                                        │
│  [Começar →]                                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 2: Você já tem um canal?

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Você já tem um canal do YouTube ou blog?              │
│                                                        │
│  ┌────────────────────┐  ┌────────────────────┐       │
│  │ ✅ Sim, já tenho    │  │ 💡 Não, quero      │       │
│  │                    │  │    começar do zero  │       │
│  │ Vou analisar seu   │  │                    │       │
│  │ canal e te dar     │  │ Te ajudo a escolher │       │
│  │ ideias baseadas    │  │ o melhor nicho     │       │
│  │ em dados reais     │  │                    │       │
│  └────────────────────┘  └────────────────────┘       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 3A: Já tem canal → Conectar

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Cole a URL do seu canal ou blog:                      │
│                                                        │
│  [https://youtube.com/@meuchannel_____________]        │
│                                                        │
│  Tipo:                                                 │
│  ● YouTube   ○ Blog   ○ Ambos                         │
│                                                        │
│  [Analisar Canal →]                                    │
│                                                        │
│  ⏳ Analisando...                                      │
│  ✅ Canal encontrado: "Meu Channel"                    │
│  📊 67K subs • 540K views/mês • Nicho: Tecnologia     │
│  📈 Top vídeo: "Como usar IA" (120K views)            │
│                                                        │
│  [Continuar →]                                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 3B: Não tem canal → Descobrir nicho

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Que tipo de conteúdo te interessa?                    │
│                                                        │
│  ☐ Tecnologia         ☐ Finanças                      │
│  ☐ Produtividade      ☐ Saúde / Fitness               │
│  ☐ Psicologia         ☐ Curiosidades                  │
│  ☐ Automação          ☐ Empreendedorismo              │
│  ☐ Educação           ☐ Entretenimento                │
│  ☐ Outro: [__________]                                │
│                                                        │
│  Pode marcar mais de um.                               │
│                                                        │
│  [Buscar Nichos →]                                     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 4: Mercado e Idioma

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Para qual público esse conteúdo será feito?           │
│                                                        │
│  Idioma:                                               │
│  ● Português (BR)                                      │
│  ○ English (US)                                        │
│  ○ English (UK)                                        │
│  ○ Español                                             │
│  ○ Outro: [________]                                   │
│                                                        │
│  País/Mercado:                                         │
│  ● Brasil                                              │
│  ○ Estados Unidos                                      │
│  ○ Internacional (múltiplos países)                    │
│  ○ Outro: [________]                                   │
│                                                        │
│  [Continuar →]                                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 5: Tipo de Canal

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Como você quer produzir conteúdo?                     │
│                                                        │
│  ┌───────────────┐ ┌───────────────┐ ┌──────────────┐ │
│  │ 📝 Só Texto   │ │ 🎬 Com Rosto  │ │ 👻 Dark      │ │
│  │               │ │               │ │  Channel     │ │
│  │ Blog posts,   │ │ Roteiro +     │ │              │ │
│  │ artigos SEO,  │ │ teleprompter, │ │ IA gera tudo:│ │
│  │ newsletters   │ │ você grava    │ │ voz, visual, │ │
│  │               │ │               │ │ montagem     │ │
│  │ Créditos: $   │ │ Créditos: $$  │ │ Créditos: $$$│ │
│  └───────────────┘ └───────────────┘ └──────────────┘ │
│                                                        │
│  ☐ Híbrido (mix de tipos)                             │
│                                                        │
│  [Continuar →]                                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 6: Resultado da Análise de Nicho (se escolheu "não tenho canal")

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  📊 Análise do Nicho: Produtividade (PT-BR, Brasil)   │
│                                                        │
│  Canais de referência neste nicho:                     │
│                                                        │
│  │ Canal           │ Subs  │ Views/mês │ Vídeos │ Est.│
│  │─────────────────│───────│───────────│────────│─────│
│  │ Produtividade+  │ 320K  │ 1.2M     │ 4/mês  │ R$5K│
│  │ Foco & Ação     │ 180K  │ 600K     │ 8/mês  │ R$2K│
│  │ MindHack BR     │ 95K   │ 400K     │ 3/mês  │ R$1K│
│  │ Rotina Dev      │ 67K   │ 540K     │ 3/mês  │ R$1K│
│  │ HábitsLab       │ 45K   │ 200K     │ 2/mês  │ R$600│
│                                                        │
│  💡 Oportunidades encontradas:                         │
│  • "Deep work para devs" — pouco explorado, alto       │
│    volume de busca                                     │
│  • "Automação de rotina" — tendência crescente         │
│  • "Produtividade sem hustle culture" — ângulo          │
│    contra-narrativa com potencial viral                 │
│                                                        │
│  ⚠️ Saturado:                                          │
│  • "Morning routine" — 200+ vídeos recentes            │
│  • "Pomodoro technique" — muito coberto                 │
│                                                        │
│  [Criar Canal com este Nicho →]                        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tela 7: Nome do Canal

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Dê um nome para este canal no BrightTale:             │
│                                                        │
│  [Produtividade Dark________________________]          │
│                                                        │
│  (Só para organização interna — não aparece público)   │
│                                                        │
│  Resumo:                                               │
│  📍 Nicho: Produtividade                               │
│  🌍 Mercado: Brasil (PT-BR)                            │
│  🎬 Tipo: Dark Channel                                 │
│  🤖 Modelo: Standard (otimizado)                       │
│                                                        │
│  [🚀 Criar Canal e Começar →]                          │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 3. Dashboard de Canal (após onboarding)

### Vista de Canal Individual

```
┌────────────────────────────────────────────────────────┐
│  🎬 Produtividade Dark          [⚙️ Config] [← Canais]│
│  YouTube • PT-BR • Brasil • Dark Channel               │
│                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ 12       │ │ R$38.750 │ │ 540K     │ │ 67K      │ │
│  │ Vídeos   │ │ Est/mês  │ │ Views/mês│ │ Subs     │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Ações Rápidas                                    │  │
│  │                                                  │  │
│  │ [🔍 Nova Pesquisa]  [📝 Gerar Conteúdo]         │  │
│  │ [⚡ Express: Vídeo Completo]                     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Projetos Recentes                                     │
│  │ Título                │ Tipo  │ Status │ Data      │
│  │───────────────────────│───────│────────│───────────│
│  │ Deep Work para Devs   │ Video │ Pronto │ 10/04     │
│  │ 5 Hacks de Foco       │ Video │ Em rev.│ 09/04     │
│  │ Automatize sua Rotina │ Blog  │ Public.│ 08/04     │
│  │ Café e Produtividade  │ Video │ Rascun.│ 07/04     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Tabela de Desempenho (estilo dashboard da imagem)

```
┌──────────────────────────────────────────────────────────────────────┐
│  📊 DASHBOARD DE CANAIS — GERENCIADO COM BRIGHTTALE                  │
│                                                                      │
│  │ Canal              │ Nicho      │ Subs │ Views/mês │ Vídeos │ $  │
│  │────────────────────│────────────│──────│───────────│────────│────│
│  │ Produtividade Dark │ Produtiv.  │ 67K  │ 540K     │ 12     │ $1K│
│  │ Finanças Fácil     │ Finanças   │ 215K │ 1.2M     │ 8      │ $5K│
│  │ Crypto Insights    │ Crypto     │ 64K  │ 320K     │ 6      │ $620│
│  │ Automação Pro      │ Automação  │ 38K  │ 100K     │ 4      │ $200│
│  │ ...                │ ...        │ ...  │ ...      │ ...    │ ...│
│                                                                      │
│  Total: 5 canais • Est. R$ 38.750/mês                                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Configuração de Canal

Cada canal tem suas próprias configurações:

```
┌────────────────────────────────────────────────────────┐
│  ⚙️ Configurações: Produtividade Dark                  │
│                                                        │
│  Geral                                                 │
│  Nome: [Produtividade Dark_______________]             │
│  Nicho: [Produtividade ▼]                              │
│  Mercado: [Brasil ▼]                                   │
│  Idioma: [Português (BR) ▼]                            │
│  Tipo: [Dark Channel ▼]                                │
│                                                        │
│  YouTube (opcional)                                     │
│  Canal URL: [https://youtube.com/@prodark___]          │
│  [🔗 Conectar via OAuth]  Status: ✅ Conectado         │
│                                                        │
│  Blog (opcional)                                       │
│  WordPress: [https://prodark.com____________]          │
│  Custom API: [https://api.prodark.com/posts_]          │
│                                                        │
│  Voz                                                   │
│  Provider: [ElevenLabs ▼]                              │
│  Voz: [Rachel - Narração ▼]   [▶ Preview]             │
│  Velocidade: [1.0x ▼]                                  │
│                                                        │
│  IA                                                    │
│  Modelo: [Standard (recomendado) ▼]                    │
│  Tom: [Informativo e direto ▼]                         │
│  Template: [Dark Channel Padrão ▼]                     │
│                                                        │
│  Conteúdo Evergreen                                    │
│  ● Sim — conteúdo atemporal (recomendado)              │
│  ○ Não — conteúdo de tendência (trending)              │
│  ○ Mix — ambos                                         │
│                                                        │
│  [Salvar]                                              │
└────────────────────────────────────────────────────────┘
```

---

## 5. Data Model

### Novas tabelas

```sql
-- Canal/projeto de conteúdo do usuário
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,                          -- "Produtividade Dark"
  niche TEXT,                                   -- "produtividade"
  niche_tags TEXT[],                            -- ["produtividade", "foco", "deep work"]
  market TEXT NOT NULL DEFAULT 'br',            -- "br", "us", "international"
  language TEXT NOT NULL DEFAULT 'pt-BR',       -- "pt-BR", "en-US"
  channel_type TEXT NOT NULL DEFAULT 'text',    -- "text", "face", "dark", "hybrid"
  is_evergreen BOOLEAN DEFAULT true,
  
  -- YouTube (opcional)
  youtube_url TEXT,
  youtube_channel_id TEXT,
  youtube_oauth_token_json JSONB,              -- encrypted
  
  -- Blog (opcional)
  blog_url TEXT,
  wordpress_config_id UUID REFERENCES wordpress_configs,
  custom_endpoint_url TEXT,
  custom_endpoint_headers_json JSONB,          -- encrypted
  custom_endpoint_field_mapping_json JSONB,
  
  -- Voice config
  voice_provider TEXT DEFAULT 'openai',        -- "openai", "elevenlabs"
  voice_id TEXT,                                -- "rachel", "alloy", etc.
  voice_speed NUMERIC DEFAULT 1.0,
  voice_style TEXT DEFAULT 'narration',
  
  -- IA config
  model_tier TEXT DEFAULT 'standard',          -- "standard", "premium", "ultra", "custom"
  custom_model_config_json JSONB,              -- per-stage model override
  tone TEXT DEFAULT 'informative',
  template_id UUID REFERENCES templates,
  
  -- Stats cache
  youtube_subs INTEGER,
  youtube_monthly_views BIGINT,
  estimated_revenue_brl NUMERIC,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Análises de nicho do YouTube (cache)
CREATE TABLE youtube_niche_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels,
  user_id UUID REFERENCES auth.users NOT NULL,
  niche TEXT NOT NULL,
  market TEXT NOT NULL,
  language TEXT NOT NULL,
  
  -- Resultados
  reference_channels_json JSONB,     -- [{name, subs, views, videos_per_month, est_revenue}]
  top_videos_json JSONB,             -- [{title, views, likes, duration, url, engagement_rate}]
  opportunities_json JSONB,          -- [{topic, search_volume, competition, potential}]
  saturated_topics_json JSONB,       -- [{topic, reason, video_count}]
  optimal_duration TEXT,
  optimal_posting_schedule TEXT,
  
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Voice generations
CREATE TABLE voice_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels,
  project_id UUID REFERENCES projects,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  provider TEXT NOT NULL,            -- "openai", "elevenlabs"
  voice_id TEXT NOT NULL,
  input_text TEXT NOT NULL,
  audio_url TEXT,                    -- S3/storage URL
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  credits_used INTEGER NOT NULL,
  
  status TEXT DEFAULT 'pending',    -- "pending", "generating", "ready", "failed"
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Video generations
CREATE TABLE video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels,
  project_id UUID REFERENCES projects,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  video_type TEXT NOT NULL,          -- "dark_channel", "shorts", "ai_clips"
  
  -- Components
  voice_generation_id UUID REFERENCES voice_generations,
  script_json JSONB,                 -- script with B-roll markers
  footage_sources_json JSONB,        -- [{source: "pexels", query: "...", clip_url: "..."}]
  ai_images_json JSONB,              -- [{prompt, url}]
  subtitle_url TEXT,                 -- SRT file URL
  thumbnail_url TEXT,
  background_music_url TEXT,
  
  -- Output
  video_url TEXT,                    -- final video URL
  duration_seconds INTEGER,
  resolution TEXT DEFAULT '1080p',
  aspect_ratio TEXT DEFAULT '16:9', -- "16:9", "9:16" (shorts)
  file_size_bytes BIGINT,
  credits_used INTEGER NOT NULL,
  
  status TEXT DEFAULT 'pending',    -- "pending", "assembling", "ready", "failed"
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Token/credit usage tracking
CREATE TABLE credit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  channel_id UUID REFERENCES channels,
  project_id UUID REFERENCES projects,
  
  action TEXT NOT NULL,              -- "brainstorm", "research", "blog", "video", "voice", etc.
  credits_used INTEGER NOT NULL,
  model_tier TEXT DEFAULT 'standard',
  model_name TEXT,                   -- "claude-sonnet-4.6", "gemini-2.5-flash"
  
  metadata_json JSONB,              -- action-specific data
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User onboarding state
ALTER TABLE user_profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN onboarding_step TEXT;
```

### Tabelas modificadas

```sql
-- Projects agora pertencem a um canal
ALTER TABLE projects ADD COLUMN channel_id UUID REFERENCES channels;

-- Video drafts ganham mídia
ALTER TABLE video_drafts ADD COLUMN voice_generation_id UUID REFERENCES voice_generations;
ALTER TABLE video_drafts ADD COLUMN video_generation_id UUID REFERENCES video_generations;
ALTER TABLE video_drafts ADD COLUMN audio_url TEXT;
ALTER TABLE video_drafts ADD COLUMN video_url TEXT;
ALTER TABLE video_drafts ADD COLUMN subtitle_url TEXT;
```

---

## 6. API Routes Novas

| Método | Rota | Descrição |
|---|---|---|
| **Channels** | | |
| GET | `/api/channels` | Listar canais do usuário |
| POST | `/api/channels` | Criar canal (onboarding) |
| GET | `/api/channels/:id` | Detalhe do canal |
| PUT | `/api/channels/:id` | Atualizar config do canal |
| DELETE | `/api/channels/:id` | Deletar canal |
| GET | `/api/channels/:id/stats` | Stats do canal (YouTube API) |
| **YouTube Intelligence** | | |
| POST | `/api/youtube/analyze-channel` | Analisar canal por URL |
| POST | `/api/youtube/analyze-niche` | Analisar nicho (keyword + market + language) |
| GET | `/api/youtube/analyses/:channelId` | Cached analyses |
| **Voice** | | |
| POST | `/api/voice/generate` | Gerar narração |
| GET | `/api/voice/status/:id` | Status da geração |
| GET | `/api/voice/:id/download` | Download do áudio |
| POST | `/api/voice/clone` | Clonar voz (upload sample) |
| GET | `/api/voice/voices` | Listar vozes disponíveis |
| **Video** | | |
| POST | `/api/video/generate` | Gerar vídeo completo |
| GET | `/api/video/status/:id` | Status da geração |
| GET | `/api/video/:id/download` | Download do vídeo |
| GET | `/api/video/:id/preview` | Preview (streaming) |
| **Credits** | | |
| GET | `/api/credits/balance` | Saldo atual |
| GET | `/api/credits/usage` | Histórico de uso |
| GET | `/api/credits/usage/by-channel` | Uso por canal |
| **Publishing** | | |
| POST | `/api/publish/youtube` | Upload para YouTube |
| POST | `/api/publish/custom` | Enviar para custom endpoint |
| **Onboarding** | | |
| GET | `/api/onboarding/status` | Step atual do onboarding |
| POST | `/api/onboarding/complete` | Marcar como completo |
