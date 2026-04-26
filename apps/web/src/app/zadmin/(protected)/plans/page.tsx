import { ComingSoon } from '../_components/ComingSoon'

export default function PlansPage() {
  return (
    <ComingSoon
      title="Planos"
      card="M-013-custom-plans"
      description="Gestão de planos do Stripe + planos custom (preço de custo / parceiros / family-and-friends). Owner pode criar plano com qualquer preço; admin pode aplicar até 30% off por tempo limitado. Atribuição por user 1:1 ou por org."
    />
  )
}
