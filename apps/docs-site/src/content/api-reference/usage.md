# Usage Analytics

Prefixo: `/api/usage`

Token usage tracking — cada chamada de IA é registrada em `usage_events` com tokens + custo estimado em USD.

## GET `/summary`

Agregados do org atual numa janela de tempo.

```
?days=30  # 7, 30, 90 — default 30
```

Response:

```json
{
  "data": {
    "windowDays": 30,
    "totals": {
      "inputTokens": 125400,
      "outputTokens": 52100,
      "costUsd": 0.4872,
      "calls": 47
    },
    "byProvider": [
      { "name": "gemini",    "inputTokens": 80000, "outputTokens": 30000, "costUsd": 0.0150, "calls": 25 },
      { "name": "anthropic", "inputTokens": 30000, "outputTokens": 18000, "costUsd": 0.3600, "calls": 15 },
      { "name": "ollama",    "inputTokens": 15400, "outputTokens": 4100,  "costUsd": 0,      "calls": 7 }
    ],
    "byStage":    [ { "name": "brainstorm", ... }, { "name": "research", ... }, { "name": "production", ... }, { "name": "review", ... } ],
    "byModel":    [ { "name": "gemini-2.5-flash", ... }, ... ],
    "byDay":      [ { "name": "2026-04-13", ... }, ... ]
  },
  "error": null
}
```

## Pricing map

`apps/api/src/lib/ai/pricing.ts` tem preços USD por 1M tokens (2025):

| Modelo | Input | Output |
|---|---:|---:|
| claude-opus-4-5 | $15 | $75 |
| claude-sonnet-4-5 | $3 | $15 |
| claude-haiku-4-5 | $0.80 | $4 |
| gpt-4o | $2.50 | $10 |
| gpt-4o-mini | $0.15 | $0.60 |
| gemini-2.5-flash | $0.075 | $0.30 |
| gemini-2.5-pro | $1.25 | $5 |
| ollama/* | **$0** | **$0** |

Modelos fora dessa lista retornam $0 (sem erro).

## Dashboard

UI em `/settings/usage` — 4 stat cards (calls/tokens/custo USD/custo BRL 6:1) + 4 breakdowns com barras proporcionais.
