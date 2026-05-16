'use client'

import { createAdminLayout } from '@tn-figueiredo/admin'
import { ADMIN_LAYOUT_CONFIG } from '@/lib/admin-layout-config'
import { MobileAdminShell } from './mobile-admin-shell'

const AdminLayout = createAdminLayout(ADMIN_LAYOUT_CONFIG)

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string
  children: React.ReactNode
}) {
  return (
    <>
      {/* Mobile / tablet: custom hamburger shell */}
      <div className="lg:hidden h-screen">
        <MobileAdminShell userEmail={userEmail}>{children}</MobileAdminShell>
      </div>
      {/* Desktop: package layout */}
      <div className="hidden lg:block">
        <AdminLayout userEmail={userEmail}>{children}</AdminLayout>
      </div>
    </>
  )
}
