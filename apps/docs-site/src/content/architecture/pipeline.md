# Pipeline assíncrono (v2)

Todo o fluxo de criação de conteúdo (brainstorm, research, production) roda como **jobs Inngest**, com progresso reportado ao frontend via **Server-Sent Events**.

## Diagrama de alto nível

```
┌─────────────┐   POST (202)   ┌────────────────┐   publish event   ┌──────────────┐
│ Next.js app │───────────────>│  Fastify API   │──────────────────>│   Inngest    │
└─────────────┘                │  /brainstorm   │                   │  dev server  │
        ▲                      │  /research-…   │                   └──────┬───────┘
        │                      │  /content-…    │                          │
        │ SSE events            └───────┬────────┘                          │
        │                              │                                   │ webhook
        │                              │ insert job_events                 │
        │                              ▼                                   ▼
┌───────┴──────────┐       ┌────────────────────┐       ┌──────────────────────────┐
│ GenerationProgress│<─────│ Supabase job_events│<──────│ Inngest function         │
│ Modal (polling DB)│       │  (stage, message)  │       │ emitJobEvent() entre     │
└──────────────────┘       └────────────────────┘       │ step.run() calls         │
                                                        └──────────────────────────┘
```

## Request flow (production)

1. Cliente clica "Gerar" → `POST /content-drafts/:id/generate { provider, model, productionParams }`.
2. Route: `checkCredits` (skip se provider=ollama), emite evento `queued` em `job_events`, chama `inngest.send('production/generate', data)`, retorna `202 { draftId, status: 'queued' }`.
3. Modal abre no cliente → subscribe `GET /content-drafts/:id/events?since=<isoNow-30s>`.
4. Inngest pega o evento e executa `productionGenerate`:
   - `emit-loading-core` → evento "Carregando agente core"
   - `load-draft`, `load-research`, `load-core-prompt`, `load-channel` (contexto pro agent)
   - `emit-calling-core` → evento "Estruturando ideia central com gemini…"
   - `generate-core` → chama `generateWithFallback` + `logUsage` (usage_events)
   - `save-core` → atualiza `content_drafts.canonical_core_json` + debita créditos
   - Repete pra **produce** e **review** (cada um com seus eventos)
   - `emit-completed` → cliente recebe, modal fecha, navega pra view.
5. Erro em qualquer ponto → emit `failed` com `[provider/model] <message>` prefix.

## Eventos emitidos por stage

| Stage | Quando | Conteúdo |
|---|---|---|
| `queued` | emitido pela route, antes do Inngest | "Iniciando…" |
| `loading_prompt` | início do step.run que carrega o system prompt | "Carregando agente {slug}…" |
| `calling_provider` | antes do `generateWithFallback` | "Conversando com {provider} ({model})…" (e variantes por sub-stage em production) |
| `parsing_output` | após receber resposta | "Processando resposta…" |
| `saving` | antes do insert/update final | "Salvando N cards/ideias/rascunho…" |
| `completed` | fim do job | "N ideias geradas!" / "Post pronto!" |
| `failed` | catch block | "[provider/model] <raw error>" |

## Motivo do design async

A arquitetura síncrona original travava em 3 casos reais:

1. **Next.js rewrite proxy timeout** — Ollama local ou Anthropic em horário de pico levam 60-180s, o proxy do Next desistia com `ECONNRESET` antes do provider terminar. Job assíncrono resolve 100%.
2. **Feedback de progresso** — spinner mudo não indicava se 2 minutos de espera iam terminar em sucesso ou timeout. Eventos persistidos + SSE dão visibilidade real.
3. **Recuperação de falha parcial** — se review falha, produção já foi salva (soft warning). Sem o job atômico Inngest, isso era state corrompido.

## Filtro `?since=`

O endpoint `/events` aceita `?since=<iso>` e só streama eventos criados após. O modal back-dates em 30s ao abrir (pra pegar o evento `queued` emitido ~50ms antes) e ignora eventos de runs anteriores da mesma sessão — evitando que "Iniciando…" de 2 horas atrás apareça junto com "Iniciando…" da nova tentativa.

## Provider fallback

`generateWithFallback(stage, tier, params, { provider, model, allowFallback })`:

- Se `provider` é setado sem `allowFallback`, a chain é **só esse provider** (não burra a conta do usuário com provider pago que ele não escolheu).
- Se `provider` setado com `allowFallback: true`, a chain é `[provider, ...FALLBACK_ORDER[provider]]` filtrado por keys disponíveis.
- Se `provider` não setado, usa a primeira opção do `ROUTE_TABLE[tier][stage]`.
- Em cada provider: 2 retries in-place pra capacity errors (503, overloaded, network); quota errors não retentam.
- Sobre fallback entre providers: apenas erros categorizados como "provider failure" (429, quota, 5xx, network) disparam fallback. 400/401/403 propagam imediatamente.

## Cost tracking

Cada `generateWithFallback` retorna `{ result, providerName, model, usage }` onde `usage` é `{ inputTokens, outputTokens }` do `lastUsage` do provider vencedor. Jobs chamam `logUsage({...})` após cada call, o que:

1. Calcula `cost_usd` usando `estimateCostUsd(provider, model, in, out)` de `pricing.ts`.
2. Insere em `usage_events` com org_id, user_id, channel_id, stage, sub_stage, session_id, provider, model, tokens, cost.
3. `/api/usage/summary` agrega por provider/stage/model/day pra exibir no dashboard.

Providers Ollama sempre logam `cost_usd=0`.

## Arquivos chave

- `apps/api/src/jobs/{brainstorm-generate,research-generate,production-generate}.ts` — 3 Inngest functions
- `apps/api/src/jobs/emitter.ts` — `emitJobEvent(sessionId, sessionType, stage, message, metadata)`
- `apps/api/src/lib/ai/router.ts` — `generateWithFallback`
- `apps/api/src/lib/ai/usage-log.ts` — `logUsage`
- `apps/api/src/lib/ai/pricing.ts` — preços
- `apps/app/src/hooks/useJobEvents.ts` — SSE client
- `apps/app/src/components/generation/GenerationProgressModal.tsx` — modal de progresso
- `apps/app/src/components/generation/WizardStepper.tsx` — breadcrumb visual das 3 etapas
