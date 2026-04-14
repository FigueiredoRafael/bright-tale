export const metadata = {
    title: 'Termos de Uso — BrightTale',
    description: 'Termos de uso da plataforma BrightTale.',
};

export default function TermsPage() {
    return (
        <main className="max-w-3xl mx-auto px-6 py-12 prose dark:prose-invert">
            <h1>Termos de Uso</h1>
            <p><em>Última atualização: 14 de abril de 2026.</em></p>

            <h2>1. Aceite</h2>
            <p>Ao usar BrightTale, você concorda com estes Termos e com nossa <a href="/legal/privacy">Política de Privacidade</a>.</p>

            <h2>2. Serviço</h2>
            <p>BrightTale é uma plataforma de automação de conteúdo que usa IA para gerar ideias, pesquisas, posts, roteiros e mídia. Você é responsável pelo conteúdo que gera e publica.</p>

            <h2>3. Contas e organizações</h2>
            <p>Uma conta é vinculada a uma organização. Membros convidados podem ter permissões diferentes. Você é responsável pelas ações executadas pela sua conta.</p>

            <h2>4. Créditos e planos</h2>
            <p>Planos mensais/anuais fornecem créditos renováveis. Créditos avulsos (add-on packs) não expiram até serem usados. Pagamentos são processados via Stripe (e Mercado Pago, quando habilitado).</p>

            <h2>5. Conteúdo gerado</h2>
            <p>Você retém todos os direitos sobre o conteúdo gerado pela plataforma. A BrightTale não reivindica propriedade. O uso de modelos de IA de terceiros (Anthropic, OpenAI, Google) segue os termos desses provedores.</p>

            <h2>6. Uso aceitável</h2>
            <p>É proibido gerar conteúdo que: viole leis, infrinja direitos de propriedade intelectual de terceiros, contenha discurso de ódio, spam, ou desinformação deliberada.</p>

            <h2>7. Cancelamento</h2>
            <p>Você pode cancelar a assinatura a qualquer momento pelo portal Stripe (Settings → Billing → Gerenciar assinatura). O acesso continua até o fim do ciclo pago.</p>

            <h2>8. Reembolso</h2>
            <p>Veja nossa <a href="/legal/refund">Política de Reembolso</a>.</p>

            <h2>9. Limitação de responsabilidade</h2>
            <p>O serviço é fornecido "como está". Não garantimos disponibilidade 100% nem precisão factual do conteúdo gerado. Responsabilidade máxima limitada ao valor pago pelo usuário nos últimos 12 meses.</p>

            <h2>10. Alterações</h2>
            <p>Podemos atualizar estes Termos. Mudanças materiais serão notificadas por email. Uso continuado após a mudança constitui aceite.</p>

            <h2>11. Contato</h2>
            <p>Dúvidas: <a href="mailto:legal@brighttale.io">legal@brighttale.io</a></p>
        </main>
    );
}
