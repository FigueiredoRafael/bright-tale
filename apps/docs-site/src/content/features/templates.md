# Templates

Templates reutilizáveis com suporte a herança.

## Funcionalidades

- Criar templates para cada tipo de configuração
- Herança: child template herda configs do parent
- Endpoint `/resolved` retorna template com herança mesclada
- Child tem prioridade sobre parent em campos conflitantes

## Tipos

| Tipo | Uso |
|---|---|
| `brainstorm` | Config do Agent 1 |
| `research` | Config do Agent 2 |
| `production` | Config do Agent 3 (formatos, tom, etc.) |
| `review` | Config do Agent 4 |
