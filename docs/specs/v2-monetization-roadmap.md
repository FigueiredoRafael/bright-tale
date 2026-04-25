---
title: V0.2 Monetization & Polish — Roadmap & Open Decisions
status: draft
milestone: v0.2
author: Rafael
date: 2026-04-25
points: TBD
---

# V0.2 Monetization & Polish — Roadmap & Open Decisions

Mapa do que falta pra fechar o ciclo de monetização do BrightTale. Aponta
pros specs já existentes onde aplicável e centraliza as decisões pendentes.

**Como usar este doc:** preencha as caixas `[ ]` com sua resposta. Quando
terminar, eu transformo em specs + cards.

## Specs já existentes

| Tema | Doc |
|---|---|
| Stripe + Mercado Pago | [`payments-stripe.md`](./payments-stripe.md) |
| Modelo de créditos + tabela de preços | [`pricing-plans.md`](./pricing-plans.md) |
| Projeções financeiras | [`pricing-projections.md`](./pricing-projections.md) |
| Auth + teams | [`auth-teams.md`](./auth-teams.md) |
| Infra | [`infrastructure.md`](./infrastructure.md) |

---

## Sprint 1 — Revenue Path

### S1.1 — Stripe wiring (endpoints, webhooks, planos no dashboard)

`payments-stripe.md` já cobre o desenho. Decisões pendentes:

- **Métodos de pagamento ao lançar:**
  - [ ] Só cartão (Stripe global)
  - [ ] Cartão + Pix (via Stripe BR)
  - [ ] Cartão (Stripe) + Pix/Boleto (Mercado Pago) — fallback
  - **Sua resposta:** esse app vai ser pra vender na gringa e no brasil quero começar no brasil e depois pra gringa, então tem que ter um jeito de notar isso, mas queria ter apple pay etc tbm o stripe deve ter isso já

- **Subscriptions vs one-time vs créditos avulsos:**
  - [ ] Só subscription mensal
  - [ ] Subscription + créditos avulsos (top-up)
  - [x] Subscription + créditos avulsos + opção anual com desconto
  - **Sua resposta:**

- **Trial:**
  - [x] Sem trial — paga de cara -> vamos usar o free tier
  - [ ] N dias grátis sem cartão (qual N?)
  - [ ] N dias grátis com cartão
  - **Sua resposta:**

- **Free tier:**
  - [ ] Não tem
  - [X] Tem, com X créditos/mês — quanto? eu pensei o seguinte ser tipo elven labs ainda n sei exatamente mas pensei algo tipo 10 mil creditos por exemplo -> http://localhost:3003/roadmap/pricing-projections pode dar sugestões nesse caso por favor?
  - **Sugestão Claude:** 10k é alto demais — canibaliza o Starter (5k) inteiro. Olhando `pricing-projections.md`: Starter = 5k = ~9 posts std. Pra free tier funcionar como "isca", proponho:
    - **Opção A (recorrente / freemium clássico):** 500 créditos/mês = ~1 blog post Standard. User percebe o valor sem comer paid plans.
    - **Opção B (one-shot / trial):** 2.000 créditos lifetime (sem reset mensal) — força upgrade depois de validar.
    - **Opção C (híbrida):** 500/mês recorrente + 2.000 bônus na primeira semana (gancho de ativação).
    - Eu recomendaria **C** — recorrência cria hábito, bônus de ativação dá margem pro primeiro "wow".
  - **Sua escolha:**

### S1.2 — Modelo de créditos no DB

`pricing-plans.md` define as ações e custos. Decisões pendentes:

- **Refresh dos créditos:**
  - [x] Reset mensal (perde sobra)
  - [ ] Acumula até teto (qual teto?)
  - [ ] Acumula sem teto
  - **Sua resposta:**

- **Pay-as-you-go quando estourar o limite:**
  - [ ] Bloqueia (precisa upgrade)
  - [x] "Uso extra" opt-in (toggle igual Claude — cobra cartão depois), mas bota um limite, queria ter uma maneira de deixar a pessoa tipo passou e meio que ela n usar tudo e depois sair e ficar me devendo
  - [ ] "Uso extra" sempre on (cobra automaticamente)
  - **Sua resposta:**
  - **Preço do crédito extra:** R$ ___ por crédito (ou múltiplo do plano?)

