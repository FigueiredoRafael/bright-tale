import type { FraudDetectionEngine } from '@tn-figueiredo/fraud-detection';
import type { IAffiliateFraudDetectionService, Affiliate } from '@tn-figueiredo/affiliate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';

type Logger = {
  info: (m: string, meta?: unknown) => void;
  warn: (m: string, meta?: unknown) => void;
  error: (m: string, meta?: unknown) => void;
};

function narrowPlatform(p?: string): 'android' | 'ios' | 'web' | null {
  return p === 'android' || p === 'ios' || p === 'web' ? p : null;
}

/**
 * Implements IAffiliateFraudDetectionService by delegating to a
 * FraudDetectionEngine<Affiliate>. Responsibilities:
 *  - translate `affiliate → entity` (package naming difference);
 *  - narrow `platform: string` → `'android' | 'ios' | 'web' | null`;
 *  - supply `getUserEmail` callback (user_profiles.id === auth.users.id);
 *  - swallow engine errors — fraud is a side-observer, never blocks signup.
 */
export class AffiliateFraudAdapter implements IAffiliateFraudDetectionService {
  constructor(
    private readonly engine: FraudDetectionEngine<Affiliate>,
    private readonly sb: SupabaseClient<Database>,
    private readonly logger: Logger = console,
  ) {}

  async checkSelfReferral(data: {
    affiliate: { id: string; email: string; knownIpHashes?: string[] };
    referral: { id: string };
    signupIpHash: string;
    userId: string;
    platform?: string;
  }): Promise<void> {
    try {
      await this.engine.checkSelfReferral({
        entity: data.affiliate,
        referral: data.referral,
        signupIpHash: data.signupIpHash,
        userId: data.userId,
        platform: narrowPlatform(data.platform),
        getUserEmail: async (userId: string) => {
          const { data: u } = await this.sb
            .from('user_profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle();
          return (u as { email?: string } | null)?.email ?? null;
        },
      });
    } catch (err) {
      this.logger.error('[fraud] checkSelfReferral failed (swallowed):', err);
    }
  }
}
