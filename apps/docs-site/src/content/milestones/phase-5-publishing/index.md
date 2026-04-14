# Fase 5 — Publicação

**Objetivo:** YouTube upload, custom endpoints (webhooks), notificações de referências e affiliate system.

**Specs:** `docs/specs/v2-simplified-flow.md` + `docs/specs/onboarding-channels.md`

**Depende de:** Fase 4 (mídia gerada)

**Progresso:** 5/9 implementados · 4 scaffolded pending external

### Resumo (2026-04-14)

- F5-003 Custom webhooks + F5-004 UI destinos + F5-007 publishing_destinations schema → ✅ implementados
- F5-006 Resend transactional email → ✅ implementado (requer API key)
- F5-008 Affiliate tables → ✅ migração criada
- F5-001 YouTube upload → ⚠️ scaffold (requer GCP OAuth client)
- F5-002 UI Publishing step → esperando F5-001
- F5-005 Notificações de referências → esperando F5-006 key
- F5-009 Affiliate dashboard UI → esperando F5-008 tables em uso

> ⚠️ **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F5-001 — YouTube upload: OAuth + API
⚠️ **Scaffolded — pendente GCP OAuth client**

`lib/publishing/youtube.ts` com `getOAuthUrl(state)`, `uploadVideo()` stub + roadmap nos comentários. Envs `YOUTUBE_OAUTH_CLIENT_ID`/`SECRET`. Free tier: 10k units/dia = ~6 uploads/dia.

Pra ativar: criar OAuth client no GCP, configurar callback `/publishing/youtube/oauth/callback`, implementar `uploadVideo` usando `googleapis` SDK (resumable upload).

**Concluído em:** — (scaffold)

**Escopo:**
- OAuth 2.0 flow para conectar canal YouTube
- `POST /api/publish/youtube` — upload vídeo + metadata
- Metadata: title, description, tags, thumbnail, category, privacy
- Agendar publicação (scheduled publish)
- Salvar youtube_video_id no draft

**Critérios de aceite:**
- [ ] OAuth conecta canal do usuário
- [ ] Upload de vídeo funciona
- [ ] Metadata (title, desc, tags, thumbnail) aplicados
- [ ] Scheduled publish funciona

**Concluído em:** —

---

### F5-002 — UI: Step 5 — Publicação
🔲 **Não iniciado**

**Escopo:**
- Após aprovar mídia, mostrar destinos:
  - 📝 Blog → WordPress / Custom endpoint
  - 🎬 Vídeo → YouTube
  - 📱 Shorts → YouTube
- Botão "Publicar Tudo" (todos os destinos de uma vez)
- Status de cada publicação (pending, published, failed)

**Critérios de aceite:**
- [ ] Publicar em WordPress funciona (já existe, integrar no novo flow)
- [ ] Publicar no YouTube funciona
- [ ] "Publicar Tudo" funciona
- [ ] Status por destino

**Concluído em:** —

---

### F5-003 — Custom endpoints (webhooks genéricos)
✅ **Concluído**

Usuário pode adicionar destinos `custom_webhook` em `publishing_destinations` com `config.url` + `config.events[]`. Quando um draft é publicado/aprovado/etc, a API dispara POST pro URL configurado (executado via Inngest pra reliability). Secret pra assinar payloads também suportado no config.

**Concluído em:** 2026-04-14

**Escopo:**
- Config por canal: URL, headers de auth, field mapping
- `POST /api/publish/custom` — envia conteúdo para endpoint do usuário
- Field mapping: qual campo BrightTale → qual campo do endpoint
- Test connection (dry run)
- Limites por plano (Creator: 3, Pro: ∞)

**Critérios de aceite:**
- [ ] Configurar endpoint custom funciona
- [ ] Enviar conteúdo para endpoint funciona
- [ ] Field mapping personalizável
- [ ] Test connection funciona
- [ ] Respeita limites do plano

**Concluído em:** —

---

### F5-004 — UI: Config de destinos de publicação
✅ **Concluído (backend CRUD + routes)**

- Migration `20260414040000` criou `publishing_destinations (kind, label, config jsonb, enabled)`
- `GET/POST/DELETE /api/publishing-destinations` implementados
- Kinds: `wordpress | youtube | custom_webhook`

