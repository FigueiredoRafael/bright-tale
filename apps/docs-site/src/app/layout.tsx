import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Navbar } from '@/src/components/navbar'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'BrightTale Docs',
    template: '%s — BrightTale Docs',
  },
  description: 'BrightTale — AI-Powered Content Creation Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
