import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { getManager, canManageOtherManagers } from '@/lib/admin-check'
import { ShieldCheck, UserCog } from 'lucide-react'
import { InviteManagerModal } from './components/invite-modal'
import {
  RoleDropdown,
  DeactivateButton,
  ReactivateButton,
} from './components/row-actions'

export const dynamic = 'force-dynamic'

type ManagerRole = 'owner' | 'admin' | 'support' | 'billing' | 'readonly'

interface ManagerRow {
  id: string
  user_id: string
  role: ManagerRole
  display_name: string | null
  title: string | null
  department: string | null
  notes: string | null
  invited_by: string | null
  invited_at: string
  last_login_at: string | null
  is_active: boolean
  deactivated_at: string | null
  deactivation_reason: string | null
  created_at: string
  updated_at: string
}

interface EnrichedManager extends ManagerRow {
  email: string | null
  inviter_email: string | null
}

async function fetchManagers(): Promise<{
  active: EnrichedManager[]
  deactivated: EnrichedManager[]
}> {
  const db = createAdminClient()

  const { data: managers, error } = await db
    .from('managers')
    .select('*')
    .order('is_active', { ascending: false })
    .order('invited_at', { ascending: false })

  if (error) {
    console.error('[managers] fetch error:', error.message)
    return { active: [], deactivated: [] }
  }

  const userIds = Array.from(
    new Set([
      ...((managers ?? []) as ManagerRow[]).map((m) => m.user_id),
      ...((managers ?? []) as ManagerRow[])
        .map((m) => m.invited_by)
        .filter((v): v is string => v != null),
    ]),
  )

  const emailMap = new Map<string, string>()
  for (const id of userIds) {
    const { data: u } = await db.auth.admin.getUserById(id)
    if (u?.user?.email) emailMap.set(id, u.user.email)
  }

  const enriched: EnrichedManager[] = ((managers ?? []) as ManagerRow[]).map((m) => ({
    ...m,
    email: emailMap.get(m.user_id) ?? null,
    inviter_email: m.invited_by ? emailMap.get(m.invited_by) ?? null : null,
  }))

  return {
    active: enriched.filter((m) => m.is_active),
    deactivated: enriched.filter((m) => !m.is_active),
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: '2-digit' })
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 7) return `${days} dias atrás`
  if (days < 30) return `${Math.floor(days / 7)} sem. atrás`
  return formatDate(iso)
}

const ROLE_COLORS: Record<ManagerRole, string> = {
  owner: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  admin: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  support: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  billing: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  readonly: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

const ROLE_LABELS: Record<ManagerRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  support: 'Support',
  billing: 'Billing',
  readonly: 'Read-only',
}

function RoleBadge({ role }: { role: ManagerRole }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[role]}`}
    >
      <ShieldCheck className="h-3 w-3" />
      {ROLE_LABELS[role]}
    </span>
  )
}

export default async function ManagersPage() {
  const [managers, caller] = await Promise.all([
    fetchManagers(),
    (async () => {
      const supabase = await createServerSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      return await getManager(supabase, user.id)
    })(),
  ])

  const callerRole: ManagerRole = caller?.role ?? 'admin'
  const callerCanMutate = canManageOtherManagers(callerRole)
  const callerIsOwner = callerRole === 'owner'

  const { active, deactivated } = managers

  const byRole = active.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground,#e6edf7)]">Managers</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground,#8b98b0)]">
            Operadores da plataforma. Separado dos usuários clientes em{' '}
            <a href="users" className="text-[var(--accent,#8b5cf6)] hover:underline">/users</a>.
            Convites vão via Supabase (email com magic link). Mudanças de role + desativação
            são auditadas em <code className="text-xs">managers_audit_log</code>.
          </p>
        </div>
        {callerCanMutate && <InviteManagerModal callerIsOwner={callerIsOwner} />}
      </header>

      {/* KPIs por role */}
      {active.length > 0 && (
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(['owner', 'admin', 'billing', 'support', 'readonly'] as ManagerRole[]).map((role) => (
            <div
              key={role}
              className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-4"
            >
              <div className="text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                {ROLE_LABELS[role]}
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--foreground,#e6edf7)]">
                {byRole[role] ?? 0}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
            Ativos <span className="text-xs font-normal">({active.length})</span>
          </h2>
          {active.length === 0 ? (
            <div className="rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-8 text-center text-sm text-[var(--muted-foreground,#8b98b0)]">
              <UserCog className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nenhum manager ativo. Clique "Convidar manager" acima.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                    <th className="px-4 py-3 font-semibold">Nome / email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Cargo</th>
                    <th className="px-4 py-3 font-semibold">Convidado por</th>
                    <th className="px-4 py-3 font-semibold">Último login</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-[var(--border,#263146)] last:border-0 hover:bg-[var(--background,#0a0e1a)]/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--foreground,#e6edf7)]">
                          {m.display_name ?? m.email ?? '(sem nome)'}
                        </div>
                        {m.display_name && m.email && (
                          <div className="text-xs text-[var(--muted-foreground,#8b98b0)]">{m.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={m.role} />
                          {callerCanMutate && (
                            <RoleDropdown
                              managerId={m.id}
                              currentRole={m.role}
                              callerRole={callerRole}
                              disabled={false}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground,#8b98b0)]">
                        {m.title ?? '—'}
                        {m.department && <div className="text-xs opacity-75">{m.department}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                        {m.inviter_email ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                        {formatLastLogin(m.last_login_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {callerCanMutate && (m.role !== 'owner' || callerIsOwner) && (
                          <DeactivateButton managerId={m.id} callerCanMutate={callerCanMutate} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {deactivated.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
              Desativados <span className="text-xs font-normal">({deactivated.length})</span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] opacity-70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/50 text-left text-xs uppercase tracking-wider text-[var(--muted-foreground,#8b98b0)]">
                    <th className="px-4 py-3 font-semibold">Nome / email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Desativado em</th>
                    <th className="px-4 py-3 font-semibold">Motivo</th>
                    <th className="px-4 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {deactivated.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-[var(--border,#263146)] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--foreground,#e6edf7)]">
                          {m.display_name ?? m.email ?? '(sem nome)'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={m.role} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                        {formatDate(m.deactivated_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground,#8b98b0)]">
                        {m.deactivation_reason ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {callerCanMutate && (m.role !== 'owner' || callerIsOwner) && (
                          <ReactivateButton managerId={m.id} callerCanMutate={callerCanMutate} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
