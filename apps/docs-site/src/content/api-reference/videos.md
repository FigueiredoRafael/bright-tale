# Videos API

CRUD de video drafts (scripts, chapters, thumbnails).

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/videos` | Listar video drafts |
| POST | `/api/videos` | Criar video draft |
| GET | `/api/videos/:id` | Detalhe |
| PUT | `/api/videos/:id` | Atualizar |
| PATCH | `/api/videos/:id` | Atualizar parcial |
| DELETE | `/api/videos/:id` | Deletar |
| GET | `/api/videos/:id/export` | Exportar markdown |

## Modelo

```json
{
  "id": "uuid",
  "title": "Why Coffee at 3PM Ruins Your Sleep",
  "titleOptions": [
    "Why Coffee at 3PM Ruins Your Sleep",
    "The Science of Caffeine Half-Life",
    "Stop Drinking Coffee After THIS Hour"
  ],
  "thumbnailJson": {
    "concept": "Split screen: alert person vs tired person",
    "text": "3PM COFFEE = NO SLEEP?"
  },
  "scriptJson": {
    "chapters": [
      {
        "title": "The Hook",
        "timestamp": "0:00",
        "duration": "30s",
        "script": "You had your last coffee at 3PM...",
        "bRoll": "Person drinking coffee, clock showing 3PM",
        "soundDesign": "Upbeat intro music"
      }
    ]
  },
  "totalDurationEstimate": "12:30",
  "status": "draft",
  "projectId": "uuid",
  "ideaId": "uuid",
  "userId": "uuid"
}
```
