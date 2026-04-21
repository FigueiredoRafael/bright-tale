export interface NavItem {
  title: string
  href?: string
  children?: NavItem[]
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    items: [
      { title: 'Inicio', href: '/' },
      {
        title: 'Produto',
        href: '/product',
        children: [
          { title: 'Visao Geral', href: '/product' },
          { title: 'Tipos de Conteudo', href: '/product/content-types' },
          { title: 'Publico-Alvo', href: '/product/target-users' },
          { title: 'Plano de Negocio', href: '/product/business-plan' },
          { title: 'Valores & Missao', href: '/product/values' },
        ],
      },
      {
        title: 'Agentes IA',
        href: '/agents',
        children: [
          { title: 'Pipeline Overview', href: '/agents' },
          { title: 'Agent 1 — Brainstorm', href: '/agents/brainstorm' },
          { title: 'Agent 2 — Research', href: '/agents/research' },
          { title: 'Agent 3 — Production', href: '/agents/production' },
          { title: 'Canonical Core', href: '/agents/canonical-core' },
          { title: 'Agent 4 — Review', href: '/agents/review' },
        ],
      },
    ],
  },
  {
    title: 'Referencia Tecnica',
    items: [
      {
        title: 'Arquitetura',
        href: '/architecture',
        children: [
          { title: 'Visao Geral', href: '/architecture' },
          { title: 'Pipeline assincrono', href: '/architecture/pipeline' },
          { title: 'Providers de IA', href: '/architecture/ai-providers' },
          { title: 'Seguranca', href: '/architecture/security' },
        ],
      },
      {
        title: 'API Reference',
        href: '/api-reference',
        children: [
          { title: 'Visao Geral', href: '/api-reference' },
          { title: 'Brainstorm (async)', href: '/api-reference/brainstorm' },
          { title: 'Research Sessions', href: '/api-reference/research-sessions' },
          { title: 'Content Drafts', href: '/api-reference/content-drafts' },
          { title: 'Bulk Generation', href: '/api-reference/bulk' },
          { title: 'Canonical Core', href: '/api-reference/canonical-core' },
          { title: 'Ideas Library', href: '/api-reference/ideas' },
          { title: 'Billing (Stripe)', href: '/api-reference/billing' },
          { title: 'Usage Analytics', href: '/api-reference/usage' },
          { title: 'AI Config', href: '/api-reference/ai' },
          { title: 'WordPress', href: '/api-reference/wordpress' },
          { title: 'Projects', href: '/api-reference/projects' },
          { title: 'Research Archives', href: '/api-reference/research' },
          { title: 'Stages', href: '/api-reference/stages' },
          { title: 'Blogs', href: '/api-reference/blogs' },
          { title: 'Videos', href: '/api-reference/videos' },
          { title: 'Podcasts', href: '/api-reference/podcasts' },
          { title: 'Shorts', href: '/api-reference/shorts' },
          { title: 'Templates', href: '/api-reference/templates' },
          { title: 'Assets', href: '/api-reference/assets' },
          { title: 'Users (Admin)', href: '/api-reference/users' },
        ],
      },
      {
        title: 'Database',
        href: '/database',
        children: [
          { title: 'Visao Geral', href: '/database' },
          { title: 'Schema Completo', href: '/database/schema' },
        ],
      },
      {
        title: 'Features',
        href: '/features',
        children: [
          { title: 'Visao Geral', href: '/features' },
          { title: 'Create Content', href: '/features/create-content' },
          { title: 'Ideias', href: '/features/ideas' },
          { title: 'Pesquisa', href: '/features/research' },
          { title: 'Blogs', href: '/features/blogs' },
          { title: 'Videos', href: '/features/videos' },
          { title: 'Shorts', href: '/features/shorts' },
          { title: 'Podcasts', href: '/features/podcasts' },
          { title: 'Image Bank', href: '/features/image-bank' },
          { title: 'WordPress', href: '/features/wordpress' },
          { title: 'Plano & creditos', href: '/features/billing' },
          { title: 'Uso & custo', href: '/features/usage' },
          { title: 'Settings', href: '/features/settings' },
          { title: 'Projetos (v1)', href: '/features/projects' },
          { title: 'Templates', href: '/features/templates' },
        ],
      },
    ],
  },
  {
    title: 'Guias & Roadmap',
    items: [
      {
        title: 'Guias',
        href: '/guides',
        children: [
          { title: 'Getting Started', href: '/guides/getting-started' },
          { title: 'Desenvolvimento', href: '/guides/development' },
          { title: 'Deploy', href: '/guides/deployment' },
          { title: 'Testes', href: '/guides/testing' },
        ],
      },
      {
        title: 'Roadmap',
        href: '/roadmap',
        children: [
          { title: 'Status Atual', href: '/roadmap' },
          { title: 'Sistema de Tokens', href: '/roadmap/token-system' },
          { title: 'Planos & Pricing', href: '/roadmap/pricing' },
          { title: 'Projecoes Financeiras', href: '/roadmap/pricing-projections' },
          { title: 'Afiliados', href: '/roadmap/affiliates' },
          { title: 'Pagamentos', href: '/roadmap/payments' },
        ],
      },
    ],
  },
  {
    title: 'Desenvolvimento',
    items: [
      {
        title: 'Milestones',
        href: '/milestones',
        children: [
          { title: 'Visao Geral', href: '/milestones' },
          { title: 'v0.2 — Launch', href: '/milestones/0.2' },
          {
            title: 'v0.1 — Fundacao',
            href: '/milestones/0.1',
            children: [
              { title: 'Visao Geral', href: '/milestones/0.1' },
              { title: 'Fase 1 — Fundacao', href: '/milestones/0.1/phase-1-foundation' },
              { title: 'Fase 2 — Core', href: '/milestones/0.1/phase-2-core' },
              { title: 'Fase 3 — Monetizacao', href: '/milestones/0.1/phase-3-monetization' },
              { title: 'Fase 4 — Midia', href: '/milestones/0.1/phase-4-media' },
              { title: 'Fase 5 — Publicacao', href: '/milestones/0.1/phase-5-publishing' },
              { title: 'Fase 6 — Polish', href: '/milestones/0.1/phase-6-polish' },
              { title: 'Fase 7 — Finalizacao', href: '/milestones/0.1/phase-7-finalization' },
            ],
          },
        ],
      },
    ],
  },
]
