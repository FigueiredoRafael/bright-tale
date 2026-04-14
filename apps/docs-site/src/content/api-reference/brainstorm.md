# Brainstorm

Prefixo: `/api/brainstorm`

Geração assíncrona de ideias a partir de tema/nicho. Cada chamada dispara um job Inngest que progride emitindo eventos visíveis via SSE.

## POST `/sessions`

Enfileira um job de brainstorm.

**Request**

```json
{
  "channelId": "uuid",
  "inputMode": "blind" | "fine_tuned" | "reference_guided",
  "topic": "AI productivity for devs",
  "fineTuning": { "niche": "...", "tone": "...", "audience": "...", "goal": "...", "constraints": "..." },
  "referenceUrl": "https://...",
  "modelTier": "standard",
  "provider": "gemini" | "openai" | "anthropic" | "ollama",
  "model": "gemini-2.5-flash",
  "count": 5
}
```

`count` (3-10, default 5) — **F2-037** — número exato de ideias a gerar. Propagado como `input.target_count` pro agente + cap defensivo no job.

**Response 202**

```json
{ "data": { "sessionId": "uuid", "status": "queued" }, "error": null }
```

**Código 429 `INSUFFICIENT_CREDITS`** se o plano não cobrir o custo (exceto `provider=ollama` que é grátis).

## GET `/sessions/:id/events`

SSE stream de progresso. Query param opcional `?since=<isoTimestamp>` filtra eventos anteriores.

Formato:

```
data: {"id":"...","stage":"loading_prompt","message":"Carregando agente…","metadata":null,"created_at":"..."}
```

Stages emitidos: `queued` → `loading_prompt` → `calling_provider` → `parsing_output` → `saving` → `completed` (ou `failed`).

## Draft mode (F2-037)

Ideias geradas ficam em staging (`brainstorm_drafts`, TTL 24h) até o usuário decidir quais salvar.

### GET `/sessions/:id/drafts`

Lista as ideias staged pra sessão.

```json
{ "data": { "drafts": [ { "id", "session_id", "title", "verdict", ... } ] }, "error": null }
```

### POST `/sessions/:id/drafts/save`

Move ideias selecionadas pra `idea_archives` (biblioteca permanente). Remove do staging. Deixa as não selecionadas no staging até o TTL.

```json
{ "draftIds": ["uuid", ...] }
```

Response: `{ data: { saved: N }, error: null }`

### DELETE `/sessions/:id/drafts`

Descarta tudo sem salvar.

## GET `/sessions/:id`

Retorna a sessão + ideias já persistidas em `idea_archives` (após save).

```json
{
  "data": {
    "session": { "id", "status", "channel_id", "input_json", "model_tier", ... },
    "ideas": [ { "idea_id": "BC-IDEA-NNN", "title", "target_audience", "verdict", ... } ]
  },
  "error": null
}
```
