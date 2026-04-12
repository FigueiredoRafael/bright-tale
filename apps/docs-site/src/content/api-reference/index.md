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

## Rotas Disponíveis

| Grupo | Prefixo | Descrição |
|---|---|---|
| [Projects](/api-reference/projects) | `/api/projects` | Gerenciamento de projetos |
| [Research](/api-reference/research) | `/api/research` | Biblioteca de pesquisa |
| [Ideas](/api-reference/ideas) | `/api/ideas` | Biblioteca de ideias |
| [Stages](/api-reference/stages) | `/api/stages` | Stages do pipeline |
| [Blogs](/api-reference/blogs) | `/api/blogs` | Blog drafts |
| [Videos](/api-reference/videos) | `/api/videos` | Video drafts |
| [Podcasts](/api-reference/podcasts) | `/api/podcasts` | Podcast drafts |
| [Shorts](/api-reference/shorts) | `/api/shorts` | Shorts drafts |
| [Canonical Core](/api-reference/canonical-core) | `/api/canonical-core` | Framework de conteúdo |
| [Templates](/api-reference/templates) | `/api/templates` | Templates reutilizáveis |
| [Assets](/api-reference/assets) | `/api/assets` | Imagens e mídia |
| [WordPress](/api-reference/wordpress) | `/api/wordpress` | Integração WordPress |
| [AI Config](/api-reference/ai) | `/api/ai` | Configuração de providers |
| [Users](/api-reference/users) | `/api/users` | Admin: gestão de usuários |

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
