# Spec: Autopilot Evoluído

## 1. Objetivo
Evoluir o autopilot atual (state machine rígido com retry fixo) para modo "set & forget" confiável: usuário seleciona ideia, sai, volta com draft publicado ou pausado com motivo claro.

## 2. Estado Atual
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx:212-286` — `handleStageComplete` com auto-mode.
- Review loop retry até `maxReviewIterations` fixo.
- Pausa em score <40 ou max iterações (linhas 220-243).
- `AutoModeControls` componente existe (linha 708).
- **Lacunas:** sem backoff adaptativo; sem telemetria de pausa além de toasts; sem resumo pós-execução; sem notificação externa quando conclui.

## 3. Requisitos Funcionais

### 3.1 Política de Retry Adaptativa
- Review loop atual: N iterações fixas.
- Nova política: se score subiu <5 pontos entre iterações, pausa (retorno decrescente).
- Se issues repetidos entre iterações, pausa com motivo "loop detectado".

### 3.2 Gatilhos de Pausa (expandidos)
- Score baixo (mantém).
- Retorno decrescente de score.
- Loop de issues repetidos.
- Erro de provider (rate limit, 5xx) após 3 retries com exponential backoff.
- Custo acumulado > limite configurável por projeto.

### 3.3 Telemetria
- Tabela nova: `autopilot_runs` (id, project_id, started_at, ended_at, status, pause_reason, stages_completed_json, cost_usd, tokens_used).
- Log cada transição de etapa em `autopilot_events` (run_id, stage, event_type, payload_json, timestamp).
- Integração com Axiom (já existe em `apps/api/src/lib/axiom.ts`).

### 3.4 Notificações
- Ao concluir ou pausar: email (Resend) + toast se tab ativa.
- Configurável por projeto.

### 3.5 UI de Progresso
- Drawer persistente mostrando: etapa atual, ETA, custo acumulado, última ação.
- Botão "Pausar agora" e "Ajustar orçamento".

## 4. Arquitetura
- Migrations: `autopilot_runs`, `autopilot_events` + `projects.autopilot_config_json` (maxCost, maxIterations, emailOnComplete).
- Routes: `POST /api/projects/:id/autopilot/start`, `POST /api/projects/:id/autopilot/pause`, `GET /api/projects/:id/autopilot/status`.
- Shared schemas em `packages/shared/src/schemas/autopilot.ts`.
- Mappers em `packages/shared/src/mappers/db.ts`.
- UI: `AutopilotDrawer` novo componente.

## 5. Arquivos Afetados
- `supabase/migrations/<ts>_autopilot_telemetry.sql` — NOVO
- `apps/api/src/routes/autopilot/*` — NOVO
- `packages/shared/src/schemas/autopilot.ts` — NOVO
- `packages/shared/src/mappers/db.ts` — adicionar autopilot mappers
- `apps/app/src/components/pipeline/PipelineOrchestrator.tsx` — consumir novo endpoint
- `apps/app/src/components/pipeline/AutopilotDrawer.tsx` — NOVO
- `apps/api/src/lib/notifications/email.ts` — NOVO (Resend)

## 6. Critérios de Aceite
- [ ] Autopilot pausa em retorno decrescente de score.
- [ ] Run aparece em `autopilot_runs` com status final.
- [ ] Email enviado ao concluir ou pausar.
- [ ] Custo acumulado visível no drawer em tempo real.
- [ ] Rate limit de provider triggeia backoff exponencial.
