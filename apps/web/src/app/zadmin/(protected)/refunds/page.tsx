import { ComingSoon } from '../_components/ComingSoon'

export default function RefundsPage() {
  return (
    <ComingSoon
      title="Refunds"
      card="M-007-auto-refund"
      description="Auditoria de refunds processados. Auto-refund: ≤7d sem uso ou ≤24h com ≤10% gasto, cap $50. Anti-abuso: mesmo email/IP/cartão, conta < 24h, velocity global. Quando trap dispara, ticket P1 com tag fraud_risk + bundle de contexto pra admin julgar."
    />
  )
}
