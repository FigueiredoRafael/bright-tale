# Blogs API

CRUD de blog drafts com export markdown e publicação WordPress.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/blogs` | Listar blog drafts |
| POST | `/api/blogs` | Criar blog draft |
| GET | `/api/blogs/:id` | Detalhe |
| PUT | `/api/blogs/:id` | Atualizar |
| PATCH | `/api/blogs/:id` | Atualizar parcial |
| DELETE | `/api/blogs/:id` | Deletar |
| GET | `/api/blogs/:id/export` | Exportar markdown |

## Modelo

```json
{
  "id": "uuid",
  "title": "Why You Can't Sleep After Coffee at 3PM",
  "slug": "why-you-cant-sleep-after-coffee-3pm",
  "metaDescription": "Discover the science behind...",
  "fullDraft": "<h2>Introduction</h2><p>...</p>",
  "outlineJson": { "sections": [...] },
  "primaryKeyword": "caffeine half-life",
  "secondaryKeywords": ["sleep quality", "coffee timing"],
  "affiliatePlacement": "section-3",
  "affiliateCopy": "I've been using...",
  "affiliateLink": "https://...",
  "internalLinksJson": [...],
  "status": "draft",
  "projectId": "uuid",
  "ideaId": "uuid",
  "wordpressPostId": null,
  "userId": "uuid"
}
```
