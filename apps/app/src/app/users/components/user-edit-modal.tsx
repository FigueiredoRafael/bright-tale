"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUser } from "@/lib/api/users";
import type { UserListItem } from "@brighttale/shared/types/users";

interface UserEditModalProps {
  user: UserListItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditModal({ user, open, onClose, onSaved }: UserEditModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPlan, setPremiumPlan] = useState<"monthly" | "yearly">("monthly");
  const [premiumExpiresAt, setPremiumExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setIsPremium(user.isPremium);
      setPremiumPlan((user.premiumPlan as "monthly" | "yearly") ?? "monthly");
      setPremiumExpiresAt(
        user.premiumExpiresAt ? user.premiumExpiresAt.slice(0, 10) : "",
      );
      setIsActive(user.isActive);
      setError("");
    }
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      // Append T23:59:59 to date-only string to avoid timezone off-by-one
      const expiresIso = isPremium && premiumExpiresAt
        ? new Date(`${premiumExpiresAt}T23:59:59`).toISOString()
        : undefined;

      await updateUser(user.id, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        isPremium,
        ...(isPremium
          ? { premiumPlan, premiumExpiresAt: expiresIso }
          : {}),
        isActive,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Sobrenome</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">Ativo</Label>
            <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="isPremium">Premium</Label>
            <Switch id="isPremium" checked={isPremium} onCheckedChange={setIsPremium} />
          </div>

          {isPremium && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={premiumPlan}
                  onValueChange={(v) => setPremiumPlan(v as "monthly" | "yearly")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Expira em</Label>
                <Input
                  type="date"
                  value={premiumExpiresAt}
                  onChange={(e) => setPremiumExpiresAt(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
