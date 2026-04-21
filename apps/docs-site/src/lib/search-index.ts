import { getAllSlugs, getDocBySlug } from './docs'

export interface SearchEntry {
  title: string
  href: string
  section: string
  excerpt: string
}

function getSection(slug: string[]): string {
  const sectionMap: Record<string, string> = {
    product: 'Produto',
    agents: 'Agentes IA',
    architecture: 'Arquitetura',
    'api-reference': 'API Reference',
    database: 'Database',
    features: 'Features',
    guides: 'Guias',
    roadmap: 'Roadmap',
    milestones: 'Milestones',
  }
  return sectionMap[slug[0]] ?? 'Geral'
}

function makeExcerpt(content: string, maxLen = 120): string {
  const cleaned = content
    .replace(/^#+ .+$/gm, '')
    .replace(/\|.+\|/g, '')
    .replace(/[*_`~\[\]()>#-]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...' : cleaned
}

export function buildSearchIndex(): SearchEntry[] {
  const slugs = getAllSlugs()
  const entries: SearchEntry[] = []

  for (const slug of slugs) {
    const doc = getDocBySlug(slug)
    if (!doc) continue

    entries.push({
      title: doc.title,
      href: '/' + slug.join('/'),
      section: slug.length === 0 ? 'Geral' : getSection(slug),
      excerpt: makeExcerpt(doc.content),
    })
  }

  return entries
}
