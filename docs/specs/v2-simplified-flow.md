---
title: BrightTale V2 — Simplified Flow + Media Pipeline
status: draft
milestone: v2.0
author: Rafael
date: 2026-04-11
points: TBD
---

# BrightTale V2 — Flow Simplificado + Pipeline de Mídia

## Problema

O flow atual é técnico demais: copiar YAML, colar no ChatGPT, colar de volta. Pessoas leigas não conseguem usar. O pipeline termina no texto — sem áudio, sem vídeo, sem publicação multi-plataforma.

## Solução

Pipeline end-to-end: **Tema → Pesquisa → Conteúdo → Áudio → Vídeo → Publicação** com o menor número de cliques possível e um **botão express** que faz tudo de uma vez.

---

## 1. Novo Flow do Usuário

### Setup Inicial (uma vez)

```
1. Qual seu nicho? (ex: "produtividade", "finanças pessoais", "culinária")
2. Tipo de canal: Evergreen? Dark (sem rosto)? Normal (com rosto)?
3. Plataformas de publicação: WordPress? YouTube? Custom endpoint?
4. Preferência de voz: Escolher voz do ElevenLabs / OpenAI TTS
5. Modelo de IA: Standard (otimizado custo) ou Premium (escolher modelo)
```

Salva no perfil do usuário. Não precisa configurar de novo.

### Flow de Criação (dia a dia)

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: PESQUISA                                       │
│                                                         │
│  [Tema: ___________]  [Nicho: ▼ Produtividade]         │
│                                                         │
│  ☐ Analisar YouTube (tendências do nicho)               │
│  ☐ Pesquisa web (fontes, dados, especialistas)          │
│                                                         │
│  [🔍 Pesquisar]                                         │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 2: RESULTADOS DA PESQUISA                         │
│                                                         │
│  📊 YouTube: Top 5 vídeos do nicho sobre este tema      │
│  📝 5 ideias geradas com veredito (viable/weak)         │
│  📚 Fontes e dados encontrados                          │
│                                                         │
│  Selecione a ideia: ○ Ideia 1  ○ Ideia 2  ● Ideia 3   │
│                                                         │
│  O que quer gerar?                                      │
│  ☑ Blog post    Quantos? [4▼]                          │
│  ☑ Vídeo YouTube                                        │
│  ☑ Shorts (3)                                           │
│  ☐ Podcast                                              │
│                                                         │
│  [⚡ Express: Gerar Tudo] [→ Gerar Passo a Passo]      │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 3: CONTEÚDO GERADO                                │
│                                                         │
│  📝 Blog Posts (4)     [Ver] [Editar] [✓ Aprovar]      │
│  🎬 Roteiro YouTube    [Ver] [Editar] [✓ Aprovar]      │
│  📱 Shorts (3)         [Ver] [Editar] [✓ Aprovar]      │
│                                                         │
│  [🔊 Gerar Áudio]  [🎬 Gerar Vídeo]  [⚡ Tudo]        │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 4: MÍDIA                                          │
│                                                         │
│  🔊 Áudio: Narração gerada (10:32)    [▶ Play] [✓]    │
│  🎬 Vídeo: Preview disponível         [▶ Play] [✓]    │
│  🖼️ Thumbnail: 3 opções              [Escolher]       │
│                                                         │
│  [📤 Publicar]                                          │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│  STEP 5: PUBLICAÇÃO                                     │
│                                                         │
│  📝 Blog → WordPress (myblog.com)     [Publicar]       │
│  📝 Blog → Custom API (api.site.com)  [Publicar]       │
│  🎬 Vídeo → YouTube                   [Upload]         │
│  📱 Shorts → YouTube                  [Upload]         │
│                                                         │
│  [📤 Publicar Tudo]                                     │
└─────────────────────────────────────────────────────────┘
```

### Botão Express (⚡)

Para o usuário apressado:
1. Clica em "Express"
2. Sistema gera tudo automaticamente (texto + áudio + vídeo + thumbnail)
3. Mostra preview final
4. Um clique para publicar tudo

---

## 2. YouTube Intelligence (tipo VidIQ)

### YouTube Data API Integration

Usar YouTube Data API v3 para:

| Feature | Endpoint | Dados |
|---|---|---|
| **Análise de canal** | `channels.list` + `search.list` | Subs, views, upload frequency |
| **Top vídeos do nicho** | `search.list` (by keyword, sorted by viewCount) | Título, views, likes, comments |
| **Trending no nicho** | `search.list` (by keyword, sorted by date + filters) | Vídeos recentes com mais views |
| **Análise de vídeo** | `videos.list` | Tags, description, engagement rate |
| **Transcrição** | YouTube Transcript API (não oficial) ou Whisper | Conteúdo falado para análise |

### Fluxo de Pesquisa YouTube

```
1. Usuário define nicho/tema
2. Sistema busca top 20 vídeos do nicho nos últimos 30 dias
3. Analisa: títulos, thumbnails, engagement rate, duração
4. Extrai transcrição dos top 5
5. IA analisa padrões:
   - Que títulos geram mais views?
   - Que duração performa melhor?
   - Que ângulos estão saturados vs underexplored?