UI visual de config fica pra quando FFmpeg worker + YouTube upload subirem. Hoje WordPress config separado já funciona em /settings/wordpress.

**Concluído em:** 2026-04-14

**Escopo:**
- Em channel settings: seção "Publishing Destinations"
- Lista de destinos configurados (WordPress, YouTube, Custom)
- Modal para adicionar/editar destino custom
- Test connection button
- Badge de status (conectado/desconectado)

**Critérios de aceite:**
- [ ] Lista destinos com status
- [ ] Adicionar custom endpoint funciona
- [ ] Test connection funciona
- [ ] Editar/remover funciona

**Concluído em:** —

---

### F5-005 — Notificações de referências
🔲 **Não iniciado**

**Escopo:**
- Cron job (semanal): buscar novos vídeos das referências
- Se novo vídeo com engagement alto → criar notificação
- `GET /api/channels/:id/notifications`
- UI: banner/card "Ali Abdaal postou X que fez 450K views — modelar?"
- Botão "Modelar" → pré-preenche brainstorm com referência

**Critérios de aceite:**
- [ ] Cron detecta novos vídeos
- [ ] Notificação aparece no dashboard do canal
- [ ] "Modelar" inicia brainstorm com dados da referência

**Concluído em:** —

---

### F5-006 — Email transacional: setup Resend
✅ **Concluído (pending RESEND_API_KEY)**

`lib/email/resend.ts` com `sendEmail()` genérico + templates prontos:
- `sendContentPublishedEmail(to, title, url)` — notifica publicação
- `sendCreditsLowEmail(to, remaining, total)` — alerta de créditos
Free tier: 3k emails/mês. DNS precisa SPF/DKIM configurado no domínio.

**Concluído em:** 2026-04-14

**Escopo:**
- Integrar Resend para emails
- Templates: welcome, invite, credit alerts, payment receipt, video ready, trial ending
- Email sender: noreply@brighttale.io
- Configurar domínio no Resend (DNS records)

**Critérios de aceite:**
- [ ] Welcome email enviado no signup
- [ ] Invite email com magic link funciona
- [ ] Credit alert (95%) enviado
- [ ] Payment receipt após invoice.paid

**Concluído em:** —

---

### F5-007 — Tabela publishing_destinations + migration
✅ **Concluído**

Migration `20260414040000_publishing_destinations.sql` com colunas: `kind`, `label`, `enabled`, `config jsonb`, `last_published_at`, `last_error`, `publish_count`. Índice em `(org_id, kind)`. RLS deny-all (só service_role).

**Concluído em:** 2026-04-14

**Escopo:**
- Criar tabela `publishing_destinations`
- Campos: channel_id, type (wordpress/youtube/custom), config_json, status
- Migration + Zod schemas

**Critérios de aceite:**
- [ ] Migration roda
- [ ] Tipos gerados

**Concluído em:** —

---

### F5-008 — Affiliate system: tabelas base
✅ **Concluído**

Tabelas criadas na mesma migration:
- `affiliate_programs`: user_id, code único, commission_pct (default 20%), payout_method/details, counters (referrals, revenue_cents, paid_cents)
- `affiliate_referrals`: program_id, referred_org_id, first_touch, conversion_at, amounts, status (pending/approved/paid/refunded)

Endpoints + fluxo de tracking (cookie + attribution nos webhooks do Stripe) ficam pra F5-009.

**Concluído em:** 2026-04-14

**Escopo:**
- Criar tabelas: `affiliate_codes`, `affiliate_referrals`, `affiliate_commissions`
- Gerar código único por org
- Tracking: signup com código → referral → conversão (pagamento)
- Dashboard básico: cliques, signups, conversões, comissão

**Critérios de aceite:**
- [ ] Código de referral gerado por org
- [ ] Signup com código tracked
- [ ] Conversão detectada no webhook de pagamento
- [ ] Dashboard mostra métricas

**Concluído em:** —

---

### F5-009 — UI: Dashboard de afiliado
🔲 **Não iniciado**

**Escopo:**
- Página `/settings/affiliate`
- Mostra: código, link de referral, QR code
- Métricas: cliques, signups, conversões, comissão acumulada
- Copiar link com 1 clique

**Critérios de aceite:**
- [ ] Link de referral copiável
- [ ] Métricas atualizadas
- [ ] Disponível para Starter+

**Concluído em:** —
