# Bulk

Prefixo: `/api/bulk`

Fan-out de operações pesadas de uma chamada só, respeitando o saldo de créditos do org.

## POST `/drafts`

Cria N `content_drafts` da mesma pesquisa e enfileira a pipeline de produção pra cada um via Inngest.

**Request**

```json
{
  "channelId": "uuid",
  "researchSessionId": "uuid",
  "type": "blog" | "video" | "shorts" | "podcast",
  "titles": ["Título 1", "Título 2", "..."],
  "provider": "gemini" | "openai" | "anthropic" | "ollama",
  "model": "string",
  "modelTier": "standard",
  "productionParams": { "target_word_count": 700 }
}
```

Limite: **20 títulos por chamada**.

**Response 202**

```json
{
  "data": {
    "drafts": [ { "id": "uuid", "title": "Título 1" }, ... ],
    "totalCostReserved": 560,
    "message": "N drafts enfileirados"
  },
  "error": null
}
```

**Créditos:**
- Cada draft custa `FORMAT_COSTS[type] + CANONICAL_CORE_COST` (ex. blog = 280, video = 280, shorts = 180, podcast = 230)
- **0 se `provider=ollama`** (local, sem custo)
- Pre-flight `checkCredits` com o total antes de criar qualquer draft — tudo ou nada

**Usage:**
- Tooling ou scripts podem usar diretamente
- UI multi-select na `/create` consumirá o endpoint (follow-up)
