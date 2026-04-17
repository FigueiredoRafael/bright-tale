'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { AffiliatePixKey, AffiliateTier } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatBrl } from '@/lib/formatters';
import { strings } from './strings';

interface Props {
  pendingPayoutBrl: number;
  defaultPixKey: AffiliatePixKey | null;
  readOnly: boolean;
  onMutate: () => Promise<void> | void;
  tier?: AffiliateTier;
}

const MIN_PAYOUT_BRL = 50;

export function PayoutSection({ pendingPayoutBrl, defaultPixKey, readOnly, onMutate, tier }: Props) {
  const [busy, setBusy] = useState(false);

  const belowMin = pendingPayoutBrl < MIN_PAYOUT_BRL;
  const noDefault = defaultPixKey == null;
  const disabled = readOnly || belowMin || noDefault || busy;

  const tooltip =
    noDefault ? strings.payout.no_default_tooltip
    : belowMin ? strings.payout.min_tooltip(formatBrl(MIN_PAYOUT_BRL))
    : null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await affiliateApi.requestPayout();
      toast.success(strings.payout.success);
      (window as unknown as { posthog?: { capture: (ev: string, p: object) => void } }).posthog?.capture(
        'affiliate_payout_requested',
        { amountBrl: pendingPayoutBrl, tier },
      );
      await onMutate();
    } catch (err) {
      if (err instanceof AffiliateApiError && err.message.includes('TaxIdIrregular')) {
        toast.error(strings.payout.tax_id_irregular);
      } else {
        toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{strings.payout.section_title}</h3>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={disabled} title={tooltip ?? undefined}>
            {strings.payout.request}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.payout.confirm_title}</AlertDialogTitle>
            <AlertDialogDescription>
              {strings.payout.confirm_body(formatBrl(pendingPayoutBrl), defaultPixKey?.keyDisplay ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.payout.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>{strings.payout.proceed}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {tooltip && <p className="text-xs text-muted-foreground">{tooltip}</p>}
    </section>
  );
}