- **Granularidade de cobrança no extra:**
  - [ ] Por bloco de N créditos (ex.: 1.000 a R$10)
  - [ ] Por crédito unitário
  - **Sua resposta:** nào sei acho que por bloco, como é no elevenlabs ou claude

### S1.3 — Página `/usage` no app (Claude-style)

Nova feature, sem spec ainda. Referência: screenshot da Claude que você mandou.

**Componentes desejados:**
- [x] Barra de progresso da sessão atual (se tiver janela de sessão)
- [x] Barras de progresso por categoria (texto / imagem / áudio / vídeo)
- [x] Barra mensal total
- [x] "Última atualização" + botão refresh
- [x] Toggle "uso extra"
- [x] Histórico de transações (créditos comprados + consumidos)
- [ ] Outros: __________

**Quem vê:**
- [ ] Só o próprio user
- [x] User + admins do org (se for B2B/team)
- **Sua resposta:**

**Reset visível pro user:**
- [ ] "Reinicia em X dias" (calendário do plano)
- [ ] "Reinicia em X horas" (sessão tipo Claude)
- [x] Os dois (sessão + mensal)
- **Sua resposta:**

### S1.4 — Sistema de notificações

Sino no header do app. Notificações chegam por **email** + **push em tempo
real** (WebSocket / Supabase Realtime). Globais (broadcast pra todos) ou
individuais.

**Casos de uso:**
- [x] Avisos de plano (créditos baixos, plano expira, pagamento falhou)
- [x] Doações de crédito recebidas (S2.2)
- [x] Convites de team
- [x] Anúncios da plataforma (manutenção, novas features)
- [x] Job assíncrono pronto (vídeo, áudio longo)
- [ ] Outros: _____________________________

**Backend — qual stack:**
- [x] Supabase Realtime (WebSocket nativo, integra com auth/cookies — recomendado)
- [ ] Pusher / Ably (terceiros, mais features)
- [ ] SSE custom (mais simples, só server→client)
- **Sua resposta:**

**Email — provider:**
- [x] Resend (já usado pelo affiliate-email-service)
- [ ] Outro: _________
- **Sua resposta:**

**Persistência:**
- [x] Tabela `notifications` (user_id, type, title, body, read_at, sent_via)
- [ ] TTL? (ex.: limpa após 30d) qual prazo? n sei examente 
- **Sua resposta:**

**Preferências por user:**
- [ ] Settings → Notifications: liga/desliga por categoria + canal
- [x] Mandatórias (não dá pra desligar): pagamento falhou, segurança,
- **Sua resposta:**

**UI — sino:**
- [ ] Badge contador (não-lidas)
- [ ] Painel dropdown com lista
- [ ] Marcar como lida individual + "marcar todas"
- [ ] Página dedicada `/notifications` com paginação
- [x] Tudo acima
- **Sua resposta:**

**Quem dispara notificações globais:**
- [x] `owner` + `admin`
- [ ] Só `owner`
- [ ] Rate-limit (ex.: 1 broadcast/hora)? n sei
- **Sua resposta:**

### S1.5 — Suporte, refunds e pós-venda

Chatbot AI no app pra resolver dúvidas comuns + processar refunds.
Escalação pra humano cria alerta no painel admin. Pós-venda (onboarding,
check-ins, health score). Integração com afiliado que vendeu.

#### Chatbot — escopo

**O que o bot resolve sozinho:**
- [x] Dúvidas FAQ (como funciona, planos, créditos)
- [x] Refunds dentro da política (7d sem uso, 24h pouco uso — ver "Refunds" acima)
- [x] Trocas de plano (upgrade/downgrade)
- [x] Reset de senha / 2FA
- [x] Cancelamento de assinatura -> encamoja um ticket high pro admin e pro vedndedor pra tentar recuperar o load
- [ ] Outros: _____________________________

**Auto-refund — política exata** (bot decide sem humano se tudo abaixo for verdade):
- [x] Dentro da janela: ≤ 7 dias sem uso, OU ≤ 24h com uso ≤ X% (qual %?) um razoavel n decidi ainda mas da pra configurar que tal?
- [ ] Valor ≤ R$ ___ (cap pra liberar auto-aprovação; acima disso, escala)
- [x] User confirmou explicitamente "sim, quero refund" no chat
- [ ] **Sua resposta:**