6. Gera ideias baseadas em DADOS, não achismos
```

### Dados fornecidos ao Agent de Brainstorm

```yaml
youtube_intelligence:
  niche: "produtividade"
  top_performers:
    - title: "..."
      views: 500000
      engagement_rate: 8.2%
      duration: "12:30"
      tags: [...]
  content_gaps:
    - "Ninguém fala sobre X nesse nicho"
  saturated_topics:
    - "Morning routine (200+ vídeos recentes)"
  optimal_duration: "8-15min"
  optimal_posting: "terça e quinta, 14h"
```

---

## 3. Pipeline de Áudio

### Integração ElevenLabs

| Feature | Descrição |
|---|---|
| **Gerar narração** | Script → áudio via API |
| **Escolher voz** | Catálogo de vozes + voice cloning |
| **Preview** | Player inline no app |
| **Download** | MP3/WAV |
| **Idiomas** | PT-BR + EN + 30 outros |

### Integração OpenAI TTS (alternativa econômica)

| Feature | Descrição |
|---|---|
| **tts-1** | Padrão, boa qualidade, barato |
| **tts-1-hd** | Alta qualidade |
| **Vozes** | alloy, echo, fable, onyx, nova, shimmer |

### Configuração no Setup do Usuário

```
Provider de Voz: [ElevenLabs ▼] | [OpenAI TTS ▼]
Voz padrão: [Rachel ▼]
Velocidade: [1.0x ▼]
Estilo: [Narração ▼] | [Conversacional ▼] | [Energético ▼]
```

---

## 4. Pipeline de Vídeo

### Tipo: Canal Dark (sem rosto)

```
Script (com marcadores de B-roll)
    ↓
Narração (ElevenLabs/OpenAI TTS)
    ↓
Busca de footage:
  - Pexels/Pixabay (grátis) por keyword
  - IA gera imagens (Gemini Imagen) para conceitos abstratos
  - [Premium] Runway/Kling gera clips IA
    ↓
Montagem (FFmpeg/Remotion):
  - Sincroniza áudio com visuais
  - Adiciona legendas (Whisper → SRT)
  - Transições
  - Música de fundo (royalty-free)
    ↓
Thumbnail (IA + template)
    ↓
Vídeo final (MP4)
```

### Tipo: Canal Normal (com rosto)

```
Script (com marcadores de B-roll e cortes)
    ↓
Narração (guia — o creator grava por cima)
    ↓
Exports:
  - Script formatado para teleprompter
  - Marcadores de B-roll
  - Sugestões de corte
  - Thumbnail concepts
```

### Tipo: Shorts

```
Script (3-5 shorts de 15-60s)
    ↓
Narração curta (TTS)
    ↓
Visual: 1-3 clips de stock ou IA
    ↓
Legendas grandes (estilo Shorts)
    ↓
Vídeo vertical (9:16)
```

### APIs de Vídeo

| Componente | API | Custo | Fallback |
|---|---|---|---|
| Stock footage | Pexels + Pixabay | Grátis | — |
| Imagens IA | Gemini Imagen | $0.02/img | DALL-E |
| Clips IA (premium) | Runway gen4_turbo | $0.05/s | Kling AI |
| Legendas | Whisper | $0.01/min | — |
| Montagem | FFmpeg (server-side) | Grátis | Remotion |
| Thumbnail | Imagen + template | $0.02 | — |

---

## 5. Publicação Multi-Plataforma

### WordPress (já existe)
Manter integração atual.

### YouTube Upload
- YouTube Data API v3: `videos.insert`
- Upload vídeo + metadata (title, description, tags, thumbnail)
- Opção: publicar ou agendar

### Custom Endpoint (webhook genérico)

```
POST https://api.meublog.com/posts
Headers: { Authorization: Bearer xxx }
Body: {
  "title": "...",
  "content": "...",
  "slug": "...",
  "status": "draft",
  "featured_image_url": "...",
  "meta": { ... }
}
```

O usuário configura:
- URL do endpoint
- Headers de autenticação
- Mapeamento de campos (qual campo do BrightTale → qual campo do endpoint)

### Configuração de Destinos

```
Destinos de publicação:
  ☑ WordPress — myblog.com (configurado)
  ☑ YouTube — @meuchannel (conectado via OAuth)
  ☑ Custom — api.meusite.com/posts (configurado)
  ☐ Medium (futuro)
  ☐ Substack (futuro)
```

---

## 6. Geração em Massa (Bulk)

### Blog Bulk

```
Pesquisa: "Produtividade para devs"
Gerar: 4 blog posts
  → Post 1: "5 ferramentas que devs produtivos usam"
  → Post 2: "Por que Pomodoro não funciona para programadores"
  → Post 3: "Deep work: o guia prático para devs"
  → Post 4: "Como automatizar tarefas repetitivas"

