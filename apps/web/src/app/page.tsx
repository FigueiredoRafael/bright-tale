'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── i18n ────────────────────────────────────────────────────────────────────

const translations = {
  en: {
    nav_how: 'How it works', nav_features: 'Features', nav_pricing: 'Pricing', nav_cta: 'Start Free →',
    hero_badge: 'Now in Early Access',
    hero_title: 'From idea to<br><span class="gradient-text">published post</span><br>in minutes.',
    hero_sub: 'BrightTale is your AI content engine. It brainstorms, researches, writes, optimizes for SEO, adds affiliate links, and publishes to WordPress — automatically.',
    hero_email_placeholder: 'Enter your email', hero_cta: 'Get Early Access',
    hero_note: 'Free forever plan. No credit card. <strong style="color:var(--brand-300)">Join 1,200+ creators</strong> on the waitlist.',
    metric_time: 'Avg. time per post', metric_agents: 'Working in sequence', metric_auto: 'Automated pipeline', metric_publish: 'WordPress publish',
    trusted_label: 'Trusted by content creators worldwide',
    pipe_label: 'How it works',
    pipe_title: 'Five agents. One pipeline.<br><span class="gradient-text">Zero manual work.</span>',
    pipe_desc: 'Each step is powered by a specialized AI agent. You provide the seed — we grow it into a full, optimized, published article.',
    step1_title: 'Brainstorm', step1_desc: 'AI generates topic ideas with angles, hooks, and keyword targets for your niche.',
    step2_title: 'Research', step2_desc: 'Deep research agent gathers data, stats, and sources into a comprehensive brief.',
    step3_title: 'Write', step3_desc: 'Production agent crafts SEO-optimized long-form content in your brand voice.',
    step4_title: 'Optimize', step4_desc: 'Review agent adds affiliate links, meta tags, and readability improvements.',
    step5_title: 'Publish', step5_desc: 'One-click deploy to WordPress with images, categories, and schema markup.',
    show_label: 'Built for Scale',
    show_title: 'Content that writes<br><span class="gradient-text">itself.</span>',
    show_desc: "BrightTale doesn't just generate text — it runs a full editorial workflow. Each article goes through brainstorming, fact-based research, SEO writing, and human-quality review.",
    sf1_title: 'Keyword-first strategy', sf1_desc: 'Every article starts with real search data. Target queries your audience actually searches.',
    sf2_title: 'Multi-agent architecture', sf2_desc: 'Four specialized agents — brainstorm, research, production, review — each focused on what it does best.',
    sf3_title: 'Monetization built-in', sf3_desc: 'Automatic affiliate link injection, smart product placement, and conversion-optimized CTAs.',
    feat_label: 'Features',
    feat_title: 'Everything you need to<br><span class="gradient-text">scale your content.</span>',
    feat_desc: 'A complete content automation platform — from ideation to monetization.',
    b1_title: 'AI-Powered Research Engine',
    b1_desc: 'Every article starts with deep research. BrightTale scans multiple sources, extracts key data points, statistics and quotes, then builds a comprehensive brief — ensuring your content is accurate and authoritative, not AI-generated fluff.',
    b1_tag: 'Core Feature',
    b2_title: 'Smart Affiliate Links', b2_desc: 'Auto-inject contextually relevant affiliate links. Track clicks, manage programs, maximize revenue per article.',
    b3_title: 'SEO Optimization', b3_desc: 'Built-in keyword targeting, meta tags, schema markup, internal linking, and readability scoring.',
    b4_title: 'Full Pipeline Automation',
    b4_desc: 'Set it and forget it. Schedule content pipelines to run daily, weekly, or custom. Wake up to fresh, published, SEO-optimized articles on your WordPress — with affiliate links already earning.',
    b4_tag: 'Game Changer',
    b5_title: 'Brand Voice Control', b5_desc: 'Define your tone, style, and vocabulary. BrightTale writes like you — consistently.',
    b6_title: 'Template System', b6_desc: 'Reusable templates for reviews, listicles, how-tos, and comparisons at scale.',
    b7_title: 'Encrypted Credentials', b7_desc: 'WordPress credentials encrypted with AES-256-GCM. Your data stays secure.',
    int_label: 'Integrations',
    int_title: 'Connects to your<br><span class="gradient-text">existing stack.</span>',
    int_desc: 'BrightTale works with the tools you already use and love.',
    int_wp: 'Auto-publish', int_gs: 'Keyword data', int_oai: 'GPT models', int_amz: 'Affiliate links',
    int_an: 'Performance', int_pg: 'Data storage', int_vc: 'Deployment', int_any_title: 'Any Affiliate', int_any: 'Custom programs',
    stat1: 'Articles published', stat2: 'Automation rate', stat3: 'Avg. time per article', stat4: 'More content output',
    test_label: 'Testimonials',
    test_title: 'Loved by <span class="gradient-text">creators.</span>',
    test1_text: '"I went from publishing 2 posts per week to 2 posts per day. My organic traffic tripled in the first month. BrightTale is a game changer."',
    test1_role: 'Content Creator, São Paulo',
    test2_text: "\"The affiliate link automation alone pays for the subscription 10x over. I'm earning while I sleep. The research quality blew me away.\"",
    test2_role: 'Affiliate Marketer, Austin',
    test3_text: '"Finally, an AI tool that doesn\'t produce generic content. The multi-agent approach means each article has depth and real data behind it."',
    test3_role: 'SEO Consultant, Lisbon',
    pr_label: 'Pricing',
    pr_title: 'Start free.<br><span class="gradient-text">Scale when ready.</span>',
    pr_desc: 'No credit card required. Upgrade when your content engine needs more power.',
    pr_pop_badge: 'Most Popular',
    pr_starter_desc: 'For creators getting started', pr_pro_desc: 'For serious content creators',
    pr_agency_name: 'Agency', pr_agency_desc: 'For teams and agencies',
    pr_s1: '5 articles per month', pr_s2: 'Basic AI brainstorming', pr_s3: '1 WordPress site', pr_s4: 'Standard templates', pr_s5: 'Community support',
    pr_p1: 'Unlimited articles', pr_p2: 'Deep research agent', pr_p3: '5 WordPress sites', pr_p4: 'Affiliate link automation', pr_p5: 'Custom brand voice', pr_p6: 'Priority support',
    pr_a1: 'Everything in Pro', pr_a2: 'Unlimited WP sites', pr_a3: 'Team collaboration', pr_a4: 'Custom AI prompts', pr_a5: 'API access', pr_a6: 'Dedicated support',
    pr_starter_btn: 'Get Started Free', pr_pro_btn: 'Start Free Trial', pr_agency_btn: 'Contact Sales',
    trust1: 'AES-256 encrypted', trust2: '99.9% uptime SLA', trust3: 'Cancel anytime', trust4: 'GDPR compliant',
    faq_title: 'Common <span class="gradient-text">questions.</span>',
    faq_desc: 'Everything you need to know about BrightTale.',
    faq1_q: 'How does the content pipeline work?',
    faq1_a: 'BrightTale uses four specialized AI agents that work in sequence: the Brainstorm agent generates topic ideas and keyword targets, the Research agent gathers data from multiple sources, the Production agent writes SEO-optimized content in your brand voice, and the Review agent adds affiliate links, internal links, and meta tags. The entire process takes about 4-5 minutes per article.',
    faq2_q: 'Will my content sound like it was written by AI?',
    faq2_a: "No. Unlike simple AI generators, BrightTale's multi-agent architecture ensures each article goes through research, writing, AND review stages. The Brand Voice feature learns your unique style — your tone, vocabulary, and formatting preferences. The result reads like content you wrote yourself, backed by real data and sources.",
    faq3_q: 'Which affiliate programs are supported?',
    faq3_a: 'BrightTale supports Amazon Associates out of the box, plus any custom affiliate program. You configure your affiliate links and rules, and the optimization agent automatically places them in contextually relevant positions within your content — maximizing clicks without feeling spammy.',
    faq4_q: "Can I review content before it's published?",
    faq4_a: "Absolutely. You can configure your pipeline to auto-publish directly, or to pause for your review before publishing. Every article has full revision history so you can track changes, edit, and approve at your own pace. You're always in control.",
    faq5_q: 'Is my WordPress data secure?',
    faq5_a: 'Yes. All WordPress credentials are encrypted using AES-256-GCM — the same standard used by banks and governments. Your passwords are never stored in plain text and cannot be accessed by anyone, including our team. We take security seriously.',
    faq6_q: 'Can I cancel my subscription anytime?',
    faq6_a: 'Yes, no contracts, no lock-ins. Cancel with one click from your dashboard. Your content and data remain accessible even after cancellation. You can also downgrade to the free Starter plan at any time.',
    cta_title: 'Stop writing.<br><span class="gradient-text-warm">Start publishing.</span>',
    cta_desc: 'Join 1,200+ creators who are scaling their content with AI-powered automation.',
    footer_desc: 'AI-powered content automation. From idea to published post in minutes. A BrightLabs product.',
    ft_product: 'Product', ft_resources: 'Resources', ft_company: 'Company',
    ft_docs: 'Documentation', ft_api: 'API Reference', ft_status: 'Status Page',
    ft_about: 'About BrightLabs', ft_contact: 'Contact', ft_privacy: 'Privacy Policy', ft_terms: 'Terms of Service',
  },
  pt: {
    nav_how: 'Como funciona', nav_features: 'Funcionalidades', nav_pricing: 'Preços', nav_cta: 'Comece Grátis →',
    hero_badge: 'Acesso Antecipado Aberto',
    hero_title: 'Da ideia ao<br><span class="gradient-text">post publicado</span><br>em minutos.',
    hero_sub: 'BrightTale é seu motor de conteúdo com IA. Ele faz brainstorm, pesquisa, escreve, otimiza para SEO, adiciona links de afiliados e publica no WordPress — automaticamente.',
    hero_email_placeholder: 'Digite seu email', hero_cta: 'Acesso Antecipado',
    hero_note: 'Plano gratuito para sempre. Sem cartão de crédito. <strong style="color:var(--brand-300)">Junte-se a 1.200+ criadores</strong> na lista de espera.',
    metric_time: 'Tempo médio por post', metric_agents: 'Trabalhando em sequência', metric_auto: 'Pipeline automatizado', metric_publish: 'Publicação WordPress',
    trusted_label: 'Usado por criadores de conteúdo no mundo todo',
    pipe_label: 'Como funciona',
    pipe_title: 'Cinco agentes. Um pipeline.<br><span class="gradient-text">Zero trabalho manual.</span>',
    pipe_desc: 'Cada etapa é executada por um agente de IA especializado. Você fornece a ideia — nós transformamos em um artigo completo, otimizado e publicado.',
    step1_title: 'Brainstorm', step1_desc: 'A IA gera ideias de tópicos com ângulos, ganchos e palavras-chave para o seu nicho.',
    step2_title: 'Pesquisa', step2_desc: 'Agente de pesquisa profunda coleta dados, estatísticas e fontes em um briefing completo.',
    step3_title: 'Escrita', step3_desc: 'Agente de produção cria conteúdo longo otimizado para SEO na voz da sua marca.',
    step4_title: 'Otimização', step4_desc: 'Agente de revisão adiciona links de afiliados, meta tags e melhorias de legibilidade.',
    step5_title: 'Publicação', step5_desc: 'Deploy em um clique no WordPress com imagens, categorias e schema markup.',
    show_label: 'Feito para Escalar',
    show_title: 'Conteúdo que se escreve<br><span class="gradient-text">sozinho.</span>',
    show_desc: 'O BrightTale não apenas gera texto — ele executa um fluxo editorial completo. Cada artigo passa por brainstorming, pesquisa factual, escrita SEO e revisão de qualidade humana.',
    sf1_title: 'Estratégia keyword-first', sf1_desc: 'Todo artigo começa com dados reais de busca. Mire nas consultas que sua audiência realmente pesquisa.',
    sf2_title: 'Arquitetura multi-agente', sf2_desc: 'Quatro agentes especializados — brainstorm, pesquisa, produção, revisão — cada um focado no que faz melhor.',
    sf3_title: 'Monetização integrada', sf3_desc: 'Injeção automática de links de afiliados, posicionamento inteligente de produtos e CTAs otimizados para conversão.',
    feat_label: 'Funcionalidades',
    feat_title: 'Tudo que você precisa para<br><span class="gradient-text">escalar seu conteúdo.</span>',
    feat_desc: 'Uma plataforma completa de automação de conteúdo — da ideação à monetização.',
    b1_title: 'Motor de Pesquisa com IA',
    b1_desc: 'Todo artigo começa com pesquisa profunda. O BrightTale varre múltiplas fontes, extrai dados-chave, estatísticas e citações, e constrói um briefing completo — garantindo conteúdo preciso e autoritativo, não enrolação genérica de IA.',
    b1_tag: 'Recurso Principal',
    b2_title: 'Links de Afiliados Inteligentes', b2_desc: 'Injeção automática de links de afiliados contextualmente relevantes. Rastreie cliques, gerencie programas, maximize receita por artigo.',
    b3_title: 'Otimização SEO', b3_desc: 'Targeting de keywords nativo, meta tags, schema markup, links internos e pontuação de legibilidade.',
    b4_title: 'Automação Total do Pipeline',
    b4_desc: 'Configure e esqueça. Agende pipelines de conteúdo para rodar diariamente, semanalmente ou personalizado. Acorde com artigos novos, publicados e otimizados no seu WordPress — com links de afiliados já gerando receita.',
    b4_tag: 'Diferencial',
    b5_title: 'Controle de Voz da Marca', b5_desc: 'Defina seu tom, estilo e vocabulário. O BrightTale escreve como você — consistentemente.',
    b6_title: 'Sistema de Templates', b6_desc: 'Templates reutilizáveis para reviews, listicles, tutoriais e comparativos em escala.',
    b7_title: 'Credenciais Criptografadas', b7_desc: 'Credenciais WordPress criptografadas com AES-256-GCM. Seus dados ficam seguros.',
    int_label: 'Integrações',
    int_title: 'Conecta com sua<br><span class="gradient-text">stack atual.</span>',
    int_desc: 'O BrightTale funciona com as ferramentas que você já usa e ama.',
    int_wp: 'Auto-publicação', int_gs: 'Dados de keywords', int_oai: 'Modelos GPT', int_amz: 'Links de afiliados',
    int_an: 'Performance', int_pg: 'Armazenamento', int_vc: 'Deploy', int_any_title: 'Qualquer Afiliado', int_any: 'Programas customizados',
    stat1: 'Artigos publicados', stat2: 'Taxa de automação', stat3: 'Tempo médio por artigo', stat4: 'Mais produção de conteúdo',
    test_label: 'Depoimentos',
    test_title: 'Amado por <span class="gradient-text">criadores.</span>',
    test1_text: '"Eu saí de 2 posts por semana para 2 posts por dia. Meu tráfego orgânico triplicou no primeiro mês. BrightTale é revolucionário."',
    test1_role: 'Criador de Conteúdo, São Paulo',
    test2_text: '"Só a automação de links de afiliados já paga a assinatura 10x. Estou ganhando enquanto durmo. A qualidade da pesquisa me surpreendeu."',
    test2_role: 'Afiliada Digital, Austin',
    test3_text: '"Finalmente, uma ferramenta de IA que não produz conteúdo genérico. A abordagem multi-agente significa que cada artigo tem profundidade e dados reais por trás."',
    test3_role: 'Consultor SEO, Lisboa',
    pr_label: 'Preços',
    pr_title: 'Comece grátis.<br><span class="gradient-text">Escale quando quiser.</span>',
    pr_desc: 'Sem cartão de crédito. Faça upgrade quando seu motor de conteúdo precisar de mais potência.',
    pr_pop_badge: 'Mais Popular',
    pr_starter_desc: 'Para criadores começando', pr_pro_desc: 'Para criadores sérios',
    pr_agency_name: 'Agência', pr_agency_desc: 'Para times e agências',
    pr_s1: '5 artigos por mês', pr_s2: 'Brainstorming básico com IA', pr_s3: '1 site WordPress', pr_s4: 'Templates padrão', pr_s5: 'Suporte da comunidade',
    pr_p1: 'Artigos ilimitados', pr_p2: 'Agente de pesquisa profunda', pr_p3: '5 sites WordPress', pr_p4: 'Automação de links de afiliados', pr_p5: 'Voz da marca personalizada', pr_p6: 'Suporte prioritário',
    pr_a1: 'Tudo do Pro', pr_a2: 'Sites WP ilimitados', pr_a3: 'Colaboração em equipe', pr_a4: 'Prompts de IA customizados', pr_a5: 'Acesso à API', pr_a6: 'Suporte dedicado',
    pr_starter_btn: 'Começar Grátis', pr_pro_btn: 'Iniciar Teste Grátis', pr_agency_btn: 'Falar com Vendas',
    trust1: 'Criptografia AES-256', trust2: '99.9% uptime SLA', trust3: 'Cancele quando quiser', trust4: 'Compatível com LGPD',
    faq_title: 'Perguntas <span class="gradient-text">frequentes.</span>',
    faq_desc: 'Tudo que você precisa saber sobre o BrightTale.',
    faq1_q: 'Como funciona o pipeline de conteúdo?',
    faq1_a: 'O BrightTale usa quatro agentes de IA especializados que trabalham em sequência: o agente de Brainstorm gera ideias de tópicos e alvos de keywords, o agente de Pesquisa coleta dados de múltiplas fontes, o agente de Produção escreve conteúdo otimizado para SEO na voz da sua marca, e o agente de Revisão adiciona links de afiliados, links internos e meta tags. O processo inteiro leva cerca de 4-5 minutos por artigo.',
    faq2_q: 'Meu conteúdo vai parecer escrito por IA?',
    faq2_a: 'Não. Diferente de geradores simples de IA, a arquitetura multi-agente do BrightTale garante que cada artigo passe por etapas de pesquisa, escrita E revisão. O recurso de Voz da Marca aprende seu estilo único — seu tom, vocabulário e preferências de formatação. O resultado parece conteúdo que você mesmo escreveu, respaldado por dados e fontes reais.',
    faq3_q: 'Quais programas de afiliados são suportados?',
    faq3_a: 'O BrightTale suporta Amazon Associates nativamente, além de qualquer programa de afiliados customizado. Você configura seus links e regras, e o agente de otimização os posiciona automaticamente em contextos relevantes no seu conteúdo — maximizando cliques sem parecer spam.',
    faq4_q: 'Posso revisar o conteúdo antes de publicar?',
    faq4_a: 'Com certeza. Você pode configurar seu pipeline para publicar automaticamente ou pausar para sua revisão antes de publicar. Cada artigo tem histórico completo de revisões para que você possa acompanhar mudanças, editar e aprovar no seu ritmo. Você está sempre no controle.',
    faq5_q: 'Meus dados do WordPress estão seguros?',
    faq5_a: 'Sim. Todas as credenciais do WordPress são criptografadas usando AES-256-GCM — o mesmo padrão usado por bancos e governos. Suas senhas nunca são armazenadas em texto puro e não podem ser acessadas por ninguém, incluindo nossa equipe. Levamos segurança a sério.',
    faq6_q: 'Posso cancelar minha assinatura a qualquer momento?',
    faq6_a: 'Sim, sem contratos, sem lock-in. Cancele com um clique no seu painel. Seu conteúdo e dados continuam acessíveis mesmo após o cancelamento. Você também pode fazer downgrade para o plano gratuito Starter a qualquer momento.',
    cta_title: 'Pare de escrever.<br><span class="gradient-text-warm">Comece a publicar.</span>',
    cta_desc: 'Junte-se a 1.200+ criadores que estão escalando seu conteúdo com automação por IA.',
    footer_desc: 'Automação de conteúdo com IA. Da ideia ao post publicado em minutos. Um produto BrightLabs.',
    ft_product: 'Produto', ft_resources: 'Recursos', ft_company: 'Empresa',
    ft_docs: 'Documentação', ft_api: 'Referência da API', ft_status: 'Status do Serviço',
    ft_about: 'Sobre a BrightLabs', ft_contact: 'Contato', ft_privacy: 'Política de Privacidade', ft_terms: 'Termos de Uso',
  },
} as const;

