export const metadata = {
    title: 'Política de Privacidade — BrightTale',
    description: 'Como a BrightTale trata seus dados.',
};

export default function PrivacyPage() {
    return (
        <main className="max-w-3xl mx-auto px-6 py-12 prose dark:prose-invert">
            <h1>Política de Privacidade</h1>
            <p><em>Última atualização: 14 de abril de 2026.</em></p>

            <h2>Dados que coletamos</h2>
            <ul>
                <li><strong>Conta:</strong> email, nome, senha (hash), preferências</li>
                <li><strong>Uso:</strong> quais agentes rodou, tokens consumidos, conteúdo gerado</li>
                <li><strong>Pagamento:</strong> processado pelo Stripe; não guardamos números de cartão</li>
                <li><strong>Integrações:</strong> tokens OAuth (YouTube, WordPress) criptografados</li>
                <li><strong>Conteúdo:</strong> ideias, pesquisas, drafts, imagens geradas</li>
            </ul>

            <h2>Como usamos</h2>
            <p>Os dados servem exclusivamente pra operar o serviço. Não vendemos nem compartilhamos com anunciantes. Provedores de IA (Anthropic, OpenAI, Google) recebem apenas o conteúdo necessário pra completar a requisição, conforme seus próprios termos.</p>

            <h2>Onde guardamos</h2>
            <p>Banco de dados Supabase (PostgreSQL) com criptografia em repouso. Chaves sensíveis (WordPress password, OAuth refresh tokens) usam AES-256-GCM adicional.</p>

            <h2>Direitos (LGPD / GDPR)</h2>
            <p>Você pode solicitar: exportar seus dados, deletar conta + conteúdo, corrigir informações incorretas. Requisições em <a href="mailto:privacy@brighttale.io">privacy@brighttale.io</a>.</p>

            <h2>Cookies</h2>
            <p>Usamos cookies essenciais (autenticação, sessão). Sem rastreio publicitário de terceiros.</p>

            <h2>Retenção</h2>
            <p>Dados da conta: enquanto ativa. 30 dias após cancelamento, exclusão total. Backups: 90 dias.</p>

            <h2>Transferências internacionais</h2>
            <p>Provedores de IA podem processar dados fora do Brasil (EUA). Coberto por cláusulas padrão de transferência.</p>

            <h2>Contato</h2>
            <p>DPO: <a href="mailto:privacy@brighttale.io">privacy@brighttale.io</a></p>
        </main>
    );
}
