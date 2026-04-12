---
title: Reference Modeling — Modelagem de Canais de Referência
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# Reference Modeling — "Modelar os Melhores"

## Conceito

O usuário seleciona **até 5 canais/blogs de referência** que o inspiram. O sistema analisa o que performa melhor nesses canais e usa como base para gerar conteúdo que segue os mesmos padrões de sucesso — mas com ângulo original.

Não é copiar. É **entender o que funciona e fazer melhor**.

---

## 1. Flow do Usuário

### No Setup do Canal (onboarding ou config)

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│  Tem canais ou blogs que te inspiram?                  │
│                                                        │
│  Adicione até 5 referências — vamos analisar o que     │
│  funciona pra eles e usar como base pros seus.         │
│                                                        │
│  Referência 1:                                         │
│  [https://youtube.com/@aliabdaal______________]        │
│  ✅ Ali Abdaal • 5.2M subs • Produtividade             │
│                                                        │
│  Referência 2:                                         │
│  [https://youtube.com/@thomasfrank_____________]       │
│  ✅ Thomas Frank • 3.1M subs • Produtividade            │
│                                                        │
│  Referência 3:                                         │
│  [https://youtube.com/@mattdavella_____________]       │
│  ✅ Matt D'Avella • 4.0M subs • Lifestyle               │
│                                                        │
│  Referência 4:                                         │
│  [_____________________________________________] + Add │
│                                                        │
│  Aceita: YouTube, Blog URL, ou nome do canal           │
│                                                        │
│  [Analisar Referências →]                              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Resultado da Análise

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  📊 Análise das suas Referências                                │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Referência         │ Subs  │ Views/mês │ Freq. │ Engaj.  │  │
│  │────────────────────│───────│───────────│───────│─────────│  │
│  │ Ali Abdaal         │ 5.2M  │ 12M      │ 3/sem │ 4.2%    │  │
│  │ Thomas Frank       │ 3.1M  │ 5M       │ 1/sem │ 5.8%    │  │
│  │ Matt D'Avella      │ 4.0M  │ 8M       │ 2/mês │ 6.1%    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  🏆 Top Vídeos das Referências (últimos 90 dias)               │
│                                                                 │
│  │ # │ Título                        │ Canal    │ Views │ Engaj│
│  │───│───────────────────────────────│──────────│───────│──────│
│  │ 1 │ "I Tried Every Productivity   │ Ali A.   │ 2.4M  │ 7.1%│
│  │   │  System — Here's What Works"  │          │       │      │
│  │ 2 │ "The Myth of Discipline"      │ Matt D.  │ 1.8M  │ 8.3%│
│  │ 3 │ "My Notion Setup 2026"        │ Thomas F.│ 1.2M  │ 5.9%│
│  │ 4 │ "How I Read 100 Books/Year"   │ Ali A.   │ 980K  │ 4.5%│
│  │ 5 │ "Why I Quit Social Media"     │ Matt D.  │ 870K  │ 9.2%│
│  │ 6 │ "5AM Morning Routine (honest)"│ Thomas F.│ 750K  │ 6.7%│
│  │ 7 │ "The Anti-Productivity Video" │ Ali A.   │ 620K  │ 5.1%│
│  │ 8 │ "Building a Second Brain"     │ Thomas F.│ 580K  │ 4.8%│
│  │ 9 │ "One Year Without a Phone"    │ Matt D.  │ 540K  │ 11% │
│  │10 │ "Deep Work Changed My Life"   │ Ali A.   │ 510K  │ 4.2%│
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  🔍 Padrões Identificados                                      │
│                                                                 │
│  Títulos que performam:                                         │
│  • Formato "I tried X — Here's what happened" → alto engaj.    │
│  • Contra-narrativa ("The Myth of...", "Why I Quit...")         │
│  • Listas com número ímpar ("5 things", "7 habits")            │
│  • Pessoal + Resultado ("How I X in Y time")                   │
│                                                                 │
│  Duração ideal: 12-18 min (nos seus nichos)                    │
│  Frequência ideal: 1-3x/semana                                │
│  Thumbnail pattern: close-up + texto grande + 2-3 cores        │
│                                                                 │
│  💡 Oportunidades (temas dos top vídeos não cobertos por você) │
│  • "Notion + IA para produtividade" — 0 vídeos seus            │
│  • "Deep work prático para devs" — gap no mercado BR           │
│  • "Anti-hustle productivity" — trend crescente                 │
│                                                                 │
│  [💡 Gerar Ideias Baseadas Nessas Referências →]               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Geração de Ideias (Brainstorm com Referências)

### O que muda no Agent 1 (Brainstorm)

O agente de brainstorm recebe **dados reais** das referências:

```yaml
BC_BRAINSTORM_INPUT:
  theme: "produtividade"
  channel_context:
    type: "dark_channel"
    market: "br"
    language: "pt-BR"
    is_evergreen: true
    
  reference_channels:
    - name: "Ali Abdaal"
      subs: 5200000
      monthly_views: 12000000
      top_videos:
        - title: "I Tried Every Productivity System"
          views: 2400000
          engagement: 7.1%
          duration: "15:32"
          tags: ["productivity", "systems", "review"]
          # Transcrição resumida dos top 3 (via Whisper)
          transcript_summary: "Compara Pomodoro, GTD, Time Blocking..."
        - title: "How I Read 100 Books/Year"
          views: 980000
          engagement: 4.5%
          ...
      patterns:
        avg_duration: "14:20"
        posting_frequency: "3/week"
        title_patterns: ["I tried X", "How I X", "The truth about X"]
        thumbnail_style: "close-up, bold text, 2-3 colors"
        
    - name: "Thomas Frank"
      ...
      
    - name: "Matt D'Avella"
      ...

  competitive_analysis:
    opportunities:
      - topic: "Notion + IA para produtividade"
        reason: "Alto volume de busca, pouco conteúdo em PT-BR"
        reference_video: "My Notion Setup 2026 (Thomas Frank, 1.2M views)"
      - topic: "Deep work prático"
        reason: "Gap no mercado BR, Ali Abdaal fez 510K views em EN"
    saturated:
      - topic: "Morning routine"
        reason: "200+ vídeos recentes, engagement caindo"
    
  directives:
    - "Gerar ideias que MODELAM os top vídeos das referências"
    - "Adaptar para o mercado BR (PT-BR)"
    - "Usar formatos de título que performam (dados acima)"
    - "Priorizar oportunidades identificadas"
    - "Cada ideia deve referenciar QUAL vídeo de referência inspirou"
```

### Output esperado do Brainstorm (com referências)

```yaml
BC_BRAINSTORM_OUTPUT:
  ideas:
    - idea_id: "bt-001"
      title: "Testei Todos os Métodos de Produtividade — Só UM Funciona"
      modeled_from:
        reference: "Ali Abdaal"
        original: "I Tried Every Productivity System — Here's What Works"
        original_views: 2400000
        adaptation: "Mesmo formato (testei X), mas para público BR com exemplos locais"
      title_pattern: "I tried X — result"
      core_tension: "Pessoas tentam vários métodos mas nenhum funciona consistentemente"
      why_it_works: "Formato comprovado (2.4M views na ref), curiosity gap forte"
      estimated_potential: "50-100K views (base no mercado BR do nicho)"
      verdict: "viable"
      
    - idea_id: "bt-002"
      title: "Por Que Disciplina é um Mito (e o que funciona de verdade)"
      modeled_from:
        reference: "Matt D'Avella"
        original: "The Myth of Discipline"
        original_views: 1800000
        adaptation: "Contra-narrativa + solução prática para BR"
      title_pattern: "contra-narrativa"
      why_it_works: "Contra-narrativa tem engagement 30% maior que a média"
      verdict: "viable"
      
    - idea_id: "bt-003"
      title: "Como Eu Leio 52 Livros por Ano (Método Realista)"
      modeled_from:
        reference: "Ali Abdaal"
        original: "How I Read 100 Books/Year"
        original_views: 980000
        adaptation: "52 livros é mais realista para BR, método adaptado"
      title_pattern: "How I X (method)"
      verdict: "viable"
      
    - idea_id: "bt-004"
      title: "Notion + IA: O Setup que Mudou Minha Produtividade"
      modeled_from:
        reference: "Thomas Frank"
        original: "My Notion Setup 2026"
        original_views: 1200000
        adaptation: "Adiciona IA (gap identificado), para público BR"
      opportunity: "Notion + IA — alto volume de busca, pouco conteúdo em PT-BR"
      verdict: "viable"
      
    - idea_id: "bt-005"
      title: "30 Dias Sem Redes Sociais — O Que Aconteceu"
      modeled_from:
        reference: "Matt D'Avella"
        original: "One Year Without a Phone"
        original_views: 540000
        adaptation: "30 dias (mais acessível que 1 ano), challenge format"
      verdict: "weak"
      verdict_reason: "Formato saturado globalmente, difícil diferenciar"
```

### O usuário vê na UI:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  💡 5 Ideias Geradas (baseadas nas suas referências)            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ✅ VIÁVEL                                                  │  │
│  │                                                           │  │
│  │ "Testei Todos os Métodos de Produtividade —               │  │
│  │  Só UM Funciona"                                          │  │
│  │                                                           │  │
│  │ 📌 Modelado de: Ali Abdaal — "I Tried Every               │  │
│  │    Productivity System" (2.4M views)                       │  │
│  │ 📊 Potencial estimado: 50-100K views (BR)                 │  │
│  │ 🎯 Formato: "Testei X — resultado" (comprovado)           │  │
│  │                                                           │  │
│  │ ○ Selecionar                                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ✅ VIÁVEL                                                  │  │
│  │ "Por Que Disciplina é um Mito"                            │  │
│  │ 📌 Modelado de: Matt D'Avella — "The Myth of              │  │
│  │    Discipline" (1.8M views)                                │  │
│  │ ○ Selecionar                                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ... mais 3 ideias ...                                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ⚠️ FRACA                                                  │  │
│  │ "30 Dias Sem Redes Sociais"                               │  │
│  │ 📌 Modelado de: Matt D'Avella (540K views)                │  │
│  │ ⚠️ Formato saturado, difícil diferenciar                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  O que quer gerar com a ideia selecionada?                     │
│  ☑ Blog post   Quantos? [1▼]                                  │
│  ☑ Vídeo YouTube                                               │
│  ☑ Shorts (3)                                                  │
│  ☐ Podcast                                                     │
│                                                                 │
│  [⚡ Express] [→ Passo a Passo]                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelagem para Blog

Funciona igual, mas com blogs de referência:

### Input

```
Referências de blog:
1. https://jamesclear.com (hábitos, produtividade)
2. https://waitbutwhy.com (deep dives, curiosidade)
3. https://nesslabs.com (produtividade + neurociência)
```

### O que o sistema analisa:

| Dado | Como obtém |
|---|---|
| Posts mais populares | Scrape de social shares / backlinks (via API: BuzzSumo, Ahrefs) |
| Estrutura dos posts | Analisa headings, word count, imagens |
| Keywords que rankam | SEMrush/Ahrefs API (ou Google Search Console do usuário) |
| Formato do título | Pattern matching nos top posts |
| Tom de escrita | IA analisa amostras do blog |
| CTA patterns | Onde e como colocam CTAs |
| Affiliate patterns | Como integram links de afiliado |

### Output para o Brainstorm

```yaml
reference_blogs:
  - name: "James Clear"
    url: "https://jamesclear.com"
    top_posts:
      - title: "Atomic Habits: Core Ideas"
        estimated_traffic: 500000/mo
        word_count: 3200
        headings: 12
        format: "listicle + storytelling"
      - title: "The 2-Minute Rule"
        estimated_traffic: 200000/mo
    patterns:
      avg_word_count: 2800
      title_format: "Short, punchy, benefit-driven"
      cta_placement: "mid-article + end"
      affiliate_style: "book recommendations, natural integration"
      tone: "Conversational, story-driven, actionable"
```

---

## 4. Re-análise Periódica

### Cron automático (semanal)

1. Busca novos vídeos/posts das referências
2. Identifica novos top performers
3. Atualiza oportunidades e temas saturados
4. Notifica o usuário: "Seu referência Ali Abdaal postou um vídeo sobre X que fez 800K views — quer modelar?"

### Na UI:

```
┌────────────────────────────────────────────────────────┐
│ 🔔 Novidades das suas referências                      │
│                                                        │
│ Ali Abdaal postou "Why I Stopped Using To-Do Lists"    │
│ há 3 dias — já tem 450K views e 8.2% engagement        │
│                                                        │
│ [Modelar este vídeo →] [Ignorar]                       │
└────────────────────────────────────────────────────────┘
```

---

## 5. Data Model

### Tabelas novas

```sql
-- Canais/blogs de referência vinculados a um channel
CREATE TABLE channel_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Referência
  type TEXT NOT NULL,                -- "youtube", "blog"
  name TEXT NOT NULL,                -- "Ali Abdaal"
  url TEXT NOT NULL,                 -- YouTube channel URL ou blog URL
  platform_id TEXT,                  -- YouTube channel ID
  
  -- Stats (cached, atualizado periodicamente)
  subscribers BIGINT,
  monthly_views BIGINT,
  posting_frequency TEXT,
  
  -- Análise
  top_videos_json JSONB,            -- [{title, views, engagement, duration, tags, url}]
  top_posts_json JSONB,             -- [{title, traffic, word_count, url}]
  patterns_json JSONB,              -- {title_patterns, avg_duration, tone, cta_style}
  
  last_analyzed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vídeos/posts específicos de referência (para modelagem)
CREATE TABLE reference_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID REFERENCES channel_references NOT NULL,
  
  type TEXT NOT NULL,                -- "video", "post"
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  platform_id TEXT,                  -- YouTube video ID
  
  -- Métricas
  views BIGINT,
  likes BIGINT,
  comments BIGINT,
  engagement_rate NUMERIC,
  duration_seconds INTEGER,          -- para vídeos
  word_count INTEGER,                -- para blogs
  published_at TIMESTAMPTZ,
  
  -- Análise profunda
  tags TEXT[],
  transcript_summary TEXT,           -- resumo da transcrição (vídeo)
  content_summary TEXT,              -- resumo do conteúdo (blog)
  title_pattern TEXT,                -- "how I X", "contra-narrativa", etc.
  thumbnail_analysis TEXT,           -- descrição do thumbnail
  
  -- Modelagem
  modeled_count INTEGER DEFAULT 0,   -- quantas vezes foi usado como referência
  
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link: ideia gerada ← referência que inspirou
ALTER TABLE idea_archives ADD COLUMN modeled_from_reference_id UUID REFERENCES reference_content;
ALTER TABLE idea_archives ADD COLUMN modeled_adaptation TEXT;  -- como foi adaptado
```

### Tabela `channel_references` — Índices

```sql
CREATE INDEX idx_channel_references_channel ON channel_references(channel_id);
CREATE INDEX idx_reference_content_reference ON reference_content(reference_id);
CREATE INDEX idx_reference_content_views ON reference_content(views DESC);
```

---

## 6. API Routes

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/channels/:id/references` | Listar referências do canal |
| POST | `/api/channels/:id/references` | Adicionar referência (URL) |
| DELETE | `/api/channels/:id/references/:refId` | Remover referência |
| POST | `/api/channels/:id/references/analyze` | Analisar todas as referências |
| GET | `/api/channels/:id/references/:refId/content` | Top vídeos/posts da referência |
| POST | `/api/channels/:id/references/:refId/content/:contentId/model` | Modelar um conteúdo específico |
| GET | `/api/channels/:id/opportunities` | Oportunidades baseadas nas referências |
| GET | `/api/channels/:id/notifications` | Novidades das referências |

---

## 7. Créditos

| Ação | Créditos |
|---|---:|
| Analisar 1 referência (YouTube) | 100 |
| Analisar 1 referência (Blog) | 80 |
| Transcrever vídeo de referência | 50 |
| Re-análise semanal (automática) | 50/referência |
| Brainstorm com referências | 100 (incluso no brainstorm normal) |

---

## 8. Limitações por Plano

| Feature | Free | Starter | Creator | Pro |
|---|:---:|:---:|:---:|:---:|
| Referências por canal | 0 | 2 | 5 | 10 |
| Re-análise automática | ❌ | ❌ | Semanal | Diária |
| Transcrição de vídeos | ❌ | ❌ | Top 3 | Todos |
| Blog scraping | ❌ | ❌ | ✅ | ✅ |
| Notificações de novidades | ❌ | ❌ | ✅ | ✅ |
| "Modelar este vídeo" (1 clique) | ❌ | ❌ | ✅ | ✅ |