type Lang = keyof typeof translations;
type Dict = (typeof translations)[Lang];

// ─── Terminal lines ───────────────────────────────────────────────────────────

const TERM_LINES = [
  { html: '<span class="t-p">▸ </span><span class="t-cmd">brighttale run --topic "best ergonomic keyboards 2026"</span>', delay: 200 },
  { html: '<span class="t-out">⠋ Agent 1/4: Brainstorming angles...</span>', delay: 800 },
  { html: '<span class="t-ok">✓ </span><span class="t-out">Generated 8 content angles (12 keywords mapped)</span>', delay: 1700 },
  { html: '<span class="t-out">⠋ Agent 2/4: Deep research (14 sources)...</span>', delay: 2200 },
  { html: '<span class="t-ok">✓ </span><span class="t-out">Research brief ready — 3,200 words of source material</span>', delay: 3200 },
  { html: '<span class="t-out">⠋ Agent 3/4: Writing SEO-optimized draft...</span>', delay: 3700 },
  { html: '<span class="t-ok">✓ </span><span class="t-out">Draft complete — 2,847 words, Flesch score 64</span>', delay: 4800 },
  { html: '<span class="t-out">⠋ Agent 4/4: Review + affiliate links...</span>', delay: 5300 },
  { html: '<span class="t-ok">✓ </span><span class="t-out">Added 6 affiliate links, 3 internal links, meta tags</span>', delay: 6100 },
  { html: '<span class="t-out">⠋ Publishing to WordPress...</span>', delay: 6500 },
  { html: '<span class="t-ok">✓ </span><span class="t-acc">Published! </span><span class="t-out">→ yoursite.com/best-ergonomic-keyboards-2026</span>', delay: 7200 },
  { html: '<span class="t-ok">  Pipeline complete in 4m 23s</span><span class="t-cursor"></span>', delay: 7700 },
];

