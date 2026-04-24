'use client'

/**
 * Promote an existing app user into a manager (SEC-008.1).
 *
 * Opened from the /admin/users row actions. Creates a `managers` row
 * with the selected role + sends a notification email to the user
 * prompting them to log in and complete MFA enrollment. The user's
 * regular app account keeps working unchanged.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, ShieldCheck } from 'lucide-react'
import { promoteExistingUserToManager } from '@/app/zadmin/(protected)/managers/actions'
import type { UserListItem } from '@brighttale/shared/types/users'

type ManagerRole = 'owner' | 'admin' | 'support' | 'billing' | 'readonly'

const ROLE_DESCRIPTIONS: Record<ManagerRole, string> = {
  owner: 'Todo acesso + gerencia outros owners. Só founders.',
  admin: 'Todo acesso admin; gerencia outros managers (exceto owners).',
  support: 'Leitura de dados + ações de suporte (reset password, etc).',
  billing: 'Leitura + billing, payouts, aprovação de affiliates.',
  readonly: 'Apenas visualização. Auditores, consultores, advisors.',
}

interface Props {
  user: UserListItem
  callerIsOwner: boolean
  onClose: () => void
}

export function UserPromoteToManagerModal({ user, callerIsOwner, onClose }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [role, setRole] = useState<ManagerRole>('admin')
  const [displayName, setDisplayName] = useState(
    [user.firstName, user.lastName].filter(Boolean).join(' ') || '',
  )
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')

  const availableRoles: ManagerRole[] = callerIsOwner
    ? ['owner', 'admin', 'support', 'billing', 'readonly']
    : ['admin', 'support', 'billing', 'readonly']

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    startTransition(async () => {
      const res = await promoteExistingUserToManager({
        targetUserId: user.id,
        role,
        displayName: displayName || undefined,
        title: title || undefined,
        department: department || undefined,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      setSuccess(
        `Promovido. Email enviado pra ${user.email} com instruções pra completar o MFA.`,
      )
      setTimeout(() => {
        router.refresh()
        onClose()
      }, 1800)
    })
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-white dark:bg-dash-card rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-dash-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--accent,#8b5cf6)]" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-v-primary">
              Promover para manager
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={pending}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dash-surface text-slate-400 dark:text-v-dim transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-slate-50 dark:bg-dash-surface p-3 border border-slate-200 dark:border-dash-border">
          <div className="text-xs text-slate-500 dark:text-v-dim uppercase tracking-wider mb-1">
            Usuário
          </div>
          <div className="font-medium text-slate-900 dark:text-v-primary">{name}</div>
          <div className="text-sm text-slate-500 dark:text-v-dim">{user.email}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-v-dim uppercase tracking-wider mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ManagerRole)}
              disabled={pending}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface text-sm text-slate-900 dark:text-v-primary outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
            >
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-v-dim">
              {ROLE_DESCRIPTIONS[role]}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-v-dim uppercase tracking-wider mb-1.5">
                Nome
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={pending}
                placeholder="Mostrado no painel"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface text-sm text-slate-900 dark:text-v-primary outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-v-dim uppercase tracking-wider mb-1.5">
                Cargo
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={pending}
                placeholder="Co-founder"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface text-sm text-slate-900 dark:text-v-primary outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-v-dim uppercase tracking-wider mb-1.5">
              Departamento
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={pending}
              placeholder="Engineering, Support, Finance…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dash-border bg-white dark:bg-dash-surface text-sm text-slate-900 dark:text-v-primary outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
            />
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-300">
            Ao confirmar, o user recebe um email em <strong>{user.email}</strong> com
            instruções pra logar no painel e configurar o MFA (obrigatório). Até
            concluir o MFA, não consegue acessar o admin.
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-v-dim hover:bg-slate-100 dark:hover:bg-dash-surface disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-[var(--accent,#8b5cf6)] hover:opacity-90 text-white text-sm font-medium disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pending ? 'Promovendo…' : 'Confirmar promoção'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
