# API Reference

Base URL: `http://localhost:3001` (dev) | `https://api.brighttale.io` (prod)

## Autenticação

Todas as rotas requerem header `X-Internal-Key` (injetado pelo middleware do app).

## Response Envelope

```json
// Sucesso
{ "data": { ... }, "error": null }

// Erro
{ "data": null, "error": { "code": "NOT_FOUND", "message": "..." } }
```

## Rotas disponíveis

### Pipeline v2 (ativo)

| Grupo | Prefixo | Descrição |
|---|---|---|
| [Brainstorm](/api-reference/brainstorm) | `/api/brainstorm` | Sessões de brainstorm (async, SSE) + draft mode |
| [Research Sessions](/api-reference/research-sessions) | `/api/research-sessions` | Pesquisa com níveis + `/signals` (Google Trends + YT) |
| [Content Drafts](/api-reference/content-drafts) | `/api/content-drafts` | Blog/vídeo/shorts/podcast drafts + images |
| [Bulk](/api-reference/bulk) | `/api/bulk` | Fan-out: criar N drafts de uma vez |
| [Ideas Library](/api-reference/ideas) | `/api/ideas/library` | Biblioteca de ideias |
| [Channels](/api-reference/channels) | `/api/channels` | Canais do usuário |
| [Canonical Core](/api-reference/canonical-core) | `/api/canonical-core` | Framework de conteúdo (pipeline) |

### Billing & usage

| Grupo | Prefixo | Descrição |
|---|---|---|
| [Billing](/api-reference/billing) | `/api/billing` | Stripe: checkout, webhook, portal, status |
| [Usage](/api-reference/usage) | `/api/usage` | Token usage analytics |
| [Credits](/api-reference/credits) | `/api/credits` | Saldo de créditos |

### Agentes & prompts

| Grupo | Prefixo | Descrição |
|---|---|---|
| [Agents](/api-reference/agents) | `/api/agents` | `agent_prompts` (visualização no app, edição no admin) |
| [AI Config](/api-reference/ai) | `/api/ai` | Chaves por provider |
| [Image Generation](/api-reference/image-generation) | `/api/image-generation` | Gemini Imagen config |

### Integrations

| Grupo | Prefixo | Descrição |
|---|---|---|
| [WordPress](/api-reference/wordpress) | `/api/wordpress` | WP config + publish (legacy) |
| [YouTube](/api-reference/youtube) | `/api/youtube` | YouTube Intelligence |
| [Inngest](/api-reference/inngest) | `/inngest` | Webhook do Inngest (não chamado pelo usuário) |

### Legacy (pipeline v1, em deprecação)

| Grupo | Prefixo | Descrição |
|---|---|---|
| [Projects](/api-reference/projects) | `/api/projects` | ⚠️ Legacy |
| [Research Archives](/api-reference/research) | `/api/research` | ⚠️ Legacy |
| [Stages](/api-reference/stages) | `/api/stages` | ⚠️ Legacy |
| [Blogs / Videos / Podcasts / Shorts](/api-reference/blogs) | `/api/{tipo}` | ⚠️ Legacy drafts (substituídos por content-drafts) |
| [Templates](/api-reference/templates) | `/api/templates` | Templates reutilizáveis |
| [Assets](/api-reference/assets) | `/api/assets` | Imagens e mídia |
| [Users](/api-reference/users) | `/api/users` | Admin: gestão de usuários |

### Async pipeline — padrão SSE

Endpoints de geração (brainstorm/research/production) retornam `202 queued` e disparam um job Inngest. O cliente consome progresso via SSE:

```
GET /api/{brainstorm|research-sessions|content-drafts}/:id/events?since=<iso>
Content-Type: text/event-stream
```

Events carregam `{ id, stage, message, metadata, created_at }`. O filtro `?since=` evita re-stream de eventos de runs anteriores do mesmo session id.

## Paginação

Endpoints de listagem suportam:

```
?page=1&limit=20&sort=created_at&order=desc
```

Resposta:
```json
{
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "error": null
}
```

## Validação

Todas as requests são validadas com Zod schemas de `@brighttale/shared`. Requests inválidos retornam 400 com detalhes do erro.
