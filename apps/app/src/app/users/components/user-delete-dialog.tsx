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
import { deleteUser } from "@/lib/api/users";

interface UserDeleteDialogProps {
  userId: string | null;
  userName: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function UserDeleteDialog({
  userId,
  userName,
  open,
  onClose,
  onDeleted,
}: UserDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!userId) return;
    setDeleting(true);
    setError("");
    try {
      await deleteUser(userId);
      onDeleted();
      onClose();
    } catch (e: any) {
      setError(e.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Usuario</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acao e irreversivel. Todos os dados de {userName} serao excluidos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
