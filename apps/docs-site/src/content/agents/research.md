# Agent 2 — Research

**Arquivo:** `agents/agent-2-research.md`
**Papel:** Fact-checker e analista de pesquisa — valida claims e encontra fontes.

## Input

| Campo | Descrição |
|---|---|
| `selected_idea` | Ideia selecionada do Brainstorm (completa) |
| `research_focus` | Perguntas específicas de pesquisa |
| `research_depth` | Profundidade (surface / moderate / deep) |

## Output

| Campo | Descrição |
|---|---|
| `research_summary` | Resumo da pesquisa |
| `idea_validation` | Claim verificado? Força da evidência? |
| `sources[]` | Lista de fontes (title, url, key_insight) |
| `statistics[]` | Estatísticas (claim, figure, context) |
| `expert_quotes[]` | Citações (quote, author, credentials) |
| `counterarguments[]` | Contra-argumentos (point, rebuttal) |
| `refined_angle` | Ângulo refinado (updated_title, updated_hook) |
| `recommendation` | proceed / pivot / abandon |

## Regras do Agente

- Web browsing **obrigatório** para pesquisa real
- Toda estatística precisa de fonte verificável
- Contra-argumentos são obrigatórios (honestidade intelectual)
- Se a ideia não se sustenta, recomendar `abandon`
- O `refined_angle` só é sugerido se houver melhoria clara

## Próximo Passo

Usuário revisa pesquisa → decide prosseguir → passa para o [Agent 3 — Production](/agents/production).
