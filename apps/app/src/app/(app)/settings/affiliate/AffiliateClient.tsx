'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Affiliate, AffiliateStats } from '@tn-figueiredo/affiliate';
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from './components/strings';
import { NotAffiliate } from './components/not-affiliate';
import { PendingApplication } from './components/pending-application';
import { ContractProposal } from './components/contract-proposal';
import { Dashboard } from './components/dashboard';
import { Terminated } from './components/terminated';

type Screen =
  | 'loading' | 'error'
  | 'not-affiliate' | 'pending' | 'proposal'
  | 'dashboard' | 'paused' | 'terminated';

export function deriveScreen(me: Affiliate | null): Exclude<Screen, 'loading' | 'error'> {
  if (!me) return 'not-affiliate';
  if (me.status === 'pending') return 'pending';
  if (me.status === 'rejected' || me.status === 'terminated') return 'terminated';
  if (me.status === 'paused') return 'paused';
  if (me.proposedTier != null || me.proposedCommissionRate != null) return 'proposal';
  return 'dashboard';
}

export function AffiliateClient() {
  const [me, setMe] = useState<Affiliate | null>(null);
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');

  const load = useCallback(async () => {
    setScreen('loading');
    try {
      const m = await affiliateApi.getMe();
      setMe(m);
      const next = deriveScreen(m);
      setScreen(next);
      if (m && (next === 'dashboard' || next === 'paused' || next === 'proposal')) {
        try {
          setStats(await affiliateApi.getStats());
        } catch (err) {
          // Stats failure is non-fatal — dashboard renders with null stats
          const msg = err instanceof AffiliateApiError ? err.message : strings.errors.unknown;
          toast.error(msg);
        }
      }
    } catch {
      setScreen('error');
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (screen === 'loading') return <LoadingSkeleton />;
  if (screen === 'error') return <ErrorRetry onRetry={load} />;
  if (screen === 'not-affiliate') return <NotAffiliate />;
  if (screen === 'pending') return <PendingApplication me={me!} />;
  if (screen === 'terminated') return <Terminated me={me!} />;
  if (screen === 'proposal') return <ContractProposal me={me!} onResolved={load} />;
  return <Dashboard me={me!} stats={stats} readOnly={screen === 'paused'} onMutate={load} />;
}

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4" data-testid="affiliate-loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <p>{strings.errors.get_me_failed}</p>
      <Button onClick={onRetry}>{strings.errors.retry}</Button>
    </div>
  );
}
