export const metadata = {
    title: 'Política de Reembolso — BrightTale',
};

export default function RefundPage() {
    return (
        <main className="max-w-3xl mx-auto px-6 py-12 prose dark:prose-invert">
            <h1>Política de Reembolso</h1>
            <p><em>Última atualização: 14 de abril de 2026.</em></p>

            <h2>Planos mensais</h2>
            <p>Não há reembolso parcial do mês em andamento. Ao cancelar, acesso continua até o fim do ciclo.</p>

            <h2>Planos anuais</h2>
            <p>Reembolso pro-rata nos primeiros 14 dias. Após esse prazo, seguimos até o fim do ciclo.</p>

            <h2>Créditos avulsos (add-on packs)</h2>
            <p>Reembolsáveis em até 7 dias, desde que menos de 10% dos créditos tenham sido utilizados.</p>

            <h2>Consumo excessivo por falha da plataforma</h2>
            <p>Se uma falha do nosso lado consumir créditos injustamente (ex.: job Inngest re-disparado por bug), aplicamos crédito automático após análise do log.</p>

            <h2>Como solicitar</h2>
            <p>Email pra <a href="mailto:billing@brighttale.io">billing@brighttale.io</a> com o ID da cobrança (Stripe invoice). Retornamos em até 3 dias úteis.</p>
        </main>
    );
}