// ─── PPC step types ───────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'active' | 'done';

interface PpcStep {
  label: string;
  detail: string;
  status: StepStatus;
}

const PPC_INITIAL: PpcStep[] = [
  { label: 'Brainstorm', detail: '8 angles · 12 keywords', status: 'idle' },
  { label: 'Research', detail: '14 sources · 3.2k words', status: 'idle' },
  { label: 'Write', detail: '2,847 words · Flesch 64', status: 'idle' },
  { label: 'Optimize', detail: '6 affiliate links added', status: 'idle' },
  { label: 'Publish', detail: 'yoursite.com/article', status: 'idle' },
];

// ─── Pipeline Preview Card ────────────────────────────────────────────────────

function PipelinePreviewCard() {
  const [steps, setSteps] = useState<PpcStep[]>(PPC_INITIAL.map((s) => ({ ...s })));
  const [writeProgress, setWriteProgress] = useState(0);
  const [elapsed, setElapsed] = useState('0s');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runAnimation = useCallback(() => {
    setSteps(PPC_INITIAL.map((s) => ({ ...s })));
    setWriteProgress(0);
    setElapsed('0s');

    const timings = [300, 1200, 2400, 3900, 5200];
    const doneTimes = [1100, 2300, 3800, 5100, 6000];

    timings.forEach((t, i) => {
      setTimeout(() => {
        setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'active' } : s));
        if (i === 2) {
          // animate write progress
          let p = 0;
          const iv = setInterval(() => {
            p += 2;
            setWriteProgress(Math.min(p, 100));
            if (p >= 100) clearInterval(iv);
          }, 28);
        }
      }, t);
      setTimeout(() => {
        setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: 'done' } : s));
      }, doneTimes[i]);
    });

    // elapsed counter
    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      if (secs < 60) setElapsed(`${secs}s`);
      else setElapsed(`${Math.floor(secs / 60)}m ${secs % 60}s`);
      if (secs >= 7) {
        if (timerRef.current) clearInterval(timerRef.current);
        setElapsed('4m 23s');
      }
    }, 1000);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(runAnimation, 600);
    return () => {
      clearTimeout(timeout);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [runAnimation]);

  return (
    <div className="ppc">
      <div className="ppc-header">
        <div className="ppc-title-row">
          <div className="ppc-favicon">
            <svg viewBox="0 0 16 16" fill="none">
              <rect width="16" height="16" rx="3" fill="var(--brand-glow-xl)" />
              <path d="M4 12V4h2l2 4 2-4h2v8h-2V7.5l-2 3.5-2-3.5V12H4z" fill="var(--brand-400)" />
            </svg>
          </div>
          <span className="ppc-topic">best ergonomic keyboards 2026</span>
        </div>
        <span className="ppc-elapsed">{elapsed}</span>
      </div>
      <div className="ppc-steps">
        {steps.map((step, i) => (
          <div key={step.label} className={`ppc-step ppc-step--${step.status}`}>
            <div className="ppc-step-icon">
              {step.status === 'done' ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 8 7 12 13 4" />
                </svg>
              ) : step.status === 'active' ? (
                <span className="ppc-spinner" />
              ) : (
                <span className="ppc-step-num">{i + 1}</span>
              )}
            </div>
            <div className="ppc-step-body">
              <span className="ppc-step-label">{step.label}</span>
              {step.status !== 'idle' && (
                <span className="ppc-step-detail">{step.detail}</span>
              )}
              {step.status === 'active' && i === 2 && (
                <div className="ppc-progress-track">
                  <div className="ppc-progress-bar" style={{ width: `${writeProgress}%` }} />
                </div>
              )}
            </div>
            <div className={`ppc-step-badge ppc-step-badge--${step.status}`}>
              {step.status === 'done' ? 'done' : step.status === 'active' ? 'running' : 'queue'}
            </div>
          </div>
        ))}
      </div>
      <div className="ppc-footer">
        <button className="ppc-replay" onClick={runAnimation} aria-label="Replay animation">
          ↻ replay
        </button>
        <span className="ppc-publish-tag">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12">
            <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z" />
          </svg>
          AI Pipeline
        </span>
      </div>
    </div>
  );
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const StarIcon = () => (
  <svg viewBox="0 0 24 24">
    <polygon points="12,2 15,8.5 22,9.3 17,14 18.2,21 12,17.8 5.8,21 7,14 2,9.3 9,8.5" />
  </svg>
);

