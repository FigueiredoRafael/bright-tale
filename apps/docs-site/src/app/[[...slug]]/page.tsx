import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
import { getDocBySlug, getAllSlugs, extractToc } from '@/src/lib/docs'
import { Sidebar } from '@/src/components/sidebar'
import { TableOfContents } from '@/src/components/toc'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ slug?: string[] }>
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug: slug.length === 0 ? undefined : slug }))
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params
  const slug = params.slug ?? []
  const doc = getDocBySlug(slug)
  if (!doc) return { title: 'Not Found' }
  return { title: doc.title }
}

export default async function DocPage(props: PageProps) {
  const params = await props.params
  const slug = params.slug ?? []
  const doc = getDocBySlug(slug)

  if (!doc) notFound()

  const toc = extractToc(doc.content)

  return (
    <div className="mx-auto flex max-w-screen-2xl">
      <Sidebar />
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-12">
        <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0">
          <MDXRemote
            source={doc.content}
            options={{
              mdxOptions: {
                format: doc.format,
                remarkPlugins: [remarkGfm],
                rehypePlugins: [
                  rehypeSlug,
                  [rehypeAutolinkHeadings, { behavior: 'wrap' }],
                  [rehypePrettyCode, { theme: 'github-dark-default', keepBackground: true, defaultLang: 'plaintext' }],
                ],
              },
            }}
          />
        </article>
      </main>
      <TableOfContents items={toc} />
    </div>
  )
}
