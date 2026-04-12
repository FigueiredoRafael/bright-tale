# AI Config API

Configuração de providers de IA (texto e imagem).

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/ai/config` | Listar providers ativos |
| POST | `/api/ai/config` | Criar config |
| GET | `/api/ai/config/:id` | Detalhe |
| PUT | `/api/ai/config/:id` | Atualizar |
| DELETE | `/api/ai/config/:id` | Deletar |
| POST | `/api/ai/discovery` | Rodar agente de brainstorm |

## POST `/api/ai/discovery`

Roda o Agent 1 (Brainstorm) via API.

**Body:**
```json
{
  "theme": "productivity and caffeine",
  "subthemes": ["sleep quality", "afternoon energy"],
  "constraints": {
    "audience": "professionals 25-40",
    "tone": "conversational"
  }
}
```

## Image Generation Config

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/image-generation/config` | Listar configs |
| POST | `/api/image-generation/config` | Criar |
| GET | `/api/image-generation/config/:id` | Detalhe |
| PUT | `/api/image-generation/config/:id` | Atualizar |
| DELETE | `/api/image-generation/config/:id` | Deletar |
