'use client'

import { useState, useTransition } from 'react'
import { UserPlus, X } from 'lucide-react'
import { inviteManager } from '../actions'

type ManagerRole = 'owner' | 'admin' | 'support' | 'billing' | 'readonly'

const ROLE_DESCRIPTIONS: Record<ManagerRole, string> = {
  owner: 'Todo acesso + pode gerenciar outros owners. Só founders.',
  admin: 'Todo acesso admin; gerencia outros managers (exceto owners).',
  support: 'Leitura de dados + ações de suporte (reset password, etc).',
  billing: 'Leitura + billing, payouts, aprovação de affiliates.',
  readonly: 'Apenas visualização. Auditores, consultores, advisors.',
}

export function InviteManagerModal({ callerIsOwner }: { callerIsOwner: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManagerRole>('admin')
  const [displayName, setDisplayName] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')

  const availableRoles: ManagerRole[] = callerIsOwner
    ? ['owner', 'admin', 'support', 'billing', 'readonly']
    : ['admin', 'support', 'billing', 'readonly']

  function reset() {
    setEmail('')
    setRole('admin')
    setDisplayName('')
    setTitle('')
    setDepartment('')
    setError(null)
    setSuccess(null)
  }

  function onClose() {
    if (pending) return
    setOpen(false)
    reset()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      setError('E-mail inválido')
      return
    }

    startTransition(async () => {
      const res = await inviteManager({
        email,
        role,
        displayName: displayName || undefined,
        title: title || undefined,
        department: department || undefined,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      setSuccess(`Convite enviado para ${email}. Manager criado com role '${role}'.`)
      // Clear form after a moment
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 1800)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent,#8b5cf6)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        <UserPlus className="h-4 w-4" />
        Convidar manager
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <div className="mt-20 w-full max-w-md rounded-xl border border-[var(--border,#263146)] bg-[var(--card,#121826)] p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground,#e6edf7)]">
                  Convidar manager
                </h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground,#8b98b0)]">
                  Envia magic link por email e cria row em <code>managers</code>.
                  Auditado automaticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-md p-1 text-[var(--muted-foreground,#8b98b0)] hover:bg-[var(--background,#0a0e1a)]/60"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground,#8b98b0)]">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@brighttale.com.br"
                  disabled={pending}
                  className="w-full rounded-md border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground,#8b98b0)]">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as ManagerRole)}
                  disabled={pending}
                  className="w-full rounded-md border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--muted-foreground,#8b98b0)]">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground,#8b98b0)]">
                    Nome (opcional)
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="João Silva"
                    disabled={pending}
                    className="w-full rounded-md border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground,#8b98b0)]">
                    Cargo (opcional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Co-founder"
                    disabled={pending}
                    className="w-full rounded-md border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground,#8b98b0)]">
                  Departamento (opcional)
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Engineering"
                  disabled={pending}
                  className="w-full rounded-md border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)] px-3 py-2 text-sm text-[var(--foreground,#e6edf7)] outline-none focus:ring-2 focus:ring-[var(--accent,#8b5cf6)]"
                />
              </div>

              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-400">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-400">
                  {success}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  className="rounded-md border border-[var(--border,#263146)] px-4 py-2 text-sm text-[var(--muted-foreground,#8b98b0)] hover:bg-[var(--background,#0a0e1a)]/60 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-[var(--accent,#8b5cf6)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? 'Enviando…' : 'Enviar convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
