# Agent 3 — Production

**Arquivo principal:** `agents/agent-3-production.md`
**Papel:** Criador de conteúdo multi-formato.

## Arquitetura de Sub-Agentes

O Agent 3 é dividido em sub-agentes especializados por formato:

| Sub-agente | Arquivo | Output |
|---|---|---|
| **Canonical Core** | `agent-3a-content-core.md` | Framework central (tese, arco emocional, stats) |
| **Blog** | `agent-3b-blog.md` | Outline, draft completo, SEO, links internos |
| **Video** | `agent-3b-video.md` | Títulos, script com capítulos, thumbnail |
| **Shorts** | `agent-3b-shorts.md` | 3-5 vídeos curtos (15-60s) |
| **Podcast** | `agent-3b-podcast.md` | Talking points, ângulo pessoal, Q&A |
| **Engagement** | `agent-3b-engagement.md` | CTAs, hooks sociais, prompts de comentário |

## Fluxo de Produção

```
Research Output
      ↓
  Canonical Core (agent-3a)
      ↓
  ┌───┬───┬───┬───┬───┐
  │   │   │   │   │   │
Blog Video Shorts Podcast Engagement
  │   │   │   │   │   │
  └───┴───┴───┴───┴───┘
      ↓
  Production Output (todos os formatos)
```

O **Canonical Core** é gerado primeiro e alimenta todos os sub-agentes de formato, garantindo consistência.

## Input

| Campo | Descrição |
|---|---|
| `selected_idea` | Ideia com possível refinamento do Research |
| `research` | Summary, validation, sources, statistics, quotes, counterarguments |
| `formats` | Quais formatos gerar (blog, video, shorts, podcast) |

## Regras do Agente

- Web browsing **desabilitado** — trabalha com o material fornecido
- Canonical Core DEVE ser gerado antes de qualquer formato
- Cada formato tem suas regras específicas (SEO para blog, retenção para vídeo)
- Affiliate moments devem ser naturais, não forçados

## Próximo Passo

Todos os assets passam automaticamente para o [Agent 4 — Review](/agents/review).
