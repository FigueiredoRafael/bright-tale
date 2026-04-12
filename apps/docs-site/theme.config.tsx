export default {
  logo: <strong>BrightTale Docs</strong>,
  project: {
    link: 'https://github.com/bright-labs/bright-tale',
  },
  docsRepositoryBase: 'https://github.com/bright-labs/bright-tale/tree/main/apps/docs-site',
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
  footer: {
    content: `© ${new Date().getFullYear()} BrightTale — AI-Powered Content Creation`,
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="BrightTale Documentation — AI content generation platform" />
    </>
  ),
  search: {
    placeholder: 'Buscar na documentação...',
  },
  editLink: {
    content: 'Editar esta página no GitHub →',
  },
  feedback: {
    content: 'Dúvidas? Abra uma issue →',
  },
}
