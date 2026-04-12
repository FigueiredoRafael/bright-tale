# Stages API

Artefatos YAML de cada stage do pipeline por projeto.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/stages` | Criar artefato de stage |
| GET | `/api/stages/:projectId` | Listar stages do projeto |
| GET | `/api/stages/:projectId/:stageType` | Stage específico |
| PUT | `/api/stages/:projectId/:stageType` | Atualizar stage |
| PATCH | `/api/stages/:projectId/:stageType` | Atualizar parcial |
| POST | `/api/stages/:projectId/:stageType/revisions` | Criar revisão |
| GET | `/api/stages/:projectId/:stageType/revisions` | Listar revisões |

## Stage Types

| Tipo | Descrição |
|---|---|
| `brainstorm` | Output do Agent 1 |
| `research` | Output do Agent 2 |
| `production` | Output do Agent 3 |
| `review` | Output do Agent 4 |
| `publish` | Dados de publicação |

## Modelo

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "stageType": "brainstorm",
  "yamlArtifact": "BC_BRAINSTORM_OUTPUT:\n  ideas:\n    ...",
  "version": 1
}
```

## Revisões

Cada update cria uma revisão automática. Revisões permitem comparar versões anteriores.

```json
{
  "id": "uuid",
  "stageId": "uuid",
  "yamlArtifact": "...",
  "version": 2
}
```
