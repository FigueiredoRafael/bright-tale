# Research Sessions

Prefixo: `/api/research-sessions`

Pesquisa async com 3 níveis (`surface`/`medium`/`deep`) e tags de foco configuráveis. Mesma arquitetura async+SSE do brainstorm.

## GET `/`

Lista sessões filtradas por canal/status.

```
?channel_id=<uuid>&status=completed&limit=100
```

## POST `/`

Cria e enfileira sessão.

```json
{
  "channelId": "uuid",
  "ideaId": "uuid",
  "topic": "...",
  "level": "surface" | "medium" | "deep",
  "focusTags": ["stats", "expert_advice", "pro_tips", "validated_processes"],
  "modelTier": "standard",
  "provider": "gemini",
  "model": "gemini-2.5-flash"
}
```

**Custo de créditos** (exceto Ollama=0): surface 60, medium 100, deep 180.

Response `202 { sessionId, level, status: "queued" }`.

## GET `/:id/events`

SSE como brainstorm — suporta `?since=<iso>`.

Mensagens do stage `calling_provider` incluem o nível (`Pesquisando com gemini… (level=medium)`).

## GET `/:id`

Sessão + `cards_json` atual.

## PATCH `/:id/review`

Salva cards aprovados depois da revisão humana:

```json
{ "approvedCardsJson": [ { "type": "source", "title": "...", "url": "..." }, ... ] }
```

Marca status `reviewed` e guarda `approved_cards_json`.
