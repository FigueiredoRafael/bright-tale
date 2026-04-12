# Pagamentos

**Status:** 🔲 A implementar

## Gateway (a definir)

| Opção | Prós | Contras |
|---|---|---|
| **Stripe** | Global, bem documentado | Taxas internacionais |
| **Mercado Pago** | Popular no Brasil, PIX | Menos global |
| **Ambos** | Cobertura máxima | Complexidade |

## Funcionalidades Planejadas

- Checkout para upgrade de plano
- Billing history
- Cancelamento / downgrade
- Renovação automática
- PIX como opção de pagamento (Brasil)
- Webhook para atualizar `user_profiles.is_premium` automaticamente

## Modelo de Dados (proposta)

| Tabela | Campos |
|---|---|
| `subscriptions` | user_id, plan, status, gateway, gateway_subscription_id, current_period_start, current_period_end |
| `payments` | subscription_id, amount, currency, status, gateway_payment_id, paid_at |
| `invoices` | payment_id, invoice_url, pdf_url |

## Fluxo

```
1. Usuário escolhe plano
2. Redirect para checkout do gateway
3. Pagamento processado
4. Webhook atualiza subscription + user_profiles
5. Tokens do novo plano liberados
6. Renovação automática no vencimento
```
