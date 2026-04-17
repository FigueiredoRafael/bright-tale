'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { strings } from '../components/strings';

export default function ApplyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [suggestedCode, setSuggestedCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ref = typeof window !== 'undefined'
        ? window.localStorage.getItem('bt.ref') ?? undefined
        : undefined;
      await affiliateApi.apply({
        name, email,
        channelUrl: channelUrl || undefined,
        suggestedCode: suggestedCode || undefined,
        referralCode: ref,
      } as any);
      toast.success('Candidatura enviada — avaliamos em até 3 dias úteis.');
      router.push('/settings/affiliate');
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">{strings.state.not_affiliate.cta}</h1>
      <label className="block text-sm">
        <span>Nome</span>
        <input required className="mt-1 block w-full rounded border px-2 py-1"
          value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span>E-mail</span>
        <input required type="email" className="mt-1 block w-full rounded border px-2 py-1"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span>URL do canal (opcional)</span>
        <input className="mt-1 block w-full rounded border px-2 py-1"
          value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span>Código sugerido (opcional)</span>
        <input className="mt-1 block w-full rounded border px-2 py-1"
          value={suggestedCode} onChange={(e) => setSuggestedCode(e.target.value)} />
      </label>
      <Button type="submit" disabled={busy}>Enviar candidatura</Button>
    </form>
  );
}
