# Pesquisa

Biblioteca de pesquisa reutilizável entre projetos.

## Funcionalidades

- Criar e gerenciar pesquisas com fontes
- Importar de markdown, exportar como markdown
- Vincular pesquisas a projetos
- Configurar foco e profundidade da pesquisa
- Contador de projetos e winners que usam cada pesquisa

## Páginas

| Rota | Descrição |
|---|---|
| `/research` | Lista de pesquisas |
| `/research/new` | Criar nova |
| `/research/[id]` | Detalhe com fontes |
| `/research/[id]/edit` | Editar |

## Componentes

| Componente | Descrição |
|---|---|
| `ResearchForm` | Formulário de criação/edição |
| `ResearchCard` | Card de pesquisa |
| `ResearchContentDisplay` | Visualizador de conteúdo |
| `SourcesTable` | Tabela de fontes |
| `SourceForm` | Adicionar fonte |
| `LinkedProjectsList` | Projetos vinculados |
| `ResearchStats` | Estatísticas |
