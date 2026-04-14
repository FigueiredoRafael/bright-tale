/**
 * F3-009 — Mercado Pago PIX/boleto scaffold.
 *
 * IMPLEMENTAÇÃO PENDENTE — depende de conta Mercado Pago + access token.
 *
 * Setup esperado:
 * 1. Criar conta no Mercado Pago (https://www.mercadopago.com.br/developers)
 * 2. Criar aplicação, copiar ACCESS_TOKEN (test + prod)
 * 3. Configurar webhook endpoint pra notificações
 * 4. Instalar SDK: `npm install mercadopago --workspace @brighttale/api`
 * 5. Implementar `createPreference(packId, userId)` retornando init_point URL
 * 6. Implementar handler de webhook pra marcar pagamento aprovado + creditar
 *    `credits_addon` no org (mesmo padrão do Stripe addon).
 *
 * Este stub deixa a estrutura pronta pra destravar facilmente quando a
 * prioridade subir.
 */

export interface MercadoPagoPreference {
  id: string;
  init_point: string;       // URL pra redirecionar usuário
  sandbox_init_point?: string;
}

export interface PaymentNotification {
  id: string;
  type: 'payment';
  data: { id: string };
}

export function isMercadoPagoConfigured(): boolean {
  return !!process.env.MERCADOPAGO_ACCESS_TOKEN;
}

/**
 * Cria uma preference de pagamento. Implementação real vai usar o SDK
 * oficial do MP. Por ora lança erro instrutivo.
 */
export async function createCheckoutPreference(_packId: string, _userId: string): Promise<MercadoPagoPreference> {
  if (!isMercadoPagoConfigured()) {
    throw new Error(
      'Mercado Pago não configurado. Set MERCADOPAGO_ACCESS_TOKEN em apps/api/.env.local e implemente este stub. ' +
      'Ver apps/api/src/lib/billing/mercadopago.ts pra steps.',
    );
  }
  throw new Error('Mercado Pago integration pending (F3-009). Stub only.');
}
