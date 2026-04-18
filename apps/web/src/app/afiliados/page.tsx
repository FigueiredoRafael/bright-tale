import { AffiliateLandingPage } from '@tn-figueiredo/affiliate-portal/server'
import { portalConfig } from '@/lib/affiliate-portal-config'

export const metadata = {
  title: 'Programa de Afiliados — BrightTale',
  description: 'Ganhe comissão indicando o BrightTale. Candidate-se ao nosso programa de afiliados.',
}

export default function AfiliadosPage() {
  return <AffiliateLandingPage config={portalConfig} tierRates={[]} />
}
