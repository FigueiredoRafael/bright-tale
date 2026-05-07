---
title: YouTube Video Pipeline v2 — Competitive Script Generation
status: draft
milestone: v0.3
author: Hector Siman
date: 2026-05-06
points: TBD
---

# YouTube Video Pipeline v2 — Competitive Script Generation

## Problem

The current pipeline already generates a video script via `BC_VIDEO_OUTPUT` — but it is incomplete as a production package. Six concrete gaps prevent it from generating roteiros competitivos no mercado:

1. **Duração não controlada** — `target_duration_minutes` é enviado pela UI mas não está declarado no `inputSchema` do agente, então o agente ignora o campo silenciosamente.
2. **Lower thirds ausentes** — o `editor_script` não tem field para lower thirds (nome/título/source badge em cena), que é padrão em vídeos de canal informativo.
3. **Canal dark vs presenter não sinalizado** — o agente não sabe se o output é para um apresentador humano ou para um canal faceless/narrado por IA. O `teleprompter_script` precisa ter tom diferente em cada caso.
4. **Número de câmeras ausente** — o `editor_script` não sabe se há 1 câmera (corte simples) ou multi-angle, o que determina toda a linguagem de edição.
5. **TTS não integrado** — o `teleprompter_script` existe no output mas não há caminho automatizado para gerar o áudio. O endpoint `POST /api/voice/synthesize` já existe mas não está conectado ao draft.
6. **Mapper vídeo → Shorts ausente** — os Shorts são derivados do `BC_CANONICAL_CORE` independentemente do vídeo, sem aproveitar capítulos já gerados.

Adicionalmente: o `VideoStyleSelector` não está no `DraftEngine` (só no `ProductionForm` legado), então nenhum dos campos de `video_style_config` chega ao agente no fluxo ativo da pipeline.

## Solution

Fechar os 6 gaps de forma incremental sem quebrar o fluxo atual. O agente `BC_VIDEO` já tem 70% do output competitivo — os outputs `teleprompter_script`, `editor_script`, `thumbnail_ideas[]`, `video_description`, `pinned_comment` já existem. Precisamos apenas:

1. **Declarar** `production_params` no `inputSchema` do agente.
2. **Adicionar** `lower_thirds` e `camera_count` nos schemas relevantes.
3. **Adicionar** `channel_type: presenter | dark` ao `videoStyleConfigSchema` e injetar no job de produção a partir do canal.
4. **Criar** endpoint `POST /api/content-drafts/:id/synthesize` que lê o `teleprompter_script` do `draft_json` e chama o `VoiceService` existente.
5. **Criar** mapper `mapVideoOutputToShortsInput()` + adicionar FK `source_video_draft_id` em `shorts_drafts`.
6. **Plugar** `VideoStyleSelector` no `DraftEngine` e garantir que `video_style_config` chega ao job de produção via `productionParams`.
7. **Corrigir** `mapContentDraftFromDb` para incluir `production_params` no `DomainContentDraft`.

## Requirements

### Must Have

- [ ] `production_params.target_duration_minutes` declarado no `inputSchema` do agente BC_VIDEO
- [ ] `lower_thirds[]` adicionado ao `editor_script` (por seção do script)
- [ ] `channel_type: 'presenter' | 'dark'` adicionado ao `videoStyleConfigSchema` e ao agente
- [ ] `camera_count: number` adicionado ao `videoStyleConfigSchema` e ao agente
- [ ] `video_style_config` injetado no job de produção a partir do canal (auto-detect `video_style`)
- [ ] `VideoStyleSelector` plugado no `DraftEngine` para o tipo `video`
- [ ] `production_params` mapeado em `DomainContentDraft` (`mapContentDraftFromDb`)
- [ ] Endpoint `POST /api/content-drafts/:id/synthesize` que gera áudio a partir de `teleprompter_script`
- [ ] Mapper `mapVideoOutputToShortsInput()` que deriva `BC_SHORTS_INPUT` a partir de `BC_VIDEO_OUTPUT`
- [ ] FK `source_content_draft_id` em `shorts_drafts` para rastrear origem

### Nice to Have

