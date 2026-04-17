'use client';

import { toast } from 'sonner';
import type { AffiliateTier } from '@tn-figueiredo/affiliate';
import { Button } from '@/components/ui/button';
import { strings } from './strings';

interface Props {
  code: string;
  tier: AffiliateTier;
}

function resolveWebOrigin(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('://app.')) return origin.replace('://app.', '://');
  return process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3002';
}

export function ReferralLinkCard({ code, tier }: Props) {
  const origin = resolveWebOrigin();
  const signupUrl = `${origin}/signup?ref=${encodeURIComponent(code)}`;
  const homeUrl = `${origin}/?ref=${encodeURIComponent(code)}`;

  const copy = async (variant: 'signup' | 'homepage', url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success(strings.referral.copied);
    (window as unknown as { posthog?: { capture: (ev: string, props: object) => void } })
      .posthog?.capture('affiliate_link_copied', { variant, tier, code });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">{signupUrl}</code>
        <Button onClick={() => copy('signup', signupUrl)}>
          {strings.referral.copy_signup}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">{homeUrl}</code>
        <Button variant="outline" onClick={() => copy('homepage', homeUrl)}>
          {strings.referral.copy_homepage}
        </Button>
      </div>
    </div>
  );
}
