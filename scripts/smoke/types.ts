import type { SupabaseClient } from '@supabase/supabase-js'

export const ExitCode = {
  Ok: 0,
  ProbeFailed: 1,
  PreflightFailed: 2,
  SeedFailed: 3,
  CleanupFailed: 5,
  Timeout: 124,
  SIGINT: 130,
} as const
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode]

export interface SeedHandles {
  adminUserId: string
  affiliateOwnerUserId: string
  referredUserId: string
  affiliateId: string
  affiliateCode: string
  referralId: string
  organizationId: string
  commissionId: string
  fraudFlagId: string
}

export interface Baselines {
  pendingCommissionCountForAffiliate: number
}

export interface ProbeContext {
  fixture: SeedHandles
  baselines: Baselines
  apiUrl: string
  supabase: SupabaseClient
  internalKey: string
  stripeWebhookSecret: string | null
}

export interface ProbeOutcome {
  status: 'pass' | 'fail' | 'skip'
  detail?: string
}

export interface Probe {
  id: string
  sp: 1 | 2 | 3 | 4
  desc: string
  timeoutMs?: number
  run(ctx: ProbeContext): Promise<ProbeOutcome>
}

export interface ProbeResult extends ProbeOutcome {
  id: string
  sp: 1 | 2 | 3 | 4
  desc: string
  durationMs: number
}

export interface Env {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  internalKey: string
  stripeWebhookSecret: string | null
  apiUrl: string
  refRateLimitMax: number
}

export interface CliOptions {
  only: 1 | 2 | 3 | 4 | null
  json: boolean
  quiet: boolean
  verbose: boolean
  noCleanup: boolean
  cleanupOrphans: boolean
  force: boolean
  timeoutSeconds: number
  help: boolean
}
