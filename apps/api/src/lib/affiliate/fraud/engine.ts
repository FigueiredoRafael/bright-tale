import { FraudDetectionEngine, DEFAULT_FRAUD_CONFIG } from '@tn-figueiredo/fraud-detection';
import type { Affiliate } from '@tn-figueiredo/affiliate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@brighttale/shared/types/database';
import type { SupabaseAffiliateRepository } from '../repository';
import { SupabaseFraudRepository } from './fraud-repo';
import { AffiliateEntityAdapter } from './entity-adapter';
import { sendFraudAdminAlert } from './alert';

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

type Logger = {
  info: (m: string, meta?: unknown) => void;
  warn: (m: string, meta?: unknown) => void;
  error: (m: string, meta?: unknown) => void;
};

export function buildFraudEngine(deps: {
  sb: SupabaseClient<Database>;
  repo: SupabaseAffiliateRepository;
  logger?: Logger;
}): FraudDetectionEngine<Affiliate> {
  return new FraudDetectionEngine<Affiliate>({
    config: {
      ...DEFAULT_FRAUD_CONFIG,
      autoPauseThreshold: parseIntEnv(
        'FRAUD_AUTO_PAUSE_THRESHOLD',
        DEFAULT_FRAUD_CONFIG.autoPauseThreshold,
      ),
      notifyAdminThreshold: parseIntEnv(
        'FRAUD_NOTIFY_ADMIN_THRESHOLD',
        DEFAULT_FRAUD_CONFIG.notifyAdminThreshold,
      ),
    },
    fraudRepo: new SupabaseFraudRepository(deps.sb),
    entityRepo: new AffiliateEntityAdapter(deps.repo),
    onAdminAlert: sendFraudAdminAlert,
    logger: deps.logger,
  });
}
