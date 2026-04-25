# Content Drafts

Prefixo: `/api/content-drafts`

Drafts de conteúdo final (blog/video/shorts/podcast). O pipeline de produção é assíncrono e roda 3 estágios em um único job Inngest: **canonical-core → produce → review**.

## POST `/`

Cria o scaffold do draft (sem gerar ainda).

```json
{
  "channelId": "uuid",
  "ideaId": "uuid",
  "researchSessionId": "uuid",
  "type": "blog" | "video" | "shorts" | "podcast",
  "title": "opcional",
  "productionParams": { "target_word_count": 700 }      // ou target_duration_minutes
}
```

`productionParams` persiste na coluna `production_params` do draft e pode ser override no `/generate`.

Response `200 { id, ...drafts row }`.

## GET `/`

Lista drafts do usuário.

```
?channel_id=<uuid>&type=blog
```

## GET `/:id`

Retorna o draft com `canonical_core_json`, `draft_json`, `review_feedback_json`, `status`.

## PATCH `/:id`

Edições manuais: title, draft_json (editor inline de corpo), status (draft/approved/published/…), scheduled_at, published_url.

## DELETE `/:id`

Remove o draft.

## POST `/:id/generate`

Enfileira o pipeline de produção completo (canonical-core + produce + review). **Este é o endpoint principal usado pela UI.**

```json
{
  "provider": "gemini" | "openai" | "anthropic" | "ollama",
  "model": "gemini-2.5-flash",
  "modelTier": "standard",
  "productionParams": { "target_word_count": 1000 }
}
```

Response `202 { draftId, status: "queued" }`.

**Credit cost:** 0 if provider=ollama; otherwise `calculateDraftCost(type, creditSettings) + costCanonicalCore`. The helper maps format types (blog, video, shorts, podcast) to their configured costs via the `credit_settings` table.

## GET `/:id/events`

SSE com `?since=<iso>`. Mensagens específicas:

```
[loading_prompt]  Carregando agente core…
[calling_provider] Estruturando ideia central com gemini (gemini-2.5-flash)…
[loading_prompt]  Carregando agente blog…
[calling_provider] Escrevendo blog com gemini (gemini-2.5-flash)…
[saving]          Salvando rascunho…
[calling_provider] Revisando com gemini (gemini-2.5-flash)…
[completed]       Post pronto!
```

Review é best-effort — se falhar o rascunho fica salvo (`status=in_review`) com um warning em vez de failing a job toda.

## Legacy endpoints (deprecated)

`POST /:id/canonical-core` e `POST /:id/produce` (síncronos) ainda existem pra compat mas a UI usa `/generate`. Serão removidos em versão futura.
