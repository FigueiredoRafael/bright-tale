'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, Power, PowerOff } from 'lucide-react'
import {
  changeManagerRole,
  deactivateManager,
  reactivateManager,
} from '../actions'

type ManagerRole = 'owner' | 'admin' | 'support' | 'billing' | 'readonly'

const ROLE_OPTIONS: { value: ManagerRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Support' },
  { value: 'billing', label: 'Billing' },
  { value: 'readonly', label: 'Read-only' },
]

export function RoleDropdown({
  managerId,
  currentRole,
  callerRole,
  disabled,
}: {
  managerId: string
  currentRole: ManagerRole
  callerRole: ManagerRole
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isOwnerTarget = currentRole === 'owner'
  const callerIsOwner = callerRole === 'owner'
  // Admins can manage everyone except owners. Owners can manage everyone.
  const canMutate = !disabled && (callerIsOwner || !isOwnerTarget)

  // Allowed targets: admins can't promote anyone to owner
  const availableRoles = callerIsOwner
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value !== 'owner')

  async function change(newRole: ManagerRole) {
    if (newRole === currentRole) {
      setOpen(false)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await changeManagerRole({ managerId, newRole })
      if (!res.ok) {
        setError(res.message)
        return
      }
      setOpen(false)
    })
  }

  if (!canMutate) {
    // Render as plain text — no dropdown
    return <span className="text-[var(--muted-foreground,#8b98b0)]">{currentRole}</span>
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => !pending && setOpen(!open)}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border,#263146)] bg-[var(--background,#0a0e1a)]/30 px-2 py-1 text-xs hover:bg-[var(--background,#0a0e1a)]/60 disabled:opacity-50"
      >
        {currentRole}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-[var(--border,#263146)] bg-[var(--card,#121826)] shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {availableRoles.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => change(r.value)}
              disabled={pending || r.value === currentRole}
              className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--background,#0a0e1a)]/50 ${
                r.value === currentRole
                  ? 'font-medium text-[var(--accent,#8b5cf6)]'
                  : 'text-[var(--foreground,#e6edf7)]'
              } disabled:opacity-50`}
            >
              {r.label}
              {r.value === currentRole && ' ✓'}
            </button>
          ))}
        </div>
      )}

      {error && <div className="absolute left-0 top-full mt-7 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] text-red-400">{error}</div>}
    </div>
  )
}

export function DeactivateButton({
  managerId,
  callerCanMutate,
}: {
  managerId: string
  callerCanMutate: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    if (!callerCanMutate) return
    const reason = window.prompt('Motivo da desativação (opcional):')
    if (reason === null) return // user cancelled
    if (!window.confirm('Confirma desativar esse manager? Perde acesso no próximo check.')) return
    setError(null)
    startTransition(async () => {
      const res = await deactivateManager({ managerId, reason: reason || undefined })
      if (!res.ok) setError(res.message)
    })
  }

  if (!callerCanMutate) return null

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      title="Desativar"
      className="inline-flex items-center gap-1 rounded-md border border-[var(--border,#263146)] px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
    >
      <PowerOff className="h-3 w-3" />
      {pending ? 'Desativando…' : 'Desativar'}
      {error && <span className="ml-2 text-[10px]">{error}</span>}
    </button>
  )
}

export function ReactivateButton({
  managerId,
  callerCanMutate,
}: {
  managerId: string
  callerCanMutate: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    if (!callerCanMutate) return
    if (!window.confirm('Reativar esse manager? Acesso volta imediatamente.')) return
    setError(null)
    startTransition(async () => {
      const res = await reactivateManager({ managerId })
      if (!res.ok) setError(res.message)
    })
  }

  if (!callerCanMutate) return null

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      title="Reativar"
      className="inline-flex items-center gap-1 rounded-md border border-[var(--border,#263146)] px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
    >
      <Power className="h-3 w-3" />
      {pending ? 'Reativando…' : 'Reativar'}
      {error && <span className="ml-2 text-[10px]">{error}</span>}
    </button>
  )
}
