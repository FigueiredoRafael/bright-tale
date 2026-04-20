# Spec: Colapsar Etapas Acumuladas na Pipeline

## 1. Objetivo
Reduzir poluição visual do `PipelineOrchestrator` quando múltiplas etapas concluídas empilham acima da engine ativa. Usuário reporta que o histórico "fica acumulando em cima".

## 2. Estado Atual
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx:737-747` renderiza lista de `CompletedStageSummary` acima da engine ativa.
- `apps/app/src/components/pipeline/CompletedStageSummary.tsx:1-101` — cards já têm toggle de chevron (linha 89), mas expandem individualmente; não há controle global.
- Sem "collapse all", sem sticky nav, sem minimap de progresso.

## 3. Requisitos Funcionais
- **Collapse por padrão:** todos os `CompletedStageSummary` iniciam colapsados.
- **Barra de progresso sticky:** topo mostra 5 dots (Brainstorm → Publish) com estado (done / active / pending), clicável para expandir resumo da etapa.
- **Botão "Expandir tudo" / "Recolher tudo":** único toggle no header.
- **Foco automático na engine ativa:** scroll para engine ativa ao avançar de etapa.
- **Persistência local:** estado expandido/colapsado em `localStorage` por projeto.

## 4. Arquitetura
- Novo componente `PipelineProgressBar` — sticky top, renderiza 5 stages com ícones Lucide.
- Refatorar `CompletedStageSummary` para aceitar prop `defaultCollapsed` (default `true`).
- Estado global `expandedStages: Set<StageKey>` no `PipelineOrchestrator`, sincronizado com `localStorage` via hook `usePersistedState`.
- Ao completar stage N, auto-colapsa stages 1..N-1.

## 5. Arquivos Afetados
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` — adicionar progress bar + state manager
- `apps/app/src/components/pipeline/CompletedStageSummary.tsx` — receber `collapsed` como prop controlada
- `apps/app/src/components/pipeline/PipelineProgressBar.tsx` — NOVO
- `apps/app/src/hooks/usePersistedState.ts` — NOVO (se não existir)

## 6. Critérios de Aceite
- [ ] Ao chegar na Publish, apenas ela está expandida; demais colapsadas.
- [ ] Progress bar sticky visível em todos os scrolls.
- [ ] Clique no dot da etapa faz scroll + expande summary.
- [ ] Preferência de colapso persiste entre reloads do projeto.
- [ ] Zero mudança no backend / API.
