'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { AffiliatePixKey, AffiliatePixKeyType } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError, type AddPixKeyInput } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { strings } from './strings';

interface Props {
  pixKeys: AffiliatePixKey[];
  readOnly: boolean;
  onChange: () => Promise<void> | void;
}

const VALIDATORS: Record<AffiliatePixKeyType, (v: string) => boolean> = {
  cpf: (v) => /^\d{11}$/.test(v.replace(/[.\-]/g, '')),
  cnpj: (v) => /^\d{14}$/.test(v.replace(/[.\-/]/g, '')),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v) => /^\+?\d{10,13}$/.test(v.replace(/\s/g, '')),
  random: (v) => /^[A-Za-z0-9-]{32,36}$/.test(v),
};

const INVALID_MSG: Record<AffiliatePixKeyType, string> = {
  cpf: strings.pix.invalid.cpf,
  cnpj: strings.pix.invalid.cnpj,
  email: strings.pix.invalid.email,
  phone: strings.pix.invalid.phone,
  random: strings.pix.invalid.random,
};

export function PixKeyManager({ pixKeys, readOnly, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddPixKeyInput>({ keyType: 'email', keyValue: '' });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasOthers = pixKeys.length > 1;

  const submit = async () => {
    setError(null);
    if (!VALIDATORS[form.keyType](form.keyValue)) {
      setError(INVALID_MSG[form.keyType]);
      return;
    }
    try {
      await affiliateApi.addPixKey(form);
      setAddOpen(false);
      setForm({ keyType: 'email', keyValue: '' });
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  const setDefault = async (id: string) => {
    setBusyId(id);
    try {
      await affiliateApi.setDefaultPixKey(id);
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await affiliateApi.deletePixKey(id);
      await onChange();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{strings.pix.section_title}</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button disabled={readOnly}>{strings.pix.add}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{strings.pix.add}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <label className="block text-sm">
                <span>Tipo</span>
                <select
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.keyType}
                  onChange={(e) => setForm({ ...form, keyType: e.target.value as AffiliatePixKeyType })}
                  aria-label="Tipo"
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone</option>
                  <option value="random">Aleatória</option>
                </select>
              </label>
              <label className="block text-sm">
                <span>Chave</span>
                <input
                  className="mt-1 block w-full rounded border px-2 py-1"
                  value={form.keyValue}
                  onChange={(e) => setForm({ ...form, keyValue: e.target.value })}
                  aria-label="Chave"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={submit}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pixKeys.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>Tipo</th><th>Chave</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {pixKeys.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="py-2">{k.keyType}</td>
                <td className="py-2">{k.keyDisplay}</td>
                <td className="py-2">
                  {k.isDefault ? (
                    <Badge>{strings.pix.default_badge}</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={readOnly || busyId === k.id}
                      onClick={() => setDefault(k.id)}
                    >
                      {strings.pix.set_default}
                    </Button>
                  )}
                </td>
                <td className="py-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-action="remove"
                        disabled={readOnly || (k.isDefault && hasOthers)}
                      >
                        {strings.pix.delete}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{strings.pix.confirm_delete_title}</AlertDialogTitle>
                        <AlertDialogDescription>{strings.pix.confirm_delete_body}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(k.id)}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
