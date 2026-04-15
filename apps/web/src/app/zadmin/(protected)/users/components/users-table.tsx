'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminPath, adminApi } from '@/lib/admin-path';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Eye,
  EyeOff,
  Pencil,
  Shield,
  UserX,
  UserCheck,
  Trash2,
} from 'lucide-react';
import type { UserListItem } from '@brighttale/shared/types/users';
import { UserEditModal } from './user-edit-modal';
import { UserRoleModal } from './user-role-modal';
import { UserDeleteDialog } from './user-delete-dialog';

const AVATAR_GRADIENTS = [
  'from-purple-500 to-violet-700',
  'from-blue-400 to-blue-700',
  'from-emerald-400 to-green-700',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-700',
];

function relativeDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MaskedEmail({ email }: { email: string }) {
  const [revealed, setRevealed] = useState(false);
  const [at, domain] = email.split('@');
  const masked = `${at.slice(0, 2)}${'*'.repeat(Math.max(2, at.length - 2))}@${domain}`;

  return (
    <button
      type="button"
      onClick={() => setRevealed((v) => !v)}
      className="flex items-center gap-1 text-slate-500 dark:text-v-secondary hover:text-slate-700 dark:hover:text-v-primary transition-colors text-xs group"
    >
      <span className="font-mono">{revealed ? email : masked}</span>
      {revealed ? (
        <EyeOff className="w-3 h-3 opacity-0 group-hover:opacity-100" />
      ) : (
        <Eye className="w-3 h-3 opacity-0 group-hover:opacity-100" />
      )}
    </button>
  );
}

type SortKey = 'first_name' | 'email' | 'created_at' | 'is_premium';

function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  field: SortKey;
  currentSort: SortKey;
  currentDir: 'asc' | 'desc';
  onSort: (field: SortKey) => void;
}) {
  const active = currentSort === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim hover:text-slate-700 dark:hover:text-v-secondary transition-colors"
    >
      {label}
      {active ? (
        currentDir === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )
      ) : (
        <ChevronsUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

function ActionMenu({ user, onEdit, onRole, onDelete }: {
  user: UserListItem;
  onEdit: () => void;
  onRole: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const handleToggleActive = async () => {
    setOpen(false);
    await fetch(adminApi(`/users/${user.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    router.refresh();
  };

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 176 });
    }
    setOpen((v) => !v);
  };

  const menuCls = "w-full flex items-center gap-2.5 px-3 py-2 text-foreground hover:bg-secondary/80 transition-colors text-left";

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-44 bg-card border border-border rounded-xl shadow-lg py-1 text-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            <button type="button" onClick={() => { setOpen(false); onEdit(); }} className={menuCls}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
            <button type="button" onClick={() => { setOpen(false); onRole(); }} className={menuCls}>
              <Shield className="w-3.5 h-3.5" />
              {user.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
            </button>
            <button type="button" onClick={handleToggleActive} className={menuCls}>
              {user.isActive ? (
                <><UserX className="w-3.5 h-3.5" /> Desativar</>
              ) : (
                <><UserCheck className="w-3.5 h-3.5" /> Ativar</>
              )}
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface UsersTableProps {
  users: UserListItem[];
}

export function UsersTable({ users }: UsersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSort = (searchParams.get('sort') ?? 'created_at') as SortKey;
  const currentDir = (searchParams.get('sortDir') ?? 'desc') as 'asc' | 'desc';

  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [roleUser, setRoleUser] = useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null);

  const handleSort = (field: SortKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (currentSort === field) {
      params.set('sortDir', currentDir === 'asc' ? 'desc' : 'asc');
    } else {
      params.set('sort', field);
      params.set('sortDir', 'desc');
    }
    params.set('page', '1');
    router.push(`${adminPath('/users')}?${params.toString()}`);
  };

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-v-dim">
        <p className="text-sm">Nenhum usuário encontrado.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-dash-border">
              <th className="py-3 px-4 text-left">
                <SortHeader
                  label="Usuário"
                  field="first_name"
                  currentSort={currentSort}
                  currentDir={currentDir}
                  onSort={handleSort}
                />
              </th>
              <th className="py-3 px-4 text-left hidden md:table-cell">
                <SortHeader
                  label="Plano"
                  field="is_premium"
                  currentSort={currentSort}
                  currentDir={currentDir}
                  onSort={handleSort}
                />
              </th>
              <th className="py-3 px-4 text-left hidden lg:table-cell">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">
                  Papel
                </span>
              </th>
              <th className="py-3 px-4 text-left hidden lg:table-cell">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-v-dim">
                  Status
                </span>
              </th>
              <th className="py-3 px-4 text-left hidden xl:table-cell">
                <SortHeader
                  label="Criado"
                  field="created_at"
                  currentSort={currentSort}
                  currentDir={currentDir}
                  onSort={handleSort}
                />
              </th>
              <th className="py-3 px-4 text-right">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => {
              const name =
                [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                `…${user.id.slice(-6)}`;
              const initials = name.startsWith('…')
                ? '??'
                : name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
              const gradient = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
              const isExpired =
                user.isPremium &&
                user.premiumExpiresAt &&
                new Date(user.premiumExpiresAt) < new Date();

              return (
                <tr
                  key={user.id}
                  className="border-b border-slate-50 dark:border-dash-border/50 hover:bg-slate-50 dark:hover:bg-dash-surface/50 transition-colors"
                >
                  {/* User cell */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full bg-gradient-to-br ${gradient} flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white`}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-v-primary truncate">
                          {name}
                        </p>
                        <MaskedEmail email={user.email} />
                      </div>
                    </div>
                  </td>

                  {/* Plan badge */}
                  <td className="py-3 px-4 hidden md:table-cell">
                    {user.isPremiumEffective ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-v-yellow border border-amber-200 dark:border-amber-800/30">
                        Premium
                        {user.premiumPlan && ` · ${user.premiumPlan === 'monthly' ? 'Mensal' : 'Anual'}`}
                      </span>
                    ) : isExpired ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-v-red border border-red-200 dark:border-red-800/30">
                        Expirado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim border border-slate-200 dark:border-dash-border">
                        Gratuito
                      </span>
                    )}
                  </td>

                  {/* Role badge */}
                  <td className="py-3 px-4 hidden lg:table-cell">
                    {user.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-v-purple border border-purple-200 dark:border-purple-800/30">
                        <Shield className="w-3 h-3" />
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim border border-slate-200 dark:border-dash-border">
                        Usuário
                      </span>
                    )}
                  </td>

                  {/* Active badge */}
                  <td className="py-3 px-4 hidden lg:table-cell">
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-v-green border border-emerald-200 dark:border-emerald-800/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-dash-surface text-slate-500 dark:text-v-dim border border-slate-200 dark:border-dash-border">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                        Inativo
                      </span>
                    )}
                  </td>

                  {/* Created at */}
                  <td className="py-3 px-4 hidden xl:table-cell">
                    <span className="text-xs text-slate-400 dark:text-v-dim">
                      {relativeDate(user.createdAt)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <ActionMenu
                      user={user}
                      onEdit={() => setEditUser(user)}
                      onRole={() => setRoleUser(user)}
                      onDelete={() => setDeleteUser(user)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {editUser && (
        <UserEditModal user={editUser} onClose={() => setEditUser(null)} />
      )}
      {roleUser && (
        <UserRoleModal user={roleUser} onClose={() => setRoleUser(null)} />
      )}
      {deleteUser && (
        <UserDeleteDialog user={deleteUser} onClose={() => setDeleteUser(null)} />
      )}
    </>
  );
}
