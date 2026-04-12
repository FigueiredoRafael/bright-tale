# WordPress API

Integração para publicar blogs diretamente no WordPress.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/wordpress/config` | Criar config |
| GET | `/api/wordpress/config` | Listar configs |
| GET | `/api/wordpress/config/:id` | Detalhe |
| PUT | `/api/wordpress/config/:id` | Atualizar |
| DELETE | `/api/wordpress/config/:id` | Deletar |
| POST | `/api/wordpress/publish` | Publicar blog |
| GET | `/api/wordpress/tags` | Tags do WordPress |
| GET | `/api/wordpress/categories` | Categorias do WordPress |

## POST `/api/wordpress/publish`

**Body:**
```json
{
  "blogId": "uuid",
  "configId": "uuid",
  "status": "draft",
  "categories": [1, 3],
  "tags": [5, 8]
}
```

**Response:**
```json
{
  "data": {
    "wordpressPostId": 42,
    "url": "https://myblog.com/why-coffee-at-3pm-ruins-sleep/"
  },
  "error": null
}
```

## Config

Credenciais WordPress (encriptadas no banco):

```json
{
  "id": "uuid",
  "siteUrl": "https://myblog.com",
  "username": "admin",
  "password": "***",
  "userId": "uuid"
}
```
