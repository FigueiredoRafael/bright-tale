# Assets API

Gerenciamento de imagens e mídia (geradas por IA ou importadas).

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/assets` | Listar assets |
| POST | `/api/assets` | Criar/upload asset |
| GET | `/api/assets/:id/download` | Download |
| DELETE | `/api/assets/:id` | Deletar |
| GET | `/api/assets/project/:projectId` | Assets do projeto |
| POST | `/api/assets/generate` | Gerar imagem via IA |
| GET | `/api/assets/unsplash/search` | Buscar no Unsplash |

## POST `/api/assets/generate`

Gera imagem usando Gemini Imagen.

**Body:**
```json
{
  "prompt": "A cozy coffee shop at 3PM, warm lighting, person working on laptop",
  "projectId": "uuid",
  "role": "thumbnail",
  "contentType": "video",
  "contentId": "uuid"
}
```

## Modelo

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "assetType": "image",
  "source": "gemini-imagen",
  "sourceUrl": null,
  "localPath": "generated-images/abc123.png",
  "prompt": "A cozy coffee shop...",
  "role": "thumbnail",
  "contentType": "video",
  "contentId": "uuid",
  "wordpressId": null,
  "userId": "uuid"
}
```
