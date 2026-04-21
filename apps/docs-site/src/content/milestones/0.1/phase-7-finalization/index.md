# Fase 7 — Finalização

**Objetivo:** Fechar todas as pontas soltas antes do lançamento público. Observabilidade, pricing final, integrações pendentes, e features de produto (séries, produtos, shorts).

**Depende de:** Fases 1-6 (V2 core completo)

**Progresso:** 0/10 concluídos

> **Regra obrigatória:** Todo card DEVE incluir testes automatizados antes de ser marcado ✅ concluído.
> Ver [`docs/specs/testing-requirements.md`](/spec/testing-requirements) para cobertura mínima por tipo de card.

---

## Cards

### F7-001 — Observabilidade: error logging com Sentry
🔲 **Não iniciado**

**Prioridade:** FATAL

**Escopo:**
- Integrar Sentry (free tier: 5K errors/mês, mais barato que Datadog)
- Setup em `apps/app` e `apps/api` (Next.js SDK)
- Source maps upload no build
- Capturar erros não tratados + erros de API (4xx/5xx)
- Breadcrumbs para tracing de requisições
- Alertas por email para erros críticos
- Dashboard de erros acessível pelo admin

**Critérios de aceite:**
- [ ] Sentry SDK integrado em app + api
- [ ] Erros não tratados capturados automaticamente
- [ ] Source maps funcionando (stack traces legíveis)
- [ ] Alertas configurados para erros críticos
- [ ] `npm run build` faz upload dos source maps

**Concluído em:** —

---

### F7-002 — Finalizar pricing e ativar planos
🔲 **Não iniciado**

**Prioridade:** FATAL

**Contexto:** Tabela de pricing já foi modelada (F3-*), backend Stripe pronto, UI de billing existe. Falta decidir valores finais e ativar no Stripe Dashboard.

**Escopo:**
- Decidir valores finais dos planos (Free, Starter, Creator, Pro)
- Criar Products + Prices no Stripe Dashboard (ou via API)
- Configurar cupons de desconto no Stripe
- Testar upgrade/downgrade flow end-to-end
- Testar checkout em sandbox com cartão de teste
- Validar credit allocation por plano

**Critérios de aceite:**
- [ ] Products + Prices criados no Stripe
- [ ] Checkout funciona com cartão de teste
- [ ] Upgrade/downgrade aplica créditos corretos
- [ ] Cupons de desconto funcionam
- [ ] Webhook de pagamento confirma assinatura

**Concluído em:** —

---

### F7-003 — Testar integração Blog/WordPress end-to-end
🔲 **Não iniciado**

**Prioridade:** FATAL

**Contexto:** Integração WordPress já implementada. Falta teste end-to-end real (não mock).

**Escopo:**
- Configurar WordPress de teste (local ou WP.com sandbox)
- Testar: conectar site → publicar blog draft → verificar post no WP
- Testar custom webhooks com endpoint de teste (ex. webhook.site)
- Testar fluxo completo: gerar conteúdo → aprovar → publicar → confirmar
- Documentar troubleshooting de erros comuns (auth, permissões, CORS)

**Critérios de aceite:**
- [ ] Blog publicado com sucesso via WordPress REST API
- [ ] Imagens incluídas no post (se geradas)
- [ ] Custom webhook dispara com payload correto
- [ ] Erros de publicação mostram mensagem clara pro usuário
- [ ] Retry funciona para falhas temporárias

**Concluído em:** —

---

### F7-004 — Finalizar geração de imagens
🔲 **Não iniciado** (em progresso)

**Prioridade:** FATAL

**Contexto:** Geração de imagens já está em execução. Card para tracking da finalização.

**Escopo:**
- Completar integração com provider de imagens (DALL-E / Stability / Flux)
- Gerar thumbnail para YouTube (composição com texto + emoção do F2-046)
- Gerar imagens de capa para blog posts
- UI: preview + editar prompt + regenerar
- Salvar imagens no storage (Supabase Storage ou S3)
- Vincular imagens aos drafts (blog_drafts.cover_image_url, video_drafts.thumbnail_url)

**Critérios de aceite:**
- [ ] Imagem gerada a partir do conteúdo do draft
- [ ] Preview na UI com opção de regenerar
- [ ] Imagem salva no storage e vinculada ao draft
- [ ] Thumbnail YouTube segue spec do F2-046
- [ ] Custo de geração debitado dos créditos

**Concluído em:** —

---

### F7-005 — Séries: múltiplos conteúdos sobre o mesmo tema
🔲 **Não iniciado**

**Prioridade:** FATAL

**Escopo:**
- Modelo de dados: tabela `series` (name, description, channel_id, theme, planned_count)
- Vincular ideas/drafts a uma série (`series_id` em `idea_archives`)
- UI: criar série com tema + número de episódios/posts
- Ao gerar conteúdo dentro de uma série, o agente recebe contexto dos conteúdos anteriores (evitar repetição, manter progressão)
- Dashboard de série: progresso (3/10 posts criados), lista de conteúdos
- Brainstorm em lote: gerar N ideias para a série de uma vez

**Critérios de aceite:**
- [ ] CRUD de séries funciona
- [ ] Ideas vinculadas a séries
- [ ] Geração de conteúdo recebe contexto da série
- [ ] Dashboard mostra progresso da série
- [ ] Brainstorm em lote gera ideias coerentes com o tema

