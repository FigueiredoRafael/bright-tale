# Projetos

Container principal de conteúdo. Um projeto percorre o pipeline completo de 5 stages.

## Funcionalidades

- CRUD completo com paginação e filtros
- Criação em massa (bulk create) a partir de discovery
- Operações em massa (delete, archive, activate, pause, complete, export)
- Stage tracker visual com navegação por clique
- Auto-save ao navegar entre stages
- Marcar projeto como "winner" (formato destaque)

## Páginas

| Rota | Descrição |
|---|---|
| `/projects` | Lista/grid com busca, filtros e bulk actions |
| `/projects/[id]` | Detalhe com todas as stages |
| `/projects/[id]/discovery` | Formulário de brainstorm |

## Componentes

| Componente | Descrição |
|---|---|
| `ProjectCard` | Card na grid |
| `ProjectListItem` | Item na lista |
| `ProjectCreationModal` | Modal de criação |
| `SearchBar` | Busca |
| `Filters` | Filtros (status, stage, winner) |
| `BulkActionToolbar` | Ações em massa |
| `StageTracker` | Progresso visual do pipeline |
| `StartWorkflowButton` | Iniciar workflow |

## Status Possíveis

| Status | Descrição |
|---|---|
| `active` | Em andamento |
| `paused` | Pausado pelo usuário |
| `completed` | Todos os stages finalizados |
| `archived` | Arquivado |