Cada um com: draft completo, SEO, affiliate placement, imagens
```

### Video Bulk

```
Pesquisa: "Finanças pessoais para iniciantes"
Gerar: 3 vídeos + 9 shorts (3 per video)
  → Vídeo 1: "Como sair das dívidas em 90 dias" + 3 shorts
  → Vídeo 2: "5 investimentos para quem tem R$100" + 3 shorts
  → Vídeo 3: "O erro que 90% dos brasileiros comete com dinheiro" + 3 shorts

Cada um com: roteiro, áudio, vídeo montado, thumbnail
```

---

## 7. Dashboard de Consumo (estilo Claude Code)

```
┌────────────────────────────────────────┐
│  Plano: Creator (R$ 47/mês)           │
│                                        │
│  Tokens usados: ████████░░ 72%        │
│  21.600 / 30.000 tokens               │
│                                        │
│  Renova em: 15 dias (26/04/2026)      │
│                                        │
│  Uso por categoria:                    │
│  📝 Texto (LLM):     12.400 tokens    │
│  🔊 Voz (TTS):        5.200 tokens    │
│  🖼️ Imagens:          2.800 tokens    │
│  🎬 Vídeo:            1.200 tokens    │
│                                        │
│  Modelo atual: Standard (custo otim.)  │
│  [Trocar para Premium ↗]              │
│                                        │
│  Histórico: [Ver detalhes →]           │
└────────────────────────────────────────┘
```

---

## 8. Modelo por Stage (Smart Routing)

### Standard (default — otimizado custo)

| Stage | Modelo | Custo/stage | Por quê |
|---|---|---:|---|
| YouTube Research | Gemini 2.5 Flash | ~R$ 0,05 | Rápido, bom para análise |
| Brainstorm | Gemini 2.5 Flash | ~R$ 0,05 | Criatividade boa, barato |
| Research | Gemini 2.5 Pro | ~R$ 0,20 | Precisa ser factual |
| Production | Claude Sonnet 4.6 | ~R$ 0,37 | Melhor escrita longa |
| Review | Claude Haiku 4.5 | ~R$ 0,12 | QA/checklist |
| Voice | OpenAI tts-1 | ~R$ 0,60 | Bom custo-benefício |
| Images | Imagen 4 Fast | ~R$ 0,10 | Barato, boa qualidade |
| **Total** | | **~R$ 1,49** | |

### Premium (usuário escolhe)

| Stage | Modelo | Custo/stage | Multiplicador |
|---|---|---:|---:|
| Todos os stages | Claude Opus 4.6 | ~R$ 0,95/stage | 5x |
| Voice | ElevenLabs v2 | ~R$ 4,80 | 4x |
| Images | DALL-E 3 HD | ~R$ 0,60 | 3x |
| Video clips | Runway gen4 | ~R$ 2,50/10s | Premium add-on |

### Na UI:

```
Modelo de IA: 
  ● Standard (recomendado — custo otimizado)
  ○ Premium (modelos top — 3-5x mais tokens)
  ○ Personalizado (escolher modelo por stage)
      Brainstorm: [Gemini Flash ▼]
      Research:   [Gemini Pro ▼]
      Production: [Claude Sonnet ▼]
      Review:     [Claude Haiku ▼]
      Voice:      [ElevenLabs ▼]
```

---

## 9. Data Model Changes

### Novas tabelas

| Tabela | Propósito |
|---|---|
| `youtube_analyses` | Cache de análises YouTube por nicho |
| `voice_configs` | Config de voz por usuário (provider, voice_id, speed) |
| `voice_generations` | Áudios gerados (project_id, audio_url, duration) |
| `video_generations` | Vídeos montados (project_id, video_url, status) |
| `publishing_destinations` | Destinos de publicação (type, config_json) |
| `token_usage` | Consumo de tokens (user_id, category, amount, timestamp) |
| `user_preferences` | Nicho, tipo de canal, modelo default |

### Tabelas modificadas

| Tabela | Mudança |
|---|---|
| `projects` | + `generation_mode` (step-by-step / express) |
| `projects` | + `bulk_group_id` (agrupar projetos de bulk gen) |
| `video_drafts` | + `audio_url`, `video_url`, `subtitle_url` |
| `user_profiles` | + `niche`, `channel_type`, `default_model_tier` |

---

## 10. Estimativa de Implementação

| Fase | Escopo | Estimativa |
|---|---|---|
| **Fase 1** | Flow simplificado + modelo por stage + dashboard tokens | Médio |
| **Fase 2** | YouTube Intelligence (Data API) | Médio |
| **Fase 3** | Voice generation (ElevenLabs + OpenAI TTS) | Pequeno |
| **Fase 4** | Video assembly (FFmpeg + stock footage) | Grande |
| **Fase 5** | Bulk generation | Médio |
| **Fase 6** | Generic publishing (webhooks) + YouTube upload | Médio |
| **Fase 7** | Express mode (tudo automático) | Médio |
