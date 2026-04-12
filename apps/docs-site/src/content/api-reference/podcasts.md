# Podcasts API

CRUD de podcast drafts.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/podcasts` | Listar |
| POST | `/api/podcasts` | Criar |
| GET | `/api/podcasts/:id` | Detalhe |
| PUT | `/api/podcasts/:id` | Atualizar |
| PATCH | `/api/podcasts/:id` | Atualizar parcial |
| DELETE | `/api/podcasts/:id` | Deletar |
| GET | `/api/podcasts/:id/export` | Exportar markdown |

## Modelo

```json
{
  "id": "uuid",
  "episodeTitle": "The 3PM Coffee Problem",
  "episodeDescription": "We dive into why...",
  "introHook": "Quick question: when was your last coffee today?",
  "talkingPointsJson": [
    { "point": "Caffeine half-life", "duration": "3min", "notes": "..." }
  ],
  "personalAngle": "I used to drink coffee at 4PM every day...",
  "guestQuestions": ["What time do you stop drinking coffee?"],
  "outro": "If you learned something...",
  "status": "draft",
  "projectId": "uuid",
  "ideaId": "uuid",
  "userId": "uuid"
}
```
