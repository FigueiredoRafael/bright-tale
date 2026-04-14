# Uso & custo

Página: `/settings/usage`

Dashboard de tokens gastos e custo estimado por provider/etapa/modelo/dia.

## O que mostra

### 4 stat cards (totais na janela)
- **Chamadas** — total de requisições de IA
- **Tokens entrada** / **saída** — formatados (k/M)
- **Custo estimado** — USD + conversão BRL (6:1 fixo por enquanto)

### 4 breakdowns com barras proporcionais
- Por **provider** (Anthropic, OpenAI, Gemini, Ollama)
- Por **etapa** (brainstorm / research / production / review)
- Por **modelo** (ex. gemini-2.5-flash, claude-sonnet, qwen2.5:7b)
- Por **dia** (últimos 14 dias na janela)

Cada row: nome + contador de calls + tokens (apenas no "por dia") + custo. Barra proporcional ao maior custo do grupo.

### Seletor de janela
Botões 7d / 30d / 90d — recarrega `GET /api/usage/summary?days=N`.

## Fonte de dados

Cada chamada de IA (brainstorm/research/production.{core,produce,review}) registra um row em `usage_events` via `logUsage()`. Providers Ollama logam com `cost_usd=0` (preço local zerado).

Pricing map em [pricing.ts](https://github.com/...) — atualize quando providers mudarem preços.

## Por que existe

Dados reais vão sustentar a **decisão de preço do plano**. Depois de 1-2 semanas de uso: dividir custo USD total por número de conteúdos gerados = custo médio por conteúdo. Margem SaaS típica 3-5x → define tiers com confiança.

## Código

- UI: `apps/app/src/app/(app)/settings/usage/page.tsx`
- API: `apps/api/src/routes/usage.ts`
- Log helper: `apps/api/src/lib/ai/usage-log.ts`
- Pricing: `apps/api/src/lib/ai/pricing.ts`
