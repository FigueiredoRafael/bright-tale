# Canonical Core API

Framework central de conteúdo que alimenta todos os formatos.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/canonical-core` | Listar (filtros: idea_id, project_id) |
| POST | `/api/canonical-core` | Criar |
| GET | `/api/canonical-core/:id` | Detalhe |
| PUT | `/api/canonical-core/:id` | Atualizar |
| DELETE | `/api/canonical-core/:id` | Deletar |

## Modelo

```json
{
  "id": "uuid",
  "ideaId": "uuid",
  "projectId": "uuid",
  "thesis": "Late afternoon caffeine disrupts sleep more than people realize",
  "argumentChainJson": [
    { "premise": "Caffeine half-life is 5-6 hours", "evidence": "FDA data", "conclusion": "3PM coffee = caffeine at 9PM" }
  ],
  "emotionalArcJson": {
    "setup": "Relatable coffee habit",
    "conflict": "Shocking half-life data",
    "resolution": "Simple timing rule"
  },
  "keyStatsJson": [
    { "claim": "Caffeine half-life", "figure": "5-6 hours", "source": "FDA" }
  ],
  "keyQuotesJson": [
    { "quote": "...", "author": "Dr. Matthew Walker", "credentials": "Sleep researcher, UC Berkeley" }
  ],
  "affiliateMomentJson": {
    "product": "Sleep tracking app",
    "link": "https://...",
    "copy": "I've been tracking my sleep with...",
    "rationale": "Natural fit after discussing sleep disruption"
  },
  "ctaSubscribe": "Subscribe for weekly science-backed productivity tips",
  "ctaCommentPrompt": "What time is YOUR coffee cutoff? Drop it below",
  "userId": "uuid"
}
```