// ─── Trusted logo names ───────────────────────────────────────────────────────

const TRUSTED_LOGOS = ['TechBlog Pro', 'ContentScale', 'AffiliateHub', 'NicheForge', 'BlogEmpire', 'SEOCraft'];

// ─── Main component ───────────────────────────────────────────────────────────

export default function Home() {
  const [lang, setLangState] = useState<Lang>('en');
  const [isAnnual, setIsAnnual] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqs, setOpenFaqs] = useState<Set<number>>(new Set([0]));
  const [preloaderHidden, setPreloaderHidden] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [researchVisible, setResearchVisible] = useState(false);
  const termBodyRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);
  const researchRef = useRef<HTMLDivElement>(null);

  const t = useCallback((key: keyof Dict): string => {
    const dict = translations[lang] as Dict;
    return (dict[key] as string) ?? key;
  }, [lang]);

  // Auto-detect language from browser preferences (full ordered list)
  useEffect(() => {
    const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language])
      .find((l) => l?.startsWith('pt') || l?.startsWith('en'));
    if (preferred?.startsWith('pt')) {
      setLangState('pt');
      document.documentElement.lang = 'pt';
    }
  }, []);

  // Preloader
  useEffect(() => {
    const id = setTimeout(() => setPreloaderHidden(true), 400);
    return () => clearTimeout(id);
  }, []);

  // Scroll events + parallax
  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(h > 0 ? (scrollY / h) * 100 : 0);
      setNavScrolled(scrollY > 50);
      setShowScrollTop(scrollY > 600);

      // Parallax orbs — subtle depth shift
      if (orb1Ref.current) orb1Ref.current.style.transform = `translate(-30%, -30%) translateY(${scrollY * 0.12}px)`;
      if (orb2Ref.current) orb2Ref.current.style.transform = `translate(30%, 30%) translateY(${scrollY * -0.08}px)`;
      if (orb3Ref.current) orb3Ref.current.style.transform = `translate(-50%, -50%) translateY(${scrollY * 0.06}px)`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const siblings = entry.target.parentElement?.querySelectorAll('.anim') ?? [];
          const idx = Array.from(siblings).indexOf(entry.target as Element);
          (entry.target as HTMLElement).style.transitionDelay = `${idx * 0.07}s`;
          entry.target.classList.add('vis');
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    document.querySelectorAll('.anim').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Counter animation
  useEffect(() => {
    const cObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          const target = parseInt(el.dataset.count ?? '0');
          const suffix = el.dataset.suffix ?? '';
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / 1800, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.floor(eased * target).toLocaleString() + suffix;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          cObs.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll('[data-count]').forEach((el) => cObs.observe(el));
    return () => cObs.disconnect();
  }, []);

  // Research bars entrance animation
  useEffect(() => {
    const el = researchRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) { setResearchVisible(true); obs.disconnect(); }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Terminal
  const runTerminal = useCallback(() => {
    const body = termBodyRef.current;
    if (!body) return;
    body.innerHTML = '';
    TERM_LINES.forEach(({ html, delay }) => {
      setTimeout(() => {
        if (!termBodyRef.current) return;
        const div = document.createElement('div');
        div.className = 't-line';
        div.innerHTML = html;
        termBodyRef.current.appendChild(div);
        requestAnimationFrame(() => div.classList.add('show'));
        termBodyRef.current.scrollTop = termBodyRef.current.scrollHeight;
      }, delay);
    });
  }, []);

  useEffect(() => {
    const el = termBodyRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) { runTerminal(); obs.disconnect(); }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [runTerminal]);

  const toggleFaq = (i: number) =>
    setOpenFaqs((prev) => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });

  const handleEarlyAccess = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formLoading || formSubmitted) return;
    setFormLoading(true);
    setTimeout(() => {
      setFormLoading(false);
      setFormSubmitted(true);
    }, 1000);
  };

  const changeLang = (l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
  };

  const smoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileMenuOpen(false);
  };

  const pv = (mo: string, an: string) => (isAnnual ? an : mo);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Preloader */}
      <div className={`preloader${preloaderHidden ? ' hidden' : ''}`}>
        <div className="preloader-logo">
          <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="var(--brand-glow-lg)" />
            <path d="M10 26V10h4l4 8 4-8h4v16h-4V17l-4 7-4-7v9h-4z" fill="var(--brand-400)" />
          </svg>
        </div>
      </div>

      {/* Scroll Progress */}
      <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} />

      {/* Scroll to Top */}
      <button
        className={`scroll-top${showScrollTop ? ' show' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>

      {/* Navbar */}
      <nav className={`navbar${navScrolled ? ' scrolled' : ''}`}>
        <div className="container">
          <a href="#" className="logo">
            <div className="logo-icon">
              <svg viewBox="0 0 38 38" fill="none">
                <rect width="38" height="38" rx="10" fill="url(#lgNav)" fillOpacity="0.1" />
                <path d="M9 11c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v18l-5-3H11c-1.1 0-2-.9-2-2V11z" stroke="url(#lgNav)" strokeWidth="1.5" fill="none" />
                <path d="M14 15h10M14 19h7" stroke="url(#lgNav)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="29" cy="9" r="4" fill="var(--brand-400)" opacity="0.8" />
                <path d="M29 7v4M27 9h4" stroke="var(--bg-primary)" strokeWidth="1.2" strokeLinecap="round" />
                <defs>
                  <linearGradient id="lgNav" x1="0" y1="0" x2="38" y2="38">
                    <stop stopColor="var(--brand-300)" /><stop offset="1" stopColor="var(--brand-400)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="logo-text">Bright<span>Tale</span></span>
          </a>

          <ul className={`nav-links${mobileMenuOpen ? ' open' : ''}`}>
            <li><a href="#how-it-works" onClick={(e) => smoothScroll(e, '#how-it-works')}>{t('nav_how')}</a></li>
            <li><a href="#features" onClick={(e) => smoothScroll(e, '#features')}>{t('nav_features')}</a></li>
            <li><a href="#pricing" onClick={(e) => smoothScroll(e, '#pricing')}>{t('nav_pricing')}</a></li>
            <li><a href="#faq" onClick={(e) => smoothScroll(e, '#faq')}>FAQ</a></li>
            <li>
              <div className="lang-switch">
                <button className={`lang-btn${lang === 'en' ? ' active' : ''}`} onClick={() => changeLang('en')} aria-label="English">EN</button>
                <button className={`lang-btn${lang === 'pt' ? ' active' : ''}`} onClick={() => changeLang('pt')} aria-label="Português">PT</button>
              </div>
            </li>
            <li><a href="https://app.brighttale.io" className="nav-cta">{t('nav_cta')}</a></li>
          </ul>

          {/* Task 5: Hamburger → X animated toggle */}
          <button
            className={`mobile-toggle${mobileMenuOpen ? ' open' : ''}`}
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
          >
            <span className="ham-bar ham-bar-1" />
            <span className="ham-bar ham-bar-2" />
            <span className="ham-bar ham-bar-3" />
          </button>
        </div>
      </nav>

      <main id="main">
        {/* ── Hero ── */}
        <section className="hero">
          <div className="hero-grid" />
          <div className="ambient-orb orb-1" ref={orb1Ref} />
          <div className="ambient-orb orb-2" ref={orb2Ref} />
          <div className="container">
            {/* Task 2: Split layout */}
            <div className="hero-split">
              <div className="hero-text">
                <div className="hero-badge">
                  <span className="hero-badge-dot" />
                  {t('hero_badge')}
                </div>
                <h1 dangerouslySetInnerHTML={{ __html: t('hero_title') }} />
                <p className="hero-sub">{t('hero_sub')}</p>

                {/* Task 3: React-controlled form state */}
                {formSubmitted ? (
                  <div className="hero-form-success">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>You&apos;re on the list! We&apos;ll be in touch soon.</span>
                  </div>
                ) : (
                  <form className={`hero-form${formLoading ? ' loading' : ''}`} onSubmit={handleEarlyAccess}>
                    <input type="email" placeholder={t('hero_email_placeholder')} required aria-label="Email address" disabled={formLoading} />
                    <button type="submit" disabled={formLoading}>
                      {formLoading ? <span className="form-spinner" /> : t('hero_cta')}
                    </button>
                  </form>
                )}

                <p className="hero-note">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>{' '}
                  <span dangerouslySetInnerHTML={{ __html: t('hero_note') }} />
                </p>

                <div className="hero-metrics">
                  <div className="hero-metric">
                    <strong className="gradient-text" data-count="5" data-suffix=" min" suppressHydrationWarning>0 min</strong>
                    <span>{t('metric_time')}</span>
                  </div>
                  <div className="hero-metric">
                    <strong className="gradient-text" data-count="4" data-suffix=" AI Agents" suppressHydrationWarning>0 AI Agents</strong>
                    <span>{t('metric_agents')}</span>
                  </div>
                  <div className="hero-metric">
                    <strong className="gradient-text" data-count="100" data-suffix="%" suppressHydrationWarning>0%</strong>
                    <span>{t('metric_auto')}</span>
                  </div>
                  <div className="hero-metric">
                    <strong className="gradient-text">1-click</strong>
                    <span>{t('metric_publish')}</span>
                  </div>
                </div>
              </div>

              {/* Task 2: Preview card on right side */}
              <div className="hero-preview-wrap">
                <PipelinePreviewCard />
              </div>
            </div>
          </div>
        </section>

        {/* ── Trusted By ── */}
        {/* Task 4: Marquee scrolling logos */}
        <section className="trusted">
          <div className="container">
            <div className="trusted-inner">
              <p className="trusted-label">{t('trusted_label')}</p>
              <div className="marquee-wrap">
                <div className="marquee-track">
                  {[...TRUSTED_LOGOS, ...TRUSTED_LOGOS].map((name, i) => (
                    <span key={`${name}-${i}`} className="trusted-logo">{name}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pipeline ── */}
        <section className="pipeline" id="how-it-works">
          <div className="container">
            <div className="pipeline-header anim">
              <span className="section-label">{t('pipe_label')}</span>
              <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('pipe_title') }} />
              <p className="section-desc">{t('pipe_desc')}</p>
            </div>
            <div className="pipeline-steps">
              {/* Step 1 */}
              <div className="pipeline-step anim">
                <span className="step-number">01</span>
                <div className="step-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <h3>{t('step1_title')}</h3>
                <p>{t('step1_desc')}</p>
                <span className="step-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </span>
              </div>
              {/* Step 2 */}
              <div className="pipeline-step anim">
                <span className="step-number">02</span>
                <div className="step-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
                  </svg>
                </div>
                <h3>{t('step2_title')}</h3>
                <p>{t('step2_desc')}</p>
                <span className="step-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </span>
              </div>
              {/* Step 3 */}
              <div className="pipeline-step anim">
                <span className="step-number">03</span>
                <div className="step-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <h3>{t('step3_title')}</h3>
                <p>{t('step3_desc')}</p>
                <span className="step-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </span>
              </div>
              {/* Step 4 */}
              <div className="pipeline-step anim">
                <span className="step-number">04</span>
                <div className="step-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <h3>{t('step4_title')}</h3>
                <p>{t('step4_desc')}</p>
                <span className="step-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </span>
              </div>
              {/* Step 5 */}
              <div className="pipeline-step anim">
                <span className="step-number">05</span>
                <div className="step-icon-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                  </svg>
                </div>
                <h3>{t('step5_title')}</h3>
                <p>{t('step5_desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Showcase ── */}
        <section className="showcase">
          <div className="ambient-orb orb-3" ref={orb3Ref} />
          <div className="container">
            <div className="showcase-grid">
              <div className="showcase-content anim">
                <span className="section-label">{t('show_label')}</span>
                <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('show_title') }} />
                <p className="section-desc">{t('show_desc')}</p>
                <div className="showcase-features">
                  <div className="showcase-feature">
                    <div className="sf-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                      </svg>
                    </div>
                    <div><h4>{t('sf1_title')}</h4><p>{t('sf1_desc')}</p></div>
                  </div>
                  <div className="showcase-feature">
                    <div className="sf-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                      </svg>
                    </div>
                    <div><h4>{t('sf2_title')}</h4><p>{t('sf2_desc')}</p></div>
                  </div>
                  <div className="showcase-feature">
                    <div className="sf-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                      </svg>
                    </div>
                    <div><h4>{t('sf3_title')}</h4><p>{t('sf3_desc')}</p></div>
                  </div>
                </div>
              </div>

              <div className="showcase-visual anim">
                <div className="terminal">
                  <div className="terminal-bar">
                    <span className="t-dot r" /><span className="t-dot y" /><span className="t-dot g" />
                    <span className="terminal-title">brighttale pipeline</span>
                    <button className="terminal-replay" onClick={runTerminal} aria-label="Replay">↻ replay</button>
                  </div>
                  <div className="terminal-body" ref={termBodyRef} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features Bento ── */}
        <section className="features" id="features">
          <div className="container">
            <div className="features-header anim">
              <span className="section-label">{t('feat_label')}</span>
              <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('feat_title') }} />
              <p className="section-desc">{t('feat_desc')}</p>
            </div>
            <div className="bento">
              {/* Research card with animated source bars */}
              <div className="b-card span-8 anim" ref={researchRef}>
                <div className="b-card-inner">
                  <div className="b-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                    </svg>
                  </div>
                  <h3>{t('b1_title')}</h3>
                  <p>{t('b1_desc')}</p>
                  <span className="b-tag">{t('b1_tag')}</span>
                </div>
                <div className="research-sources">
                  <div className="rs-header">
                    <span className="rs-title">Sources scanned</span>
                    <span className="rs-count-total">14 sources</span>
                  </div>
                  {[
                    { label: 'Wikipedia', pct: 92 },
                    { label: 'Reddit', pct: 78 },
                    { label: 'PubMed', pct: 65 },
                    { label: 'Wirecutter', pct: 88 },
                  ].map(({ label, pct }, i) => (
                    <div key={label} className="rs-item">
                      <span className="rs-label">{label}</span>
                      <div className="rs-track">
                        <div
                          className="rs-bar"
                          style={{
                            width: researchVisible ? `${pct}%` : '0%',
                            transitionDelay: `${i * 0.12}s`,
                          }}
                        />
                      </div>
                      <span className="rs-pct">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="b-card span-4 anim">
                <div className="b-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <h3>{t('b2_title')}</h3>
                <p>{t('b2_desc')}</p>
              </div>
              <div className="b-card span-4 anim">
                <div className="b-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                  </svg>
                </div>
                <h3>{t('b3_title')}</h3>
                <p>{t('b3_desc')}</p>
              </div>
              {/* Pipeline automation card with schedule grid */}
              <div className="b-card span-8 anim">
                <div className="b-card-inner">
                  <div className="b-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <h3>{t('b4_title')}</h3>
                  <p>{t('b4_desc')}</p>
                  <span className="b-tag">{t('b4_tag')}</span>
                </div>
                <div className="schedule-grid">
                  {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day, di) => {
                    // today = Wed (di=2), publishing slot = Wed slot 1
                    const isToday = di === 2;
                    return (
                      <div key={day} className="sg-col">
                        <span className={`sg-day${isToday ? ' sg-day--today' : ''}`}>{day}</span>
                        {[0, 1, 2].map((slot) => {
                          const isNow = isToday && slot === 1;
                          const isDone = di < 2 || (di === 2 && slot === 0);
                          return (
                            <div
                              key={slot}
                              className={`sg-slot${isDone ? ' sg-slot--done' : isNow ? ' sg-slot--now' : di < 6 ? ' sg-slot--active' : ''}`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="b-card span-4 anim">
                <div className="b-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M12 2a3 3 0 00-3 3v4a3 3 0 006 0V5a3 3 0 00-3-3zM19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" />
                  </svg>
                </div>
                <h3>{t('b5_title')}</h3>
                <p>{t('b5_desc')}</p>
              </div>
              <div className="b-card span-4 anim">
                <div className="b-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
                <h3>{t('b6_title')}</h3>
                <p>{t('b6_desc')}</p>
              </div>
              <div className="b-card span-4 anim">
                <div className="b-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
                <h3>{t('b7_title')}</h3>
                <p>{t('b7_desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Integrations ── */}
        <section className="integrations" id="integrations">
          <div className="container">
            <div className="int-header anim">
              <span className="section-label">{t('int_label')}</span>
              <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('int_title') }} />
              <p className="section-desc">{t('int_desc')}</p>
            </div>
            <div className="int-grid">
              {[
                {
                  name: 'WordPress', sub: t('int_wp'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 7V4a2 2 0 012-2h8.5L20 7.5V20a2 2 0 01-2 2H6a2 2 0 01-2-2v-3" /><polyline points="14 2 14 8 20 8" /><path d="M2 15h10M9 12l3 3-3 3" /></svg>,
                },
                {
                  name: 'Google Search', sub: t('int_gs'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>,
                },
                {
                  name: 'OpenAI', sub: t('int_oai'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4M7 10h4M13 8v4" /></svg>,
                },
                {
                  name: 'Amazon', sub: t('int_amz'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" /></svg>,
                },
                {
                  name: 'Analytics', sub: t('int_an'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>,
                },
                {
                  name: 'PostgreSQL', sub: t('int_pg'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
                },
                {
                  name: 'Vercel', sub: t('int_vc'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
                },
                {
                  name: t('int_any_title'), sub: t('int_any'),
                  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
                },
              ].map(({ name, sub, icon }) => (
                <div key={name} className="int-card anim">
                  <div className="int-icon">{icon}</div>
                  <h4>{name}</h4>
                  <span>{sub}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Social Proof ── */}
        <section className="proof">
          <div className="container">
            <div className="stats-row">
              {[
                { count: '2400', suffix: '+', label: t('stat1') },
                { count: '98', suffix: '%', label: t('stat2') },
                { count: '4', suffix: '.2 min', label: t('stat3') },
                { count: '3', suffix: '.8x', label: t('stat4') },
              ].map(({ count, suffix, label }) => (
                <div key={label} className="stat anim">
                  <div className="stat-num gradient-text" data-count={count} data-suffix={suffix} suppressHydrationWarning>0</div>
                  <div className="stat-lbl">{label}</div>
                </div>
              ))}
            </div>

            <div className="test-header anim">
              <span className="section-label">{t('test_label')}</span>
              <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('test_title') }} />
            </div>
            <div className="test-grid">
              {[
                { letter: 'R', text: t('test1_text'), name: 'Rafael M.', role: t('test1_role') },
                { letter: 'S', text: t('test2_text'), name: 'Sarah K.', role: t('test2_role') },
                { letter: 'D', text: t('test3_text'), name: 'Daniel F.', role: t('test3_role') },
              ].map(({ letter, text, name, role }) => (
                <div key={name} className="test-card anim">
                  <div className="test-stars">{Array.from({ length: 5 }).map((_, i) => <StarIcon key={i} />)}</div>
                  <p className="test-text">{text}</p>
                  <div className="test-author">
                    <div className="test-avatar">{letter}</div>
                    <div><div className="test-name">{name}</div><div className="test-role">{role}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="pricing" id="pricing">
          <div className="container">
            <div className="pr-header anim">
              <span className="section-label">{t('pr_label')}</span>
              <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('pr_title') }} />
              <p className="section-desc">{t('pr_desc')}</p>
            </div>
            <div className="pr-toggle anim">
              <span className={isAnnual ? '' : 'active'}>Monthly</span>
              <div
                className={`pr-toggle-switch${isAnnual ? ' annual' : ''}`}
                onClick={() => setIsAnnual((v) => !v)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsAnnual((v) => !v); } }}
                role="switch"
                aria-checked={isAnnual}
                aria-label="Toggle annual pricing"
                tabIndex={0}
              />
              <span className={isAnnual ? 'active' : ''}>Annual <span className="pr-save">Save 20%</span></span>
            </div>
            <div className="pr-grid">
              {/* Starter */}
              <div className="pr-card anim">
                <div className="pr-name">Starter</div>
                <div className="pr-desc">{t('pr_starter_desc')}</div>
                <div className="pr-price">
                  <span className="pr-cur">$</span>
                  <span className="pr-val">{pv('0', '0')}</span>
                  <span className="pr-per">{isAnnual ? '/month, billed annually' : '/month'}</span>
                </div>
                <ul className="pr-feats">
                  {[t('pr_s1'), t('pr_s2'), t('pr_s3'), t('pr_s4'), t('pr_s5')].map((f) => (
                    <li key={f}><CheckIcon /><span>{f}</span></li>
                  ))}
                </ul>
                <a href="https://app.brighttale.io" className="pr-btn ghost">{t('pr_starter_btn')}</a>
              </div>
              {/* Pro */}
              <div className="pr-card pop anim">
                <span className="pr-badge">{t('pr_pop_badge')}</span>
                <div className="pr-name">Pro</div>
                <div className="pr-desc">{t('pr_pro_desc')}</div>
                <div className="pr-price">
                  <span className="pr-cur">$</span>
                  <span className="pr-val">{pv('29', '23')}</span>
                  <span className="pr-per">{isAnnual ? '/month, billed annually' : '/month'}</span>
                </div>
                <ul className="pr-feats">
                  {[t('pr_p1'), t('pr_p2'), t('pr_p3'), t('pr_p4'), t('pr_p5'), t('pr_p6')].map((f) => (
                    <li key={f}><CheckIcon /><span>{f}</span></li>
                  ))}
                </ul>
                <a href="https://app.brighttale.io" className="pr-btn primary">{t('pr_pro_btn')}</a>
              </div>
              {/* Agency */}
              <div className="pr-card anim">
                <div className="pr-name">{t('pr_agency_name')}</div>
                <div className="pr-desc">{t('pr_agency_desc')}</div>
                <div className="pr-price">
                  <span className="pr-cur">$</span>
                  <span className="pr-val">{pv('99', '79')}</span>
                  <span className="pr-per">{isAnnual ? '/month, billed annually' : '/month'}</span>
                </div>
                <ul className="pr-feats">
                  {[t('pr_a1'), t('pr_a2'), t('pr_a3'), t('pr_a4'), t('pr_a5'), t('pr_a6')].map((f) => (
                    <li key={f}><CheckIcon /><span>{f}</span></li>
                  ))}
                </ul>
                <a href="https://app.brighttale.io" className="pr-btn ghost">{t('pr_agency_btn')}</a>
              </div>
            </div>
            <div className="trust-row anim">
              {[
                { key: 'trust1', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
                { key: 'trust2', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
                { key: 'trust3', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg> },
                { key: 'trust4', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg> },
              ].map(({ key, icon }) => (
                <div key={key} className="trust-badge">{icon}<span>{t(key as keyof Dict)}</span></div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="faq" id="faq">
          <div className="container">
            <div className="faq-header anim">
              <span className="section-label">FAQ</span>
              <h2 className="section-title" dangerouslySetInnerHTML={{ __html: t('faq_title') }} />
              <p className="section-desc">{t('faq_desc')}</p>
            </div>
            <div className="faq-list">
              {([1, 2, 3, 4, 5, 6] as const).map((n, i) => {
                const qKey = `faq${n}_q` as keyof Dict;
                const aKey = `faq${n}_a` as keyof Dict;
                const isOpen = openFaqs.has(i);
                return (
                  <div key={n} className={`faq-item anim${isOpen ? ' open' : ''}`}>
                    <button className="faq-q" aria-expanded={isOpen} onClick={() => toggleFaq(i)}>
                      <span>{t(qKey)}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <div className="faq-a">
                      <div className="faq-a-inner">{t(aKey)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="final-cta">
          <div className="orb-cta" />
          <div className="container anim">
            <h2 dangerouslySetInnerHTML={{ __html: t('cta_title') }} />
            <p>{t('cta_desc')}</p>
            {formSubmitted ? (
              <div className="hero-form-success" style={{ margin: '0 auto 20px', maxWidth: '480px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>You&apos;re on the list! We&apos;ll be in touch soon.</span>
              </div>
            ) : (
              <form
                className={`hero-form${formLoading ? ' loading' : ''}`}
                style={{ margin: '0 auto 20px', maxWidth: '480px' }}
                onSubmit={handleEarlyAccess}
              >
                <input type="email" placeholder={t('hero_email_placeholder')} required aria-label="Email address" disabled={formLoading} />
                <button type="submit" disabled={formLoading}>
                  {formLoading ? <span className="form-spinner" /> : t('hero_cta')}
                </button>
              </form>
            )}
            <p className="hero-note" style={{ animation: 'none', opacity: 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>{' '}
              Free forever plan. No credit card required.
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <a href="#" className="logo">
                <div className="logo-icon">
                  <svg viewBox="0 0 38 38" fill="none">
                    <rect width="38" height="38" rx="10" fill="var(--brand-glow-lg)" />
                    <path d="M9 11c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v18l-5-3H11c-1.1 0-2-.9-2-2V11z" stroke="var(--brand-400)" strokeWidth="1.5" fill="none" />
                    <path d="M14 15h10M14 19h7" stroke="var(--brand-400)" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="29" cy="9" r="4" fill="var(--brand-400)" opacity="0.8" />
                    <path d="M29 7v4M27 9h4" stroke="var(--bg-primary)" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="logo-text">Bright<span>Tale</span></span>
              </a>
              <p>{t('footer_desc')}</p>
            </div>
            <div className="footer-col">
              <h5>{t('ft_product')}</h5>
              <a href="#features" onClick={(e) => smoothScroll(e, '#features')}>{t('nav_features')}</a>
              <a href="#pricing" onClick={(e) => smoothScroll(e, '#pricing')}>{t('nav_pricing')}</a>
              <a href="#how-it-works" onClick={(e) => smoothScroll(e, '#how-it-works')}>{t('nav_how')}</a>
              <a href="#integrations" onClick={(e) => smoothScroll(e, '#integrations')}>{t('int_label')}</a>
              <a href="#">Changelog</a>
            </div>
            <div className="footer-col">
              <h5>{t('ft_resources')}</h5>
              <a href="#">{t('ft_docs')}</a>
              <a href="#">Blog</a>
              <a href="#">{t('ft_api')}</a>
              <a href="#">{t('ft_status')}</a>
            </div>
            <div className="footer-col">
              <h5>{t('ft_company')}</h5>
              <a href="#">{t('ft_about')}</a>
              <a href="#">{t('ft_contact')}</a>
              <a href="#">{t('ft_privacy')}</a>
              <a href="#">{t('ft_terms')}</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>&copy; 2026 BrightTale — A <a href="#">BrightLabs</a> product.</span>
            <div className="f-socials">
              <a href="#" aria-label="X / Twitter">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="#" aria-label="GitHub">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </a>
              <a href="#" aria-label="YouTube">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
