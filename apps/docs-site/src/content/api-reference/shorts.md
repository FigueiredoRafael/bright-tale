# Shorts API

CRUD de shorts drafts (YouTube Shorts / Reels).

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/shorts` | Listar |
| POST | `/api/shorts` | Criar |
| GET | `/api/shorts/:id` | Detalhe |
| PUT | `/api/shorts/:id` | Atualizar |
| PATCH | `/api/shorts/:id` | Atualizar parcial |
| DELETE | `/api/shorts/:id` | Deletar |
| GET | `/api/shorts/:id/export` | Exportar markdown |

## Modelo

```json
{
  "id": "uuid",
  "shortsJson": [
    {
      "hook": "Your 3PM coffee is still in your body at midnight",
      "body": "Caffeine has a half-life of 5-6 hours...",
      "cta": "Follow for more science hacks",
      "duration": "45s",
      "captions": true,
      "transition": "quick-cut"
    }
  ],
  "shortCount": 3,
  "totalDuration": "2min 15s",
  "status": "draft",
  "projectId": "uuid",
  "ideaId": "uuid",
  "userId": "uuid"
}
```
