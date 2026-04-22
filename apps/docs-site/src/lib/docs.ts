import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content')

export interface DocPage {
  slug: string[]
  title: string
  content: string
  frontmatter: Record<string, unknown>
  format: 'md' | 'mdx'
}

export interface TocItem {
  id: string
  text: string
  level: number
}

function findFile(slugPath: string): string | null {
  const extensions = ['.mdx', '.md']

  // Try direct file match: /product/values -> product/values.md(x)
  for (const ext of extensions) {
    const filePath = path.join(CONTENT_DIR, slugPath + ext)
    if (fs.existsSync(filePath)) return filePath
  }

  // Try index file: /product -> product/index.md(x)
  for (const ext of extensions) {
    const filePath = path.join(CONTENT_DIR, slugPath, 'index' + ext)
    if (fs.existsSync(filePath)) return filePath
  }

  return null
}

export function getDocBySlug(slug: string[]): DocPage | null {
  const slugPath = slug.length === 0 ? 'index' : slug.join('/')
  const filePath = findFile(slugPath)

  if (!filePath) return null

  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(fileContent)

  // Extract title from frontmatter or first H1
  let title = data.title as string | undefined
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m)
    if (h1Match) title = h1Match[1]
  }

  const format = filePath.endsWith('.mdx') ? 'mdx' : 'md'

  return {
    slug,
    title: title ?? slug[slug.length - 1] ?? 'BrightTale Docs',
    content,
    frontmatter: data,
    format,
  }
}

export function extractToc(content: string): TocItem[] {
  const headingRegex = /^(#{2,4})\s+(.+)$/gm
  const items: TocItem[] = []
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const text = match[2]
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    items.push({ id, text, level })
  }

  return items
}

export function getAllSlugs(): string[][] {
  const slugs: string[][] = []

  function walk(dir: string, prefix: string[]) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue

      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...prefix, entry.name])
      } else if (entry.name.match(/\.(md|mdx)$/)) {
        const name = entry.name.replace(/\.(md|mdx)$/, '')
        if (name === 'index') {
          slugs.push(prefix.length === 0 ? [] : prefix)
        } else {
          slugs.push([...prefix, name])
        }
      }
    }
  }

  walk(CONTENT_DIR, [])
  return slugs
}
