import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: {
    default: 'BrightTale Docs',
    template: '%s — BrightTale Docs',
  },
  description: 'BrightTale — AI-Powered Content Creation Platform',
}

const navbar = (
  <Navbar
    logo={<strong>BrightTale Docs</strong>}
    projectLink="https://github.com/bright-labs/bright-tale"
  />
)

const footer = <Footer>© {new Date().getFullYear()} BrightTale — AI-Powered Content Creation</Footer>

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1, toggleButton: true }}
          toc={{ backToTop: true }}
          editLink="Editar esta página no GitHub →"
          docsRepositoryBase="https://github.com/bright-labs/bright-tale/tree/main/apps/docs-site"
          pageMap={await getPageMap()}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
