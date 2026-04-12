# Sistema de Afiliados

**Status:** 🔲 A implementar

## Conceito

Usuários podem indicar novos clientes e ganhar comissão sobre assinaturas.

## Funcionalidades Planejadas

- Código de referral único por usuário
- Dashboard de afiliado (cliques, conversões, comissões)
- Tracking de conversões (signup → pagamento)
- Pagamento de comissões (mensal)
- Materiais de marketing para afiliados

## Modelo de Dados (proposta)

| Tabela | Campos |
|---|---|
| `affiliate_codes` | user_id, code, is_active |
| `affiliate_referrals` | code, referred_user_id, status, converted_at |
| `affiliate_commissions` | referral_id, amount, status, paid_at |

## Regras de Negócio (a definir)

- % de comissão por plano
- Comissão recorrente ou one-time?
- Período mínimo de assinatura para validar comissão
- Limite de pagamento mínimo para saque

## Campos de Afiliado no Conteúdo

Já existem campos nos drafts para posicionamento de links de afiliado:
- `blog_drafts.affiliate_placement` / `affiliate_copy` / `affiliate_link`
- `canonical_core.affiliate_moment_json`

Estes são para afiliados **dentro do conteúdo gerado** (produtos de terceiros), diferente do sistema de referral da plataforma.
