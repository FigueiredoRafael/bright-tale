# Projects API

Container principal de conteúdo. Um projeto contém stages, drafts e assets.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/projects` | Listar projetos |
| POST | `/api/projects` | Criar projeto |
| GET | `/api/projects/:id` | Detalhe do projeto |
| PUT | `/api/projects/:id` | Atualizar projeto |
| DELETE | `/api/projects/:id` | Deletar projeto |
| POST | `/api/projects/bulk-create` | Criar em massa (discovery) |
| POST | `/api/projects/bulk` | Operações em massa |
| POST | `/api/projects/:id/winner` | Marcar como winner |

## GET `/api/projects`

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `page` | number | Página (default: 1) |
| `limit` | number | Items por página (default: 20) |
| `status` | string | Filtro: active, paused, completed, archived |
| `current_stage` | string | Filtro: brainstorm, research, production, review, publish |
| `winner` | string | Filtro por formato winner |
| `research_id` | string | Filtro por pesquisa vinculada |
| `search` | string | Busca por título |

**Response:**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "How Caffeine Actually Works",
        "currentStage": "production",
        "completedStages": ["brainstorm", "research"],
        "status": "active",
        "winner": null,
        "researchId": "uuid",
        "userId": "uuid",
        "createdAt": "2026-04-01T...",
        "updatedAt": "2026-04-10T..."
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  },
  "error": null
}
```

## POST `/api/projects`

Creates a project and one track per medium in a single atomic operation (T2.14). If the track inserts fail, the project is deleted (compensating rollback).

**Body:**
```json
{
  "title": "How Caffeine Actually Works",
  "current_stage": "brainstorm",
  "status": "active",
  "winner": false,
  "researchId": "uuid",
  "media": ["blog", "video", "podcast"],
  "mediaConfig": {
    "blog": { "autopilotConfigJson": { "maxReviewIterations": 3 } },
    "video": { "autopilotConfigJson": {} },
    "podcast": { "autopilotConfigJson": {} }
  }
}
```

- `media` — optional array of `blog | video | shorts | podcast`. Defaults to `["blog"]` when omitted (backward compat).
- `mediaConfig` — optional per-medium config. Keys must be a subset of `media`. Each value is stored as `tracks.autopilot_config_json`.

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "title": "How Caffeine Actually Works",
    "tracks": [
      { "id": "uuid", "medium": "blog", "status": "active" },
      { "id": "uuid", "medium": "video", "status": "active" },
      { "id": "uuid", "medium": "podcast", "status": "active" }
    ]
  },
  "error": null
}
```

## POST `/api/projects/bulk`

**Body:**
```json
{
  "action": "delete",  // delete | archive | activate | pause | complete | export
  "ids": ["uuid1", "uuid2"]
}
```
