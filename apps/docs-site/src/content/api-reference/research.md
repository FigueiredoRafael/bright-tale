# Research API

Biblioteca de pesquisa reutilizável entre projetos.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/research` | Listar pesquisas |
| POST | `/api/research` | Criar pesquisa |
| GET | `/api/research/:id` | Detalhe |
| PATCH | `/api/research/:id` | Atualizar |
| DELETE | `/api/research/:id` | Deletar |
| GET | `/api/research/by-idea/:ideaId` | Pesquisa por ideia |
| GET | `/api/research/:id/sources` | Listar fontes |
| POST | `/api/research/:id/sources` | Adicionar fonte |
| DELETE | `/api/research/:id/sources/:sourceId` | Remover fonte |

## Modelo

```json
{
  "id": "uuid",
  "title": "Caffeine Research",
  "theme": "health/productivity",
  "researchContent": { ... },
  "projectsCount": 2,
  "winnersCount": 1,
  "userId": "uuid"
}
```

## Sources

```json
{
  "id": "uuid",
  "researchId": "uuid",
  "url": "https://...",
  "title": "Study Title",
  "author": "Author Name",
  "date": "2025-03-15"
}
```
