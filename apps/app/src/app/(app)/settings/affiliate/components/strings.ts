/**
 * Hard-coded pt-BR strings for the affiliate settings tree.
 * Shape mirrors a future i18n namespace (`affiliate.*`) so extraction is
 * mechanical when NextIntlClientProvider is wired over (app)/ (out of scope
 * for 2B; see spec §10).
 */
export const strings = {
  title: 'Programa de Afiliados',
  back_to_settings: 'Configurações',
  state: {
    not_affiliate: {
      title: 'Você ainda não é afiliado',
      body: 'Cadastre-se para começar a indicar e receber comissões.',
      cta: 'Candidatar-se',
    },
    pending: {
      title: 'Candidatura em análise',
      body: 'Avaliamos em até 3 dias úteis.',
    },
    proposal: {
      title: 'Nova proposta de contrato',
      accept: 'Aceitar proposta',
      reject: 'Rejeitar',
      lgpd_consent:
        'Ao aceitar, você concorda com os termos e o tratamento dos seus dados pessoais conforme a LGPD.',
    },
    paused: {
      banner: 'Conta pausada — fale com o suporte para reativar.',
    },
    terminated: {
      title: 'Parceria encerrada',
      body: 'Seu acesso ao programa foi finalizado.',
      support: 'Falar com o suporte',
    },
  },
  tier: { nano: 'Nano', micro: 'Micro', mid: 'Mid', macro: 'Macro', mega: 'Mega' },
  stats: {
    clicks: 'Cliques',
    referrals: 'Indicações',
    conversions: 'Conversões',
    pending: 'Pendente',
    paid: 'Pago',
  },
  referral: {
    section_title: 'Link de indicação',
    copy_signup: 'Copiar link de cadastro',
    copy_homepage: 'Copiar link da página inicial',
    copied: 'Link copiado!',
  },
  payout: {
    section_title: 'Pagamentos',
    request: 'Solicitar pagamento',
    confirm_title: 'Confirmar solicitação',
    confirm_body: (amount: string, pix: string) =>
      `${amount} será enviado para ${pix}. Prosseguir?`,
    proceed: 'Solicitar',
    cancel: 'Cancelar',
    min_tooltip: (min: string) => `Mínimo de ${min} para solicitar pagamento.`,
    no_default_tooltip: 'Cadastre uma chave PIX padrão abaixo para habilitar pagamentos.',
    success: 'Pagamento solicitado — revisão pelo admin pendente.',
    tax_id_irregular: 'Seu CPF/CNPJ está com pendência. Atualize seu cadastro para solicitar pagamentos.',
  },
  pix: {
    section_title: 'Chaves PIX',
    add: 'Adicionar chave PIX',
    set_default: 'Definir como padrão',
    delete: 'Remover',
    default_badge: 'Padrão',
    confirm_delete_title: 'Remover chave PIX?',
    confirm_delete_body: 'Essa ação não pode ser desfeita.',
    cannot_delete_default:
      'Não é possível remover a chave padrão enquanto existirem outras — defina outra como padrão primeiro.',
    invalid: {
      cpf: 'CPF inválido — deve conter 11 dígitos.',
      cnpj: 'CNPJ inválido — deve conter 14 dígitos.',
      email: 'E-mail inválido.',
      phone: 'Telefone inválido — use DDI+DDD+número.',
      random: 'Chave aleatória inválida — deve ter 32–36 caracteres.',
    },
  },
  content: {
    section_title: 'Conteúdo publicado',
    submit: 'Enviar conteúdo',
    submit_success: 'Conteúdo enviado para revisão.',
    invalid_url: 'URL inválida.',
  },
  commissions: {
    section_title: 'Comissões',
    status: { pending: 'Pendente', paid: 'Pago', cancelled: 'Cancelado' },
    retroactive_badge: 'Retroativo',
    empty: 'Nenhuma comissão ainda.',
  },
  referrals: {
    section_title: 'Indicações recentes',
    empty: 'Nenhuma indicação ainda.',
  },
  clicks_by_platform: {
    section_title: 'Cliques por plataforma',
  },
  errors: {
    unknown: 'Erro — tente novamente.',
    forbidden: 'Operação não permitida — fale com o suporte.',
    get_me_failed: 'Não foi possível carregar seus dados. Tentar novamente?',
    retry: 'Tentar novamente',
  },
} as const;

export type AffiliateStrings = typeof strings;