**Safeguards anti-abuso** (qualquer um trigger → bloqueia auto + escala P1):
- [x] **Mesmo email** já solicitou refund antes (qualquer status). Limite: ____ refunds vitalícios por email.
- [x] **Mesmo IP** abriu N+ tickets de refund nos últimos N dias. Limite: ____
- [x] **Mesmo cartão / payment method** já teve refund antes (Stripe `payment_method.fingerprint`)
- [x] **Mesmo device fingerprint** (navegador) — opcional, requer libs anti-fraude
- [x] **Conta criada há < N horas** (ex.: 24h) e já pediu refund
- [x] **Velocity:** > N refunds da plataforma inteira na última hora (suspeita de coordenação)
- [ ] **Sua resposta (qual usar e com que limite):**

**Quando trap dispara:**
- [x] Bot responde "vamos passar pra um humano" sem revelar regra (não dá hint pro fraudster)
- [x] Cria ticket P1 com tag `fraud_risk` + score
- [x] Bundle de contexto inclui histórico do email/IP/cartão pra admin julgar
- **Sua resposta:**

**Audit do auto-refund:**
- [x] Log obrigatório (user, valor, regra que aprovou, % gasto, IP, payment_method) na tabela `refund_audit`
- [x] Admin pode ver lista filtrável `/admin/refunds`
- [ ] Reverter auto-refund? (se descobrir fraude depois) -> aqui acho que temos que penar se isso é legal
- **Sua resposta:**

**O que sempre escala pra humano:**
- [x] Refunds fora da política
- [x] Disputas de cobrança
- [ ] Bug reports técnicos
- [x] User pede explicitamente "falar com humano"
- [x] Bot não conseguiu resolver após N tentativas (qual N?) um numero razoavel talvez 5 a 10 vc que deicide (configuravel)
- **Sua resposta:**

**Backend — qual stack:**
- [ ] OpenAI Assistants API (mais simples, custo por mensagem)
- [ ] Anthropic Claude com tools (mais controle, mesma família dos agents BC_*)
- [ ] Crisp/Intercom (chat + bot tudo-em-um, custo mensal)
- [ ] Próprio (rota `/api/support/chat` com Claude/GPT + tools customizadas)
- **Sua resposta:** não sei examtente quero o menor custo possivel mas consitencia então n sei dizer

**Histórico de conversas:**
- [x] Persistir tudo (tabela `support_threads` + `support_messages`)
- [x] User pode ver/retomar conversas anteriores
- [x] Admin vê tudo no painel quando escalar
- **Sua resposta:**

#### Escalação — alerta no admin

**Formato do alerta:**
- [ ] Notificação no sino (S1.4) pra todos os admins ativos e suport se pah
- [ ] Fila dedicada `/admin/support` com tickets ordenados por SLA
- [ ] Email pra `support@brighttale.com.br`
- [x] Tudo acima
- **Sua resposta:**

**Prioridade do ticket** (atribuída pelo bot na escalação, ajustável manualmente):
- [ ] **P0 — Urgente** (refund disputa, pagamento falhando, account locked)
- [ ] **P1 — Alta** (bug bloqueador, feature crítica não funciona)
- [ ] **P2 — Média** (dúvida que escapou do bot, refund dentro da política mas o user pede review)
- [ ] **P3 — Baixa** (FAQ, sugestão, dúvida geral)
- **Sua resposta:** ta bom assim (configurael)

**SLA por prioridade** (time-to-first-response):
- [ ] P0 = N min — **qual?** (sugestão: 15 min em horário comercial)
- [ ] P1 = N horas — **qual?** (sugestão: 2h)
- [ ] P2 = N horas — **qual?** (sugestão: 8h)
- [ ] P3 = N horas — **qual?** (sugestão: 24h)
- **Sua resposta:** configuravel

**Fila ordenada por:**
- [ ] Prioridade (P0 → P3) e dentro da prioridade por idade do ticket
- [ ] SLA restante (mais perto de estourar = topo)
- [x] Mix dos dois (peso configurável)
- **Sua resposta:**