- [ ] UI para exibir `teleprompter_script` como viewer separado (leitura limpa para TTS manual)
- [ ] Predição de duração em tempo real na UI (word count ÷ 150 wpm)
- [ ] Export `.txt` do `teleprompter_script` diretamente da página do vídeo
- [ ] Shorts derivados de vídeo como ação rápida ("Gerar Shorts deste vídeo")

## Data Model

### Modified Tables

| Table | Change | Description |
|---|---|---|
| `shorts_drafts` | ADD `source_content_draft_id uuid REFERENCES content_drafts(id)` | Rastreia de qual rascunho de vídeo os Shorts foram derivados |

> Nota: `video_style_config` já existe em `projects` como `string | null`. `camera_count` e `channel_type` ficam **dentro do JSON** de `video_style_config` — não precisam de coluna nova. A migration é apenas para a FK em `shorts_drafts`.

### Schema Changes (sem migration)

Os campos novos em `video_style_config` (`camera_count`, `channel_type`) são campos opcionais dentro do JSON blob existente. Apenas a validação Zod muda.

## API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/content-drafts/:id/synthesize` | Gera áudio TTS a partir do `teleprompter_script` do draft | Required |

### Request / Response

```json
// POST /api/content-drafts/:id/synthesize
// Request (body)
{
  "voiceId": "optional — sobrescreve o voiceId do canal",
  "provider": "elevenlabs | openai",
  "speed": 1.0,
  "format": "mp3"
}

// Response (success)
{
  "data": {
    "audioBase64": "...",
    "mimeType": "audio/mpeg",
    "estimatedSeconds": 480,
    "provider": "elevenlabs",
    "voiceId": "abc123",
    "characterCount": 4800
  },
  "error": null
}
```

O endpoint:
1. Busca o `content_draft` por `:id` + `user_id` (ownership check)
2. Extrai `teleprompter_script` de `draft_json`
3. Lê `voiceId` / `provider` / `speed` do canal associado (fallback para body params)
4. Chama o `VoiceService` existente (`apps/api/src/lib/voice/provider.ts`)
5. Retorna o áudio em base64

## Schema Changes

### `packages/shared/src/schemas/videoStyle.ts`

```typescript
// Adicionar ao videoStyleConfigSchema:
channel_type: z.enum(['presenter', 'dark']).optional(),
camera_count: z.number().int().min(1).max(6).optional(),
lower_thirds_enabled: z.boolean().optional(),
tts_enabled: z.boolean().optional(),
```

### `scripts/agents/video.ts` — `inputSchema`

Adicionar campo `production_params` ao `BC_VIDEO_INPUT`:

```typescript
{
  name: 'production_params',
  type: 'object',
  required: false,
  description: 'Optional production controls',
  fields: [
    {
      name: 'target_duration_minutes',
      type: 'number',
      required: false,
      description: 'Target video duration in minutes. Agent scales teleprompter_script to ~150 wpm.'
    }
  ]
}
```

E adicionar ao `videoStyleConfigSchema` do inputSchema:
```typescript
{ name: 'channel_type', type: 'string', description: 'presenter | dark' },
{ name: 'camera_count', type: 'number', description: 'Number of cameras (1–6)' },
{ name: 'lower_thirds_enabled', type: 'boolean', description: 'Include lower_thirds in editor_script' },
```

### `scripts/agents/video.ts` — `outputSchema` (editor_script)

Adicionar ao `editor_script`:

```typescript
{
  name: 'lower_thirds',
  type: 'array',
  required: false,
  description: 'Lower third overlays — only when lower_thirds_enabled = true',
  items: {
    type: 'object',
    fields: [
      { name: 'timestamp', type: 'string', description: 'e.g., "0:35"' },
      { name: 'line1', type: 'string', description: 'Primary text (name or stat)' },
      { name: 'line2', type: 'string', description: 'Secondary text (title or source)', required: false },
      { name: 'duration_seconds', type: 'number', description: 'How long it stays on screen' }
    ]
  }
}
```

### Regras a adicionar ao agente `BC_VIDEO`