**Concluído em:** —

---

### F7-006 — Produtos: adicionar produtos na criação de conteúdo
🔲 **Não iniciado**

**Prioridade:** FATAL

**Escopo:**
- Modelo de dados: tabela `products` (name, url, description, image_url, price, channel_id)
- CRUD de produtos por canal
- No fluxo de criação: "Tem produto para esse conteúdo?" → selecionar 1+ produtos
- Agente de produção recebe produtos selecionados → gera CTA natural no corpo do blog
- CTA na descrição do YouTube + pinned comment
- Shorts: menção do produto no roteiro

**Critérios de aceite:**
- [ ] CRUD de produtos funciona
- [ ] Seleção de produtos no fluxo de criação
- [ ] Blog gerado inclui CTA do produto de forma natural
- [ ] Descrição YouTube inclui link do produto
- [ ] Pinned comment inclui CTA

**Concluído em:** —

---

### F7-007 — Highlight de conteúdo-produto referenciado
🔲 **Não iniciado**

**Prioridade:** FATAL

**Contexto:** Quando um post ou roteiro referencia um produto nosso (criado no BrightTale), precisa ficar visualmente marcado para que o admin possa conferir se a copy está natural e se a referência ao conteúdo prévio está bem conectada na esteira.

**Escopo:**
- No preview do draft, destacar trechos que referenciam produtos (cor vivida / highlight)
- Mostrar badge "Produto Referenciado" nos trechos com CTA
- Painel lateral: lista de produtos mencionados no draft + link para o produto
- Score de naturalidade: flag se o CTA parecer forçado (heurística ou LLM check)
- Permitir editar o trecho de CTA diretamente no preview

**Critérios de aceite:**
- [ ] Trechos com produto highlighted no preview
- [ ] Badge visual identifica CTAs
- [ ] Painel lateral lista produtos referenciados
- [ ] Admin pode editar CTA inline
- [ ] Highlight funciona em blog + roteiro de vídeo

**Concluído em:** —

---

### F7-008 — Recomendação de shorts a partir de roteiro
🔲 **Não iniciado**

**Prioridade:** FATAL

**Escopo:**
- Após gerar roteiro de vídeo ou podcast, agente analisa e sugere 3-5 trechos para shorts
- Cada sugestão inclui: trecho do roteiro, hook sugerido, duração estimada (30-60s)
- UI: lista de sugestões com "Criar Short" → abre brainstorm pré-preenchido
- Vincular shorts gerados ao vídeo/podcast de origem (parent_draft_id)
- Considerar viralidade: priorizar trechos com gancho emocional / polêmica / dica prática

**Critérios de aceite:**
- [ ] Agente sugere 3-5 shorts por roteiro
- [ ] Sugestões incluem hook + duração
- [ ] "Criar Short" abre brainstorm pré-preenchido
- [ ] Short vinculado ao conteúdo de origem
- [ ] Sugestões são relevantes e variadas

**Concluído em:** —

---

### F7-009 — Suporte: chatbot básico + fallback para admin
🔲 **Não iniciado**

**Prioridade:** Importante

**Escopo:**
- Widget de chat in-app (canto inferior direito)
- Chatbot com FAQ automático (respostas baseadas em docs/help articles)
- Se chatbot não resolver → formulário de contato que notifica admin
- Tickets salvos no banco: `support_tickets` (user_id, subject, messages jsonb, status)
- Admin: página `/admin/support` com lista de tickets + responder
- Notificação para o usuário quando admin responde (in-app + email via Resend)

**Critérios de aceite:**
- [ ] Widget de chat aparece no app
- [ ] Chatbot responde perguntas comuns
- [ ] Escalation para admin funciona
- [ ] Admin vê e responde tickets
- [ ] Usuário recebe notificação de resposta

**Concluído em:** —

---

### F7-010 — Notificações push e eventos (Thiago)
🔲 **Não iniciado** — **Responsável: Thiago**

**Prioridade:** Importante

**Escopo:**
- Tabela `notifications` (user_id, type, title, body, data jsonb, read_at, created_at)
- API: `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`
- Tipos de evento: content_ready, credit_low, payment_confirmed, team_invite, reference_trending, support_reply
- UI: ícone de sino no header com badge de contagem
- Dropdown com lista de notificações recentes
- Push notifications (Web Push API) — opt-in
- Admin: enviar notificação para todos os usuários ou segmento específico (broadcast)

**Critérios de aceite:**
- [ ] Notificações criadas automaticamente por eventos do sistema
- [ ] UI mostra badge + dropdown
- [ ] Marcar como lida funciona
- [ ] Push notification funciona (Web Push)
- [ ] Admin pode enviar broadcast

**Concluído em:** —

---

## Itens movidos para V3

| # | Item | Razão |
|---|---|---|
| 6 | ElevenLabs (finalizar integração) | Decisão pendente, pode ir pro V3 |
| 9 | Bug report via GitHub Issues | Redundante com Sentry — reavaliar |
| 10 | Roteiro de podcast | Pode ser V3, não bloqueia lançamento |
| 12 | Controle de features no admin | Nice to have |
| 16 | Conteúdo agendado (schedule) | Nice to have, não bloqueia lançamento |
