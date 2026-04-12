# Ideas API

Biblioteca de ideias com detecção de similaridade.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/ideas/library` | Listar ideias |
| POST | `/api/ideas/library` | Criar ideia (com similaridade) |
| GET | `/api/ideas/library/:id` | Detalhe |
| PATCH | `/api/ideas/library/:id` | Atualizar |
| DELETE | `/api/ideas/library/:id` | Deletar |
| POST | `/api/ideas/archive` | Arquivar ideia |

## GET `/api/ideas/library`

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `verdict` | string | viable, weak |
| `source_type` | string | brainstorm, manual, import |
| `tags` | string | Tags separadas por vírgula |
| `search` | string | Busca por título |
| `is_public` | boolean | Ideias públicas |

## Modelo

```json
{
  "id": "uuid",
  "ideaId": "bc-idea-001",
  "title": "Why You Can't Sleep After Coffee at 3PM",
  "coreTension": "People drink coffee late without understanding half-life",
  "targetAudience": "Productivity-focused professionals",
  "verdict": "viable",
  "verdictReason": "Strong curiosity gap, high search volume",
  "discoveryData": { ... },
  "sourceType": "brainstorm",
  "tags": ["health", "productivity", "caffeine"],
  "isPublic": false,
  "usageCount": 3,
  "markdownContent": "...",
  "userId": "uuid"
}
```