**SLA breach — o que acontece:**
- [ ] Ticket fica vermelho/highlight na fila
- [ ] Notifica `owner` quando SLA estoura (sino + email)
- [ ] Auto-escala prioridade (P3 → P2 → P1 a cada N% do SLA)
- **Sua resposta:** isso ai

**Contexto pré-carregado pro time** (bundle que o bot prepara antes de escalar):
- [ ] Resumo da conversa com o bot (em 3 frases)
- [ ] Plano + créditos do user + última cobrança
- [ ] Últimos 5 jobs do user (status: ok / falhou / em fila)
- [ ] Histórico: tickets anteriores + última interação com support
- [ ] Afiliado que indicou (se houver)
- [ ] Health score (se S1.5 — health score for "sim")
- [x] Tudo acima
- **Sua resposta:**

**Quem atende:**
- [x] `support` é a role primária
- [ ] `admin`/`owner` veem mas não são notificados por padrão
- [ ] Round-robin entre admins ativos?
- [ ] Cherry-pick: agente puxa o ticket que quer da fila
- **Sua resposta:**

**Status workflow do ticket:**
- [x] `open` → `in_progress` (alguém pegou) → `waiting_user` → `resolved` → `closed`
- [x] Reabertura: user pode reabrir em até N dias após `closed`
- **Sua resposta:**

#### Pós-venda

Lifecycle do usuário depois que paga.

**Triggers:**
- [ ] Email de boas-vindas (logo após primeiro pagamento)
- [ ] Wizard de onboarding na 1ª sessão (qual stack ele quer? canal? estilo?)
- [ ] Check-in 7d após pagamento ("tá tudo ok?")
- [ ] Alerta de "não usou nos últimos N dias" (churn risk)
- [ ] Pesquisa NPS após M dias
- [ ] Email de aniversário do plano (1 mês, 6 meses, 1 ano)
- **Sua resposta:**

**Health score:**
- [ ] Sim, score por user (uso, NPS, tickets) visível no admin
- [ ] Não — ainda é cedo
- **Sua resposta:**

#### Integração com afiliado

Afiliado que vendeu o usuário recebe avisos do ciclo de vida dele.

**Quando notificar afiliado:**
- [ ] Sempre que o referral abrir ticket
- [ ] Só em refund/cancel (pra ele tentar reverter ou entender perda)
- [ ] Só em milestones positivos (renovou plano, upgrade)
- [ ] Tudo acima
- **Sua resposta:**

**Privacidade:**
- [ ] Afiliado vê só evento (sem detalhes do ticket) — recomendado pra LGPD
- [ ] Afiliado vê detalhes (consentimento explícito do user)
- **Sua resposta:**

**Canal:**
- [ ] Email pro afiliado
- [ ] Notificação no painel do afiliado (em `/affiliate/dashboard`)
- [ ] Webhook pra automações dele (opcional)
- **Sua resposta:**

**Fonte de verdade do split:** já existe no `@tn-figueiredo/affiliate` (Thiago).
Pós-venda só consome — não duplica.

---

## Sprint 2 — Admin tooling

### S2.1 — Reset de uso (individual + bulk)

- **Quem pode resetar:**
  - [ ] Só `owner`
  - [x] `owner` + `admin`
  - [ ] `owner` + `admin` + `support`
  - **Sua resposta:** (deixar customizavel o owner e admin podem configurar depois se querem passar pro sup)

- **Bulk reset — critério de seleção:**
  - [ ] Por org/team
  - [ ] Por plano
  - [ ] Por filtro custom (search + checkboxes)
  - [x] Todos os itens acima
  - **Sua resposta:**

- **Audit trail:**
  - [x] Sim, log de quem resetou + quando + motivo (campo de texto obrigatório)
  - [ ] Sim mas motivo opcional
  - **Sua resposta:**

### S2.2 — Doação de créditos (custo do admin)

Você quer dar créditos pra alguém e o custo desconta da sua billing.

- **Origem do custo:**
  - [x] Conta interna BrightTale (admin master)
  - [ ] Conta do admin que doou (cada admin tem orçamento próprio)
  - **Sua resposta:**