```
- When channel_type = 'dark': teleprompter_script must be written for TTS — no visual delivery cues like [look at camera], no first-person references to physical presence. Write for voice only.
- When channel_type = 'presenter': teleprompter_script may include bracketed cues like [pause], [lean in].
- When camera_count > 1: editor_script must reference camera angles (e.g., "Cam A: wide shot", "Cam B: close-up"). When camera_count = 1 or undefined: use cut-based language only.
- When lower_thirds_enabled = true: generate lower_thirds[] in editor_script at every key stat, expert quote, and chapter title. Min 3 lower thirds per video.
- When tts_enabled = true: force teleprompter_script to be TTS-clean (no bracketed performance cues, no first-person physical references), regardless of channel_type. This allows presenter channels to opt-in to TTS narration without changing channel_type.
```

## Frontend Changes

### Modified Pages / Components

| Component | Change |
|---|---|
| [DraftEngine.tsx](apps/app/src/components/engines/DraftEngine.tsx) | Plugar `VideoStyleSelector` na seção de params de vídeo (próximo ao picker de duração, linhas 1584–1606). Incluir `video_style_config` em `productionParams` ao chamar `/produce`. |
| [DraftEngine.tsx](apps/app/src/components/engines/DraftEngine.tsx) | Enviar `video_style_config` também no scaffold creation (linhas 474/622), não só no `/produce`. |
| Video draft page [videos/[id]/page.tsx](apps/app/src/app/[locale]/(app)/videos/[id]/page.tsx) | Adicionar tab "Teleprompter" com viewer limpo do `teleprompter_script` + botão "Gerar Áudio". |
| Video draft page | Botão "Gerar Shorts" que chama `mapVideoOutputToShortsInput()` e cria um `shorts_draft` linkado. |

### `VideoStyleSelector` no DraftEngine

O selector já existe em [ProductionForm.tsx](apps/app/src/components/production/ProductionForm.tsx). Reutilizar o componente `VideoStyleSelector` diretamente — apenas plugar no `DraftEngine`.

Os campos relevantes a expor na UI para esta versão:
- `channel_type` (toggle: Presenter / Dark)
- `camera_count` (select: 1, 2, 3+)
- `cut_frequency` (já existe no selector)
- `b_roll_density` (já existe no selector)
- `lower_thirds_enabled` (toggle)

## Agent Workflow Impact

### Fluxo atual
```
Brainstorm → Research → Canonical Core → DraftEngine (/produce) → BC_VIDEO_INPUT → BC_VIDEO_OUTPUT
```

O `video_style_config` atualmente **não chega** ao `BC_VIDEO_INPUT` pelo fluxo do DraftEngine.

### Fluxo novo
```
Brainstorm → Research → Canonical Core → DraftEngine (/produce)
  productionParams: {
    target_duration_minutes: 8,
    video_style_config: {
      channel_type: 'presenter',    ← novo
      camera_count: 2,              ← novo
      cut_frequency: 'moderate',
      b_roll_density: 'moderate',
      lower_thirds_enabled: true,   ← novo
      tts_enabled: false,
    }
  }
  → production-produce.ts: merge com channel.video_style do canal
  → mapCanonicalCoreToVideoInput(): inclui video_style_config + production_params
  → BC_VIDEO_INPUT → BC_VIDEO_OUTPUT (com lower_thirds, teleprompter TTS-ready, camera cues)
```

### Mapper vídeo → Shorts

```typescript
// packages/shared/src/mappers/video-to-shorts.ts (novo arquivo)
export function mapVideoOutputToShortsInput(
  videoOutput: BC_VIDEO_OUTPUT,
  canonicalCore: BC_CANONICAL_CORE
): BC_SHORTS_INPUT {
  // Extrai os 2 capítulos com key_stat_or_quote mais forte
  // + turning_point do canonical_core como Short #1
  // Retorna BC_SHORTS_INPUT completo
}
```

## Critical Files to Change

