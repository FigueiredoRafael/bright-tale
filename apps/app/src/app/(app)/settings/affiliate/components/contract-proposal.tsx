'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { strings } from './strings';

interface Props {
  me: Affiliate;
  onResolved: () => Promise<void> | void;
}

function pct(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function ContractProposal({ me, onResolved }: Props) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const isRenewal = me.tier != null;

  const handleAccept = async () => {
    setBusy('accept');
    try {
      const lgpd =
        typeof window !== 'undefined'
          ? { ip: '', ua: window.navigator.userAgent }
          : undefined;
      await affiliateApi.acceptProposal(lgpd);
      (window as unknown as { posthog?: { capture: (ev: string, p: object) => void } }).posthog?.capture(
        'affiliate_proposal_accepted',
        { tier: me.proposedTier, commissionRate: me.proposedCommissionRate, contractVersion: me.contractVersion },
      );
      await onResolved();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy('reject');
    try {
      await affiliateApi.rejectProposal();
      await onResolved();
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4" data-testid="contract-proposal">
      <h1 className="text-2xl font-semibold">{strings.state.proposal.title}</h1>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4">
        {isRenewal && (
          <>
            <dt className="text-muted-foreground">Tier atual</dt>
            <dd>{me.tier ? strings.tier[me.tier] : '—'} — {pct(me.commissionRate)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{isRenewal ? 'Tier proposto' : 'Tier'}</dt>
        <dd>{me.proposedTier ? strings.tier[me.proposedTier] : '—'} — {pct(me.proposedCommissionRate)}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">{strings.state.proposal.lgpd_consent}</p>
      <div className="flex gap-2">
        <Button disabled={busy !== null} onClick={handleAccept}>
          {strings.state.proposal.accept}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={busy !== null}>
              {strings.state.proposal.reject}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rejeitar proposta?</AlertDialogTitle>
              <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleReject}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
