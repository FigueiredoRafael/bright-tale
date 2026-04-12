# Pipeline de 4 Agentes

O BrightTale usa um pipeline de 4 agentes que transforma um tema em conteúdo multi-formato pronto para publicação.

## Fluxo

```
Brainstorm → Research → Production → Review → Publish
   Agent 1     Agent 2     Agent 3     Agent 4    (WordPress/YouTube API)
```

## Resumo dos Agentes

| # | Agente | Arquivo | Papel |
|---|---|---|---|
| 1 | **Brainstorm** | `agent-1-brainstorm.md` | Gera 5-10 ideias, mata as fracas |
| 2 | **Research** | `agent-2-research.md` | Valida claims, busca fontes e estatísticas |
| 3 | **Production** | `agent-3-production.md` + sub-agentes | Cria conteúdo multi-formato |
| 4 | **Review** | `agent-4-review.md` | QA final + plano de publicação |

## Contratos YAML (BC_*)

Todos os agentes se comunicam via contratos YAML validados contra schemas Zod:

- `BC_BRAINSTORM_INPUT` → `BC_BRAINSTORM_OUTPUT`
- `BC_RESEARCH_INPUT` → `BC_RESEARCH_OUTPUT`
- `BC_PRODUCTION_INPUT` → `BC_CANONICAL_CORE` → per-format outputs
- `BC_REVIEW_INPUT` → `BC_REVIEW_OUTPUT`

## Fluxo de Dados

### Stage 1 → 2 (Brainstorm → Research)
**Ação do usuário:** Selecionar 1 ideia das 5-10 geradas.

O `selected_idea` inclui: title, core_tension, target_audience, scroll_stopper, curiosity_gap, primary_keyword, monetization.

### Stage 2 → 3 (Research → Production)
**Ação do usuário:** Revisar pesquisa, decidir prosseguir/pivotar/abandonar.

Passa: ideia selecionada + research_summary + sources + statistics + expert_quotes + counterarguments.

### Stage 3 → 4 (Production → Review)
**Ação do usuário:** Nenhuma (handoff automático).

Passa: todos os assets de produção (blog, video, shorts, podcast, engagement).

### Stage 4 → Publish
**Ação do usuário:** Revisar feedback, confirmar publicação.

Vereditos possíveis:
- `approved` → publicar conforme plano
- `revision_required` → voltar ao Production com feedback específico
- `rejected` → voltar ao Brainstorm/Research (raro)

## Fluxo Atual vs Futuro

| | Atual (manual) | Futuro (automático) |
|---|---|---|
| **Input** | Plataforma gera YAML | Plataforma gera input |
| **Processamento** | Copiar/colar no ChatGPT | Chama API da IA direto |
| **Output** | Colar resposta de volta | Parse automático |
| **Avanço** | Manual | Automático |
