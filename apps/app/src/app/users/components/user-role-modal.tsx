"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { updateUserRole } from "@/lib/api/users";

interface UserRoleModalProps {
  userId: string | null;
  userName: string;
  currentRole: "admin" | "user";
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserRoleModal({
  userId,
  userName,
  currentRole,
  open,
  onClose,
  onSaved,
}: UserRoleModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const newRole = currentRole === "admin" ? "user" : "admin";

  async function handleConfirm() {
    if (!userId) return;
    setSaving(true);
    setError("");
    try {
      await updateUserRole(userId, newRole);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Erro ao alterar role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alterar Role</AlertDialogTitle>
          <AlertDialogDescription>
            {newRole === "admin"
              ? `Promover ${userName} a Admin?`
              : `Remover admin de ${userName}?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
