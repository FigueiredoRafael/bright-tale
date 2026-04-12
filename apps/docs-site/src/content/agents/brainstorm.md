# Agent 1 — Brainstorm

**Arquivo:** `agents/agent-1-brainstorm.md`
**Papel:** Estrategista de conteúdo cético — gera ideias e mata as fracas cedo.

## Input

| Campo | Descrição |
|---|---|
| `theme` | Tema principal + subtemas |
| `performance_context` | Winners/losers anteriores (opcional) |
| `constraints` | Restrições (público, tom, formato) |

## Output

5-10 ideias, cada uma com:

| Campo | Descrição |
|---|---|
| `idea_id` | Identificador único |
| `title` | Título da ideia |
| `core_tension` | Tensão central que gera interesse |
| `target_audience` | Público-alvo específico |
| `scroll_stopper` | Hook que para o scroll |
| `curiosity_gap` | Gap de curiosidade |
| `primary_keyword` | Keyword + dificuldade |
| `search_intent` | Intenção de busca |
| `monetization` | Ângulo de afiliado |
| `verdict` | `viable` ou `weak` |
| `verdict_reason` | Justificativa |

## Regras do Agente

- Gerar no mínimo 5 ideias
- Cada ideia DEVE ter um veredito honesto
- Ideias fracas são marcadas como `weak` com explicação
- A recomendação final indica a melhor ideia e porquê
- Web browsing habilitado para pesquisa de tendências

## Próximo Passo

Usuário seleciona **1 ideia** → passa para o [Agent 2 — Research](/agents/research).
