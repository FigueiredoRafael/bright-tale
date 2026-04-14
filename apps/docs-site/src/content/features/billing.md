# Billing (Plano & créditos)

Página: `/settings/billing`

Mostra status do plano atual, progress bar de créditos e cards pra upgrade.

## Seções

### Status atual
- Nome do plano + badge do ciclo (mensal/anual)
- Data de renovação
- Progress bar de créditos usados:
  - **Verde** <80%
  - **Âmbar** 80-95%
  - **Vermelho** ≥95%
- Botão "Gerenciar assinatura" → abre Stripe Customer Portal (visível se já tem customer)

### Toggle de ciclo
Mensal / Anual. O anual mostra badge "-22%" e preço equivalente mensal.

### Grid de planos (4 cards)
- **Free** — $0, 1k créditos/mês
- **Starter** — $9/mo (ou $7 annual), 5k créditos
- **Creator** (badge "Popular") — $29/mo ($23 annual), 15k créditos
- **Pro** (gradient card) — $99/mo ($79 annual), 50k créditos

Cada card: preço, créditos/mês, features (vindos de `GET /api/billing/plans`), CTA.

O plano atual fica com ring destacado e botão "Plano atual" disabled.

## Alerts proativos

Em todo o app, um `<CreditsBanner>` aparece no topo do layout se o uso passar de 80% ou 95%:
- **80%+** âmbar: "Você já usou X% dos Y créditos do mês"
- **95%+** vermelho: "Só restam X créditos (Y% do plano)"
- Link "Fazer upgrade" → `/settings/billing`
- Dispensável (sessionStorage) mas volta a cada reset de créditos

## Modal de upgrade contextual

Quando qualquer geração retorna `INSUFFICIENT_CREDITS`, o hook `useUpgrade().handleMaybeCreditsError(err)` intercepta e abre `<UpgradeModal>` com:
- Plano atual + créditos restantes
- Próximo tier sugerido (ou Creator se Free), com "Nx mais créditos" e top 4 features
- CTAs: "Agora não" / "Ver planos"

Ativo em brainstorm, research, drafts/new e drafts/[draftId].

## Código

- `apps/app/src/app/(app)/settings/billing/page.tsx`
- `apps/app/src/components/billing/{UpgradeProvider,UpgradeModal,CreditsBanner}.tsx`
- `apps/app/src/hooks/useBillingStatus.ts`

## API

Ver [Billing API](/api-reference/billing) pros endpoints.
