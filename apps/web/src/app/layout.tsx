import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import { PostHogProvider } from '@/components/providers/posthog-provider';
import { WebVitals } from '@/lib/axiom/client';
import './globals.css';

const fontDisplay = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const fontBody = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
  display: 'swap',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BrightTale — Your AI Content Engine',
  description:
    'BrightTale — AI-powered content automation. From idea to published blog post in minutes, not days. Brainstorm, research, write, optimize, and publish automatically.',
  keywords:
    'AI content automation, blog automation, AI writing, content pipeline, WordPress automation, affiliate content',
  authors: [{ name: 'BrightLabs' }],
  // Landing page remains indexable. Admin and API routes are made
  // explicitly non-indexable via per-path metadata + headers (see
  // next.config.ts headers() + apps/web/src/app/zadmin/layout.tsx
  // metadata override).
  robots: 'index, follow',
  openGraph: {
    title: 'BrightTale — Your AI Content Engine',
    description:
      'From idea to published blog post in minutes. AI-powered brainstorming, research, writing, and publishing.',
    type: 'website',
    url: 'https://brighttale.io',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* FOUC-prevention: set dark/light class before React hydrates.
            Reads localStorage, falls back to system preference.
            html has suppressHydrationWarning because this script mutates
            className before hydration — expected divergence. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bt-admin-theme');var d=t==='dark'||(t==null&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}>
        <WebVitals />
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
