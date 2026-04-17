'use client';

import { useEffect, useState } from 'react';
import type {
  Affiliate, AffiliateStats, AffiliateReferral, AffiliateCommission,
  AffiliatePixKey, AffiliateContentSubmission,
} from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError, type ClickByPlatform } from '@/lib/affiliate-api';
import { toast } from 'sonner';
import { TierBadge } from './tier-badge';
import { ReferralLinkCard } from './referral-link-card';
import { StatsGrid } from './stats-grid';
import { ClicksByPlatform } from './clicks-by-platform';
import { RecentReferrals } from './recent-referrals';
import { CommissionHistory } from './commission-history';
import { PayoutSection } from './payout-section';
import { PixKeyManager } from './pix-key-manager';
import { ContentSubmissions } from './content-submissions';
import { strings } from './strings';

interface Props {
  me: Affiliate;
  stats: AffiliateStats | null;
  readOnly: boolean;
  onMutate: () => Promise<void> | void;
}

export function Dashboard({ me, stats, readOnly, onMutate }: Props) {
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [clicks, setClicks] = useState<ClickByPlatform[]>([]);
  const [pixKeys, setPixKeys] = useState<AffiliatePixKey[]>([]);
  const [submissions, setSubmissions] = useState<AffiliateContentSubmission[]>([]);

  const refresh = async () => {
    try {
      const [r, c, cl, pk] = await Promise.all([
        affiliateApi.getReferrals(),
        affiliateApi.getCommissions(),
        affiliateApi.getClicksByPlatform(),
        affiliateApi.listPixKeys(),
      ]);
      setReferrals(r); setCommissions(c); setClicks(cl); setPixKeys(pk);
      // Content submissions live on the affiliate object in package v0.4.0
      setSubmissions((me as Affiliate & { contentSubmissions?: AffiliateContentSubmission[] }).contentSubmissions ?? []);
    } catch (err) {
      toast.error(err instanceof AffiliateApiError ? err.message : strings.errors.unknown);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, []);

  const defaultPix = pixKeys.find((k) => k.isDefault) ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="affiliate-dashboard">
      {readOnly && (
        <div
          role="alert"
          className="rounded border border-yellow-500 bg-yellow-50 p-3 text-sm"
        >
          {strings.state.paused.banner}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{strings.title}</h1>
        <TierBadge tier={me.tier!} commissionRate={me.commissionRate!} contractEndDate={me.contractEndDate!} />
      </div>

      <section className="space-y-2">
        <h3 className="font-medium">{strings.referral.section_title}</h3>
        <ReferralLinkCard code={me.code} tier={me.tier!} />
      </section>

      <StatsGrid stats={stats} />
      <ClicksByPlatform items={clicks} />
      <RecentReferrals items={referrals} />
      <CommissionHistory items={commissions} />
      <PayoutSection
        pendingPayoutBrl={stats?.pendingPayoutBrl ?? 0}
        defaultPixKey={defaultPix}
        readOnly={readOnly}
        onMutate={async () => { await onMutate(); await refresh(); }}
        tier={me.tier ?? undefined}
      />
      <PixKeyManager pixKeys={pixKeys} readOnly={readOnly} onChange={refresh} />
      <ContentSubmissions submissions={submissions} readOnly={readOnly} onChange={refresh} />
    </div>
  );
}
