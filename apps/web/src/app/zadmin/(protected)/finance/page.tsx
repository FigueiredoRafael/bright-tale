import { ComingSoon } from '../_components/ComingSoon'

export default function FinancePage() {
  return (
    <ComingSoon
      title="Finance"
      card="M-015-finance-dashboard"
      description="Dashboard financeiro USD: receita × custo de operação × margem. Status verde > 40% / amarelo 20–40% / vermelho < 20%. Charts: linha receita×custo, área de margem, top 10 users mais caros, pizza por provider AI, MRR waterfall. Alertas proativos quando provider passa threshold ou churn sobe."
    />
  )
}
