# Pipeline de agentes

O BrightTale usa um pipeline de agentes que transforma um tema em conteúdo multi-formato pronto pra publicação. Todos os agentes são chamados via API real dos providers (Anthropic/OpenAI/Gemini/Ollama) — YAML copy-paste é legado.

## Fluxo

```
Brainstorm → Research → Canonical Core → Produce (blog/video/shorts/podcast) → Review
```

## Lista completa de slugs

`agent_prompts.slug` em uso:

| Slug | Stage | Papel |
|---|---|---|
| `brainstorm` | brainstorm | Gera N ideias com verdict viable/weak/experimental |
| `research` | research | Cards de pesquisa com nível surface/medium/deep |
| `content-core` | production | Destila ideia+pesquisa em narrativa canônica |
| `blog` | production | Escreve blog (body markdown + meta + keywords) |
| `video` | production | Roteiro dual: teleprompter + editor_script + pacote YouTube |
| `shorts` | production | Roteiro de shorts vertical |
| `podcast` | production | Roteiro de podcast |
| `engagement` | production | Peças de engajamento cross-platform |
| `review` | review | QA: score, verdict, SEO, strengths, issues, fixes |

## Diretivas injetadas nos prompts (por migration)

Cada migration de `agent_prompts` apenda diretivas críticas ao `instructions` original. As ativas:

### Channel context (F2-048)
Todos os agentes recebem `input.channel = { name, niche, language, tone, presentation_style }`:
- **language** — output 100% no idioma do canal (pt-BR default). Zero mistura com inglês.
- **tone** — informativo / casual / técnico / irreverente.
- **presentation_style** (video/shorts):
  - `talking_head` → cues de delivery entre colchetes: `[lean forward]`, `[pausa dramática]`
  - `voiceover`/`faceless` → prosa limpa audiobook (vírgulas pra breath, reticências pra pausa, SEM brackets) — pronto pra ElevenLabs TTS sem pós-processamento

### Target length (F2-047)
`input.production_params`:
- Blog: `target_word_count` (300/500/700/1000…) — ±15% com substância, content_warning se pesquisa insuficiente
- Video: `target_duration_minutes` — ~150 palavras/min, chapters calibrados
- Podcast: ~140 palavras/min por tier (10/20/30/45/60 min)
- Shorts: estruturas explícitas pra 15s/30s/60s

### Dual script pro vídeo (F2-045)
Output top-level obrigatório:
- `teleprompter_script` — narração limpa, ready pro teleprompter
- `editor_script` — briefing pro editor: A-roll/B-roll com timestamps, SFX, BGM, efeitos, color, pacing

### Pacote YouTube completo (F2-046)
Também top-level no output do agente `video`:
- `video_title` — primary + 3 alternatives (A/B testáveis, ≤60 chars)
- `thumbnail_ideas[3-5]` — concept, text_overlay, emotion, color_palette, composition
- `pinned_comment` — pergunta/insight de engajamento (proibido "curtam!")
- `video_description` — SEO completa com timestamps, CTAs, hashtags (≥800 chars)
- `teleprompter_script` ≥1500 chars; chapters ≥300 chars cada; content_warning se insuficiente.

## Contratos YAML (BC_*)

Todos os agentes se comunicam via contratos YAML validados contra schemas Zod:

- `BC_BRAINSTORM_INPUT` → `BC_BRAINSTORM_OUTPUT`
- `BC_RESEARCH_INPUT` → `BC_RESEARCH_OUTPUT`
- `BC_PRODUCTION_INPUT` → `BC_CANONICAL_CORE` → per-format outputs
- `BC_REVIEW_INPUT` → `BC_REVIEW_OUTPUT`

## Fluxo de Dados

### Stage 1 → 2 (Brainstorm → Research)
**Ação do usuário:** Selecionar 1 ideia das 5-10 geradas.

O `selected_idea` inclui: title, core_tension, target_audience, scroll_stopper, curiosity_gap, primary_keyword, monetization.

### Stage 2 → 3 (Research → Production)
**Ação do usuário:** Revisar pesquisa, decidir prosseguir/pivotar/abandonar.

Passa: ideia selecionada + research_summary + sources + statistics + expert_quotes + counterarguments.

### Stage 3 → 4 (Production → Review)
**Ação do usuário:** Nenhuma (handoff automático).

Passa: todos os assets de produção (blog, video, shorts, podcast, engagement).

### Stage 4 → Publish
**Ação do usuário:** Revisar feedback, confirmar publicação.

Vereditos possíveis:
- `approved` → publicar conforme plano
- `revision_required` → voltar ao Production com feedback específico
- `rejected` → voltar ao Brainstorm/Research (raro)

## Fluxo Atual vs Futuro

| | Atual (manual) | Futuro (automático) |
|---|---|---|
| **Input** | Plataforma gera YAML | Plataforma gera input |
| **Processamento** | Copiar/colar no ChatGPT | Chama API da IA direto |
| **Output** | Colar resposta de volta | Parse automático |
| **Avanço** | Manual | Automático |
