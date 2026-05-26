'use client'

import { createAdminLayout } from '@tn-figueiredo/admin'
import { buildAdminLayoutConfig } from '@/lib/admin-layout-config'
import { MobileAdminShell } from './mobile-admin-shell'

// Admin slug is an env-time constant — only one entry ever lands in this map.
// Keyed by slug so HMR doesn't leak stale layouts across dev reloads.
const layoutCache = new Map<string, ReturnType<typeof createAdminLayout>>()

function getAdminLayout(adminSlug: string) {
  let Layout = layoutCache.get(adminSlug)
  if (!Layout) {
    const adminPath = (sub = '') => `/${adminSlug}${sub}`
    Layout = createAdminLayout(buildAdminLayoutConfig(adminPath))
    layoutCache.set(adminSlug, Layout)
  }
  return Layout
}

export function AdminShell({
  userEmail,
  adminSlug,
  children,
}: {
  userEmail: string
  adminSlug: string
  children: React.ReactNode
}) {
  const AdminLayout = getAdminLayout(adminSlug)

  return (
    <>
      {/* Mobile / tablet: custom hamburger shell */}
      <div className="lg:hidden h-screen">
        <MobileAdminShell userEmail={userEmail}>{children}</MobileAdminShell>
      </div>
      {/* Desktop: package layout */}
      <div className="hidden lg:block">
        {/* eslint-disable-next-line react-hooks/static-components -- layout cached by slug, stable reference after first call */}
        <AdminLayout userEmail={userEmail}>{children}</AdminLayout>
      </div>
    </>
  )
}
