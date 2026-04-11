"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MoreHorizontal,
  Pencil,
  Shield,
  UserX,
  UserCheck,
  Trash2,
  Eye,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { UserEditModal } from "./user-edit-modal";
import { UserRoleModal } from "./user-role-modal";
import { UserDeleteDialog } from "./user-delete-dialog";
import type { UserListItem } from "@brighttale/shared/types/users";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? "";
  const l = lastName?.charAt(0)?.toUpperCase() ?? "";
  return f + l || "?";
}

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-cyan-500",
    "bg-rose-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];
  return colors[Math.abs(hash) % colors.length];
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 30) return `${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} mes${diffMonths > 1 ? "es" : ""}`;
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} ano${diffYears > 1 ? "s" : ""}`;
}

interface UsersTableProps {
  users: UserListItem[];
  sort: string;
  sortDir: string;
  onRefresh: () => void;
}

export function UsersTable({ users, sort, sortDir, onRefresh }: UsersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [revealedEmails, setRevealedEmails] = useState<Set<string>>(new Set());
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [roleUser, setRoleUser] = useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserListItem | null>(null);

  function handleSort(column: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sort === column) {
      params.set("sortDir", sortDir === "asc" ? "desc" : "asc");
    } else {
      params.set("sort", column);
      params.set("sortDir", "asc");
    }
    params.delete("page");
    router.push(`/users?${params.toString()}`, { scroll: false });
  }

  function SortIcon({ column }: { column: string }) {
    if (sort !== column) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1" />
    );
  }

  function userName(u: UserListItem): string {
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || "Sem nome";
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("first_name")}
              >
                Usuario
                <SortIcon column="first_name" />
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("is_premium")}
              >
                Plano
                <SortIcon column="is_premium" />
              </TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("created_at")}
              >
                Cadastro
                <SortIcon column="created_at" />
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum usuario encontrado
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  {/* Usuario */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                        <AvatarFallback className={`${hashColor(u.id)} text-white text-xs`}>
                          {getInitials(u.firstName, u.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{userName(u)}</p>
                        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          {revealedEmails.has(u.id) ? u.email : maskEmail(u.email)}
                          {!revealedEmails.has(u.id) && (
                            <button
                              onClick={() =>
                                setRevealedEmails((s) => new Set(s).add(u.id))
                              }
                              className="hover:text-foreground transition-colors"
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          )}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Role */}
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Admin" : "User"}
                    </Badge>
                  </TableCell>

                  {/* Plano */}
                  <TableCell>
                    {u.isPremium ? (
                      u.isPremiumEffective ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-200">
                          Premium {u.premiumPlan}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Expirado</Badge>
                      )
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                  </TableCell>

                  {/* Expira em */}
                  <TableCell>
                    {u.premiumExpiresAt ? (
                      <span
                        className={
                          !u.isPremiumEffective
                            ? "text-destructive"
                            : new Date(u.premiumExpiresAt).getTime() - Date.now() <
                                30 * 86400000
                              ? "text-amber-500"
                              : ""
                        }
                      >
                        {new Date(u.premiumExpiresAt).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Cadastro */}
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="text-sm">
                          {formatRelativeDate(u.createdAt)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Date(u.createdAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Acoes */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditUser(u)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRoleUser(u)}>
                          <Shield className="h-4 w-4 mr-2" />
                          {u.role === "admin" ? "Remover Admin" : "Promover Admin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const { updateUser } = await import("@/lib/api/users");
                              await updateUser(u.id, { isActive: !u.isActive });
                              onRefresh();
                            } catch {}
                          }}
                        >
                          {u.isActive ? (
                            <>
                              <UserX className="h-4 w-4 mr-2" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteUser(u)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modals */}
      <UserEditModal
        user={editUser}
        open={!!editUser}
        onClose={() => setEditUser(null)}
        onSaved={onRefresh}
      />
      <UserRoleModal
        userId={roleUser?.id ?? null}
        userName={roleUser ? [roleUser.firstName, roleUser.lastName].filter(Boolean).join(" ") || "usuario" : ""}
        currentRole={roleUser?.role ?? "user"}
        open={!!roleUser}
        onClose={() => setRoleUser(null)}
        onSaved={onRefresh}
      />
      <UserDeleteDialog
        userId={deleteUser?.id ?? null}
        userName={deleteUser ? [deleteUser.firstName, deleteUser.lastName].filter(Boolean).join(" ") || "usuario" : ""}
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onDeleted={onRefresh}
      />
    </>
  );
}
