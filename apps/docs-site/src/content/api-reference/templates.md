# Templates API

Templates reutilizáveis com suporte a herança (parent → child).

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/templates` | Listar |
| POST | `/api/templates` | Criar |
| GET | `/api/templates/:id` | Raw (sem herança) |
| GET | `/api/templates/:id/resolved` | Resolvido (com herança mesclada) |
| PUT | `/api/templates/:id` | Atualizar |
| DELETE | `/api/templates/:id` | Deletar |

## Herança

Templates podem ter um `parentTemplateId`. O endpoint `/resolved` mescla os campos do pai com o filho (filho tem prioridade).

## Modelo

```json
{
  "id": "uuid",
  "name": "Blog Health Template",
  "type": "production",
  "configJson": {
    "tone": "conversational",
    "wordCount": 2000,
    "includeAffiliate": true
  },
  "parentTemplateId": "uuid-parent",
  "userId": "uuid"
}
```
