import { ComingSoon } from '../_components/ComingSoon'

export default function SupportPage() {
  return (
    <ComingSoon
      title="Suporte"
      card="M-008-support-escalation"
      description="Fila de tickets escalados pelo chatbot AI (M-006). Ordenados por prioridade (P0–P3) + SLA restante. Bundle de contexto pré-carregado: resumo da conversa, plano + tokens do user, últimos 5 jobs, histórico de tickets, afiliado. SLA breach destaca em vermelho + auto-escala."
    />
  )
}
