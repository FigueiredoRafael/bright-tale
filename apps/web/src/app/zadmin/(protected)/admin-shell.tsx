'use client'

import { createAdminLayout } from '@tn-figueiredo/admin'
import { ADMIN_LAYOUT_CONFIG } from '@/lib/admin-layout-config'

const AdminLayout = createAdminLayout(ADMIN_LAYOUT_CONFIG)

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string
  children: React.ReactNode
}) {
  return <AdminLayout userEmail={userEmail}>{children}</AdminLayout>
}