| File | Change |
|---|---|
| [scripts/agents/video.ts](scripts/agents/video.ts) | `inputSchema`: add `production_params`, `channel_type`, `camera_count`, `lower_thirds_enabled`. `outputSchema`: add `lower_thirds[]` to `editor_script`. Add 4 new rules. |
| [packages/shared/src/schemas/videoStyle.ts](packages/shared/src/schemas/videoStyle.ts) | Add `channel_type`, `camera_count`, `lower_thirds_enabled`, `tts_enabled` to `videoStyleConfigSchema`. |
| [packages/shared/src/types/agents.ts](packages/shared/src/types/agents.ts) | Add `production_params` to `VideoInput`. Add `lower_thirds[]` to `VideoEditorScript`. Add `channel_type` to `VideoStyleConfig`. |
| [packages/shared/src/mappers/db.ts](packages/shared/src/mappers/db.ts) | Add `production_params` mapping in `mapContentDraftFromDb` / `DomainContentDraft`. |
| [apps/api/src/jobs/production-produce.ts](apps/api/src/jobs/production-produce.ts) | Load `channel.video_style` and `channel.voice_id` / `channel.voice_provider` in channel query (line ~126). Merge into `video_style_config` before calling mapper. |
| [apps/api/src/routes/content-drafts.ts](apps/api/src/routes/content-drafts.ts) | Add `POST /:id/synthesize` route. |
| [apps/app/src/components/engines/DraftEngine.tsx](apps/app/src/components/engines/DraftEngine.tsx) | Plug `VideoStyleSelector`. Include `video_style_config` in `productionParams`. |
| [supabase/migrations/](supabase/migrations/) | 1 migration: add `source_content_draft_id` FK to `shorts_drafts`. |
| `packages/shared/src/mappers/video-to-shorts.ts` | New file: `mapVideoOutputToShortsInput()`. |

## Security Considerations

- O endpoint `/synthesize` deve validar `ownership` do draft antes de acessar `draft_json` (usar `assertContentDraftOwner` existente).
- `teleprompter_script` pode conter conteúdo do canal do usuário — não logar em Axiom sem redação. Usar o pattern de redação já existente (`apps/api/src/lib/axiom.ts`).
- `voiceId` do body request deve ser validado contra uma lista de providers permitidos — não passar strings arbitrárias ao provider.

## Migration Plan

```sql
-- YYYYMMDDHHMMSS_add_source_video_to_shorts_drafts.sql
ALTER TABLE public.shorts_drafts
  ADD COLUMN IF NOT EXISTS source_content_draft_id UUID REFERENCES public.content_drafts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shorts_drafts_source_content_draft_id
  ON public.shorts_drafts(source_content_draft_id);
```

Sem necessidade de backfill — `source_content_draft_id` é nullable.

## Verification

1. **Agent output**: Chamar `BC_VIDEO` com `channel_type: 'dark'`, `camera_count: 2`, `lower_thirds_enabled: true`, `target_duration_minutes: 8`. Verificar que `teleprompter_script` não tem cues visuais, `editor_script` tem `lower_thirds[]`, duração estimada ~8min.
2. **TTS endpoint**: `POST /api/content-drafts/:id/synthesize` com draft de vídeo com `teleprompter_script` no `draft_json`. Verificar `audioBase64` no response.
3. **Video → Shorts mapper**: Chamar `mapVideoOutputToShortsInput(videoOutput, canonicalCore)`. Verificar que retorna `BC_SHORTS_INPUT` válido com 3 hooks derivados dos capítulos.
4. **DraftEngine**: Gerar um vídeo via pipeline com `VideoStyleSelector` visível, selecionar `channel_type: dark`. Verificar no log do job que `video_style_config.channel_type = 'dark'` chega ao `BC_VIDEO_INPUT`.
5. **Migration**: `npm run db:push:dev` + `npm run db:types`. Verificar que `source_content_draft_id` aparece em `packages/shared/src/types/database.ts`.
6. **Seed regeneration**: Após qualquer mudança em `scripts/agents/video.ts` (input/output schema ou regras), rodar `npm run db:seed` para atualizar `agent_prompts.sections_json` no banco. Sem isso, o agente em runtime continua usando o prompt antigo.

## Open Questions

- [ ] O `VideoStyleSelector` no DraftEngine deve ser colapsável (advanced options) ou sempre visível? — impacta UX.
- [ ] Para canal dark com TTS: usar `voice_id` do canal ou deixar o usuário sobrescrever por projeto? A proposta atual usa o canal como default + override opcional no body.
- [ ] O mapper vídeo→Shorts deve ser disparado automaticamente após gerar o vídeo (auto-pilot) ou só sob demanda (botão "Gerar Shorts")? — proposta atual: sob demanda (Nice to Have).
