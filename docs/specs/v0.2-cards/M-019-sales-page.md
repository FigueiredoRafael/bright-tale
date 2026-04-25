---
id: M-019
title: Sales page redo (apps/web + apps/app upgrade)
status: ready
sprint: S3
depends-on: [M-001]
estimate: 4d
---

# M-019 — Sales page

Refazer landing pública (`apps/web`) e upgrade page interno (`apps/app`).

## Decisões fechadas (input do user)

- "Tem muito placeholder, quero que entenda o produto e entregue promessas
  tipo '25 posts de qualidade por blog por dia', roteiros pra YouTube, etc."

## Latitude criativa

Direção sugerida:

- **Hero promise concreto:** "25 blog posts SEO-otimizados / mês com 1 plano de R$X" (ou tradução em outras moedas)
- **Above the fold:**
  - Headline com promessa
  - Subhead com proof (afiliado, redução de custo, comparação com freelancer)
  - CTA: "Começar grátis" (5 min sem cartão)
  - Demo curta (loop video 30s mostrando pipeline)
- **Value props (grid):**
  - Brainstorm + research + draft + review + publish em 1 fluxo
  - Múltiplos modelos AI (escolhe Standard / Premium / Ultra por blog)
  - Imagens + áudio + vídeo (dark channel completo)
  - Afiliados (ganhe X% indicando)
- **Pricing table** com 4 planos (Free / Starter / Creator / Pro) + toggle mensal/anual + Apple/Google Pay icons
- **Comparação direta** com alternativas (freelancer, ChatGPT bruto, copy paste)
- **FAQ** real (refunds, créditos, modelos, white-label, etc.)
- **CTA final** com social proof
- **apps/app upgrade page:**
  - Cards de plano com "current" badge no atual + button "Upgrade"
  - Top-up package buttons abaixo
  - Pricing toggle mensal/anual

## Acceptance criteria

- [ ] Hero implementado (sem placeholder)
- [ ] Pricing table com Stripe Checkout funcional (M-001)
- [ ] FAQ scrolável
- [ ] Mobile responsive
- [ ] Conversion tracking (PostHog event "checkout_started")
- [ ] User aprova visualmente

## Files

- `apps/web/src/app/(public)/page.tsx` — refactor home
- `apps/web/src/app/(public)/pricing/*` — refactor
- `apps/app/src/app/(authenticated)/upgrade/*` (new)
- `apps/web/src/components/landing/*` (new)

## Out of scope

- A/B testing framework (PostHog feature flag basta inicialmente)
- Vídeo de demo gravado (placeholder até ter real)
- Multi-language (pt-BR primeiro)