- **Limites:**
  - [ ] Sem limite (admin é confiável)
  - [ ] Limite mensal por admin (qual valor?)
  - [x] Aprovação de outro admin se passar de X -> acho que faz mais sentido
  - **Sua resposta:**

- **Notificação ao receptor:**
  - [ ] Email automático ("você ganhou N créditos de Rafael")
  - [ ] Notificação in-app só
  - [x] Os dois
  - **Sua resposta:**

### S2.3 — Planos custom (preço de custo)

Para casos especiais (parceiros, beta testers, family-and-friends).

- **Quem pode criar:**
  - [x] Só `owner`
  - [ ] `owner` + `admin`
  - **Sua resposta:** por agora owner, o admin pode dar deconts de até seila 30% mas por x tempo o owner pode dar 100% preço de custo

- **Tipo:**
  - [ ] Plano clonado de um existente com preço sobrescrito
  - [ ] Plano totalmente custom (cria do zero — créditos, ciclo, preço)
  - [x] Os dois
  - **Sua resposta:**

- **Atribuição:**
  - [ ] Por usuário (1:1)
  - [ ] Por org (todos do team usam)
  - [x] Os dois
  - **Sua resposta:**

### S2.5 — Dashboard financeiro (admin)

Página `/admin/finance` com gráficos de receita vs custo. Tudo em USD por
enquanto (BRL convertido via cotação do dia, com `toFixed(2)`).

**Métricas principais:**
- [ ] **Receita** total / mês / dia (Stripe + Mercado Pago consolidados)
- [ ] **Custo de operação** (soma de chamadas AI + storage + serviços) — vem do log de uso por user × tabela de custo do `pricing-projections.md`
- [ ] **Margem** = receita − custo (absoluto + %)
- [ ] **Status visual:** verde quando margem > X%, amarelo entre Y–X%, vermelho < Y%
- **Sua resposta (X e Y):**

**Charts:**
- [ ] Linha: receita vs custo nos últimos 30/90/365 dias
- [ ] Área: margem ao longo do tempo
- [ ] Barras: top 10 users mais caros (custo de operação) — pra detectar power user "preju"
- [ ] Pizza: custo por provider (OpenAI / Anthropic / Gemini / ElevenLabs / etc.)
- [ ] MRR / ARR (subscription revenue recorrente) com waterfall: novo + expansão − churn
- [ ] **Sua resposta (escolher quais e quais cortes):**

**Granularidade — qual cobrir:**
- [ ] Por plano (Free / Starter / Creator / Pro)
- [ ] Por user individual (drill-down)
- [ ] Por org (se time)
- [ ] Por país / moeda (BR vs gringa quando lançar)
- [ ] Por afiliado (receita gerada pelo afiliado X, comissão paga, líquido)
- **Sua resposta:**

**Alertas / dashboards proativos:**
- [ ] User no preju (custo > receita do plano dele) — listar
- [ ] Provider AI custou mais que threshold no dia (ex.: $X em Anthropic)
- [ ] Refunds passaram de Y% da receita no mês
- [ ] Churn rate subiu acima de Z%
- **Sua resposta:**

**Export:**
- [ ] CSV das métricas (pra contabilidade)
- [ ] Relatório mensal automático por email (pro `owner`)
- **Sua resposta:**

**Cotação USD/BRL:**
- [ ] API gratuita (ex.: AwesomeAPI, Banco Central) — atualizada 1x/dia
- [ ] Stripe já entrega valores em USD nos webhooks (FX deles) — usa esse
- [ ] Manual (admin atualiza no painel)
- **Sua resposta:**

**Quem vê:**
- [ ] Só `owner`
- [ ] `owner` + `admin`
- [ ] `billing` também (role específica)
- **Sua resposta:**

### S2.4 — Coupons

- **Tipos a suportar:**
  - [ ] Percentual (10% off)
  - [ ] Valor fixo (R$50 off)
  - [ ] Crédito grátis (ganha N créditos)
  - [ ] Trial estendido
  - [x] Todos
  - **Sua resposta:**

