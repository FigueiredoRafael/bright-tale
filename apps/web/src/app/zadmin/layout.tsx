import type { Metadata, Viewport } from 'next'

/**
 * Admin area layout — forces non-indexability at the metadata level.
 *
 * Defence in depth with three layers against accidental indexing:
 *   1. robots.txt (apps/web/public/robots.txt)  — advisory, obeyed by
 *      Google, Bing, most crawlers.
 *   2. X-Robots-Tag header (apps/web/next.config.ts → headers())  —
 *      enforced by crawlers that respect HTTP headers; can't be
 *      bypassed even if robots.txt isn't fetched.
 *   3. <meta name="robots"> via this layout  — last-resort backstop for
 *      the admin HTML body.
 *
 * Root layout sets `robots: 'index, follow'` for the landing. This layout
 * overrides it for the whole /zadmin tree (and therefore every public
 * admin path via the slug rewrite).
 */
export const metadata: Metadata = {
  title: 'Admin',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-snippet': -1,
      'max-image-preview': 'none',
      'max-video-preview': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