- **Limites:**
  - [ ] Quantidade de usos total
  - [ ] Quantidade por usuário (1 vez? múltiplas?)
  - [ ] Validade (data fim)
  - [ ] Restrito a planos específicos
  - **Sua resposta:** igual no claude vai ter ter limites que temos aqui de dexemplo -> http://localhost:3003/roadmap/pricing-projections

- **Stripe Coupons API ou implementação própria:**
  - [ ] Stripe nativo (limitado a desconto em sub/checkout)
  - [ ] Próprio (mais flexível, mas mais código)
  - **Sua resposta:** quero menos código mas se oq eu preciso é do próprio n tem problema

---

## Sprint 3 — Polish

### S3.1 — MFA (admin)

Já existem specs em `docs/security/SEC-001-login-hardening.md` e
`SEC-002-admin-hardening.md`. AAL2 gate já está no middleware. Falta:

- [ ] **Recovery codes** — quando admin enrolla TOTP, gera 10 códigos
  one-shot. Hashea com Argon2id no DB. Se perde o celular, usa 1 código
  pra logar e re-enrolla. Sem isso, perder o celular = SQL manual ou
  outro admin destravar. Padrão: GitHub, AWS, Cloudflare.
- [ ] **UI "perdi o telefone"** — admin A pede destravamento, admin B
  aprova com seu próprio MFA. Sem isso, é só SQL manual (documentado em
  ADMIN-PROVISIONING.md).
- [ ] **Auto-unenroll após N falhas** — se digitar TOTP errado N vezes,
  desabilita o factor. Trade-off: segurança vs UX. Eu **não recomendaria**
  — vira ataque de DoS fácil contra admin.
- **Outros:**

**MFA pra end-user (não-admin):**
- [ ] Não — só admin tem MFA
- [x] Sim, opcional (toggle) ou 2FA com celular se a pessoa quiser
- [ ] Sim, obrigatório
- **Sua resposta:**

### S3.2 — Admin tweaks

Lista o que falta/incomoda no admin atual:

- [x] Layout eu quero que seja mais moderno e n pareça algo feiot de quaqler jeoto
- [x] Gestão de users ta confusa

### S3.3 — Tapa na página de vendas

- **Qual página:**
  - [ ] `apps/web` (landing pública em brighttale.com.br)
  - [ ] `apps/app` upgrade page (interno pra usuário logado)
  - [x] As duas
  - **Sua resposta:**

- **Mudanças desejadas:**
  - [ ] tem muito placeholder quero que seja uma pagnina de vendas que entende nosso produto e que entrega pormessas tipo '25 posts de qualdiade por blog por dia' algo assim, roteiros para youtube e tals

---

## Outros pontos abertos

- **Nomenclatura:** "tokens" vs "créditos" — escolher um e usar consistente
  - [x] tokens
  - [ ] créditos
  - [ ] outro: ________
  - **Sua resposta:**

- **Multi-currency:** suporta só BRL ou também USD/EUR?
  - [ ] Só BRL
  - [ ] BRL + USD
  - [x] BRL + USD + EUR (auto-detectar por país)
  - **Sua resposta:** a base vai ser em USD e talvez a gente só converta com a tocação do dia e the um tofixed

- **Refunds:** política?
  - [ ] N dias após compra (qual N?)
  - [ ] Só se créditos não foram usados
  - [ ] Caso a caso (admin decide)
  - **Sua resposta:** de n gastou nada 7 dias (defesa do consumidor), se gastou um pouco mas perceeu que n ta legal até 24h acho que é rasoavel

- **Affiliate (já tem código):** integra com o sistema de monetização novo? Como?
  - **Sua resposta:** No caso eu acho que ele é meio que a SRc of truth lá já tem split de pagametnos quem fez essa feature foi Thiago dai eu preciso que funcione tbm todas essas features

---

## Open Issues / Blockers

(Coloque aqui qualquer dúvida que surgir enquanto preenche)

- _____________________________

---

## Próximos passos (depois que preencher)

1. Reviso suas respostas
2. Identifico conflitos com specs existentes (`payments-stripe.md`, etc.)
3. Atualizo specs existentes onde necessário
4. Crio specs novos pra o que não tem (página `/usage`, admin tools)
5. Quebro tudo em cards (M-XXX) com: scope, files, tests, migrations, docs
6. Estimo esforço e proponho ordem de ataque
