import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type {
  AffiliateAdminSummary,
  AffiliateAdminDetail,
  AffiliateAdminOverview,
  AffiliatePayout,
  AffiliateContentSubmission,
} from '@tn-figueiredo/affiliate';
import type {
  AffiliateFraudFlag,
  AffiliateRiskScore,
} from '@tn-figueiredo/affiliate-admin';

// AffiliateDetailPageData extends AffiliateAdminDetail but is not publicly
// re-exported. Mirror its shape here — the server component accepts this
// by structural typing.
export interface AffiliateDetailPageData extends AffiliateAdminDetail {
  pixMismatch?: boolean;
  riskScore?: AffiliateRiskScore | null;
  openFlagCount?: number;
  contractAcceptance?: {
    version: number | null;
    acceptedAt: string | null;
    contractViewUrl?: string | null;
  };
}

// The admin package's server-entry exports `AffiliateDetailPageData` but
// does not re-export `AffiliateListData` publicly. We reconstruct the list
// shape locally (matches server-entry types exactly) and rely on the
// package's own types for the others.
export interface AffiliateListData {
  items: AffiliateAdminSummary[];
  total: number;
  page: number;
  perPage: number;
  kpis?: {
    totalActive: number;
    totalPending: number;
    totalInternal: number;
    pendingContract: number;
  };
}

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('[affiliate-admin] UNAUTHORIZED — no session in adminFetch');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init.headers,
      'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      'x-user-id': user.id,
      'Content-Type': 'application/json',
    },
  });
  // The affiliate package returns { success, data } while our own API returns
  // { data, error }. Handle both envelopes: success=false or !ok → throw.
  const body = (await res.json()) as
    | { success: true; data: T }
    | { success: false; error: string }
    | { data: T | null; error: { code: string; message: string } | null };

  if (!res.ok) {
    const errBody = body as { error?: { code?: string; message?: string } | string; message?: string; statusCode?: number };
    const code = (typeof errBody.error === 'object' && errBody.error?.code) ? errBody.error.code : String(res.status);
    const msg = (typeof errBody.error === 'object' && errBody.error?.message) ? errBody.error.message : (typeof errBody.error === 'string' ? errBody.error : res.statusText);
    throw new Error(`[affiliate-admin] ${code}: ${msg}`);
  }

  if ('success' in body) {
    if (!body.success) {
      const errMsg = (body as { success: false; error: string }).error;
      throw new Error(`[affiliate-admin] FORBIDDEN: ${errMsg}`);
    }
    return (body as { success: true; data: T }).data;
  }

  const enveloped = body as { data: T | null; error: { code: string; message: string } | null };
  if (enveloped.error) {
    throw new Error(`[affiliate-admin] ${enveloped.error.code}: ${enveloped.error.message}`);
  }
  if (enveloped.data === null || enveloped.data === undefined) {
    throw new Error(`[affiliate-admin] unexpected null data in ${path}`);
  }
  return enveloped.data;
}

export async function fetchAffiliates(sp: { tab?: string; type?: string; page?: string }) {
  const qs = new URLSearchParams();
  if (sp.tab) qs.set('tab', sp.tab);
  if (sp.type) qs.set('type', sp.type);
  if (sp.page) qs.set('page', sp.page);
  // The API returns AffiliateAdminOverview ({ affiliates, totalAffiliates, ... });
  // map to the AffiliateListData shape expected by AffiliateListServer.
  const raw = await adminFetch<AffiliateAdminOverview>(`/admin/affiliate/?${qs}`);
  if (!Array.isArray(raw.affiliates) || typeof raw.totalAffiliates !== 'number') {
    throw new Error('[affiliate-admin] malformed list response');
  }
  return {
    items: raw.affiliates,
    total: raw.totalAffiliates,
    page: 1,
    perPage: raw.totalAffiliates,
    kpis: {
      totalActive: raw.activeAffiliates,
      totalPending: raw.pendingAffiliates,
      totalInternal: raw.affiliates.filter(a => a.affiliateType === 'internal').length,
      pendingContract: 0,
    },
  } satisfies AffiliateListData;
}

export async function fetchAffiliateDetail(id: string) {
  return adminFetch<AffiliateDetailPageData>(`/admin/affiliate/${encodeURIComponent(id)}`);
}

export async function fetchPayouts() {
  return adminFetch<{
    items: (AffiliatePayout & { affiliateName?: string })[];
    total: number;
  }>(`/admin/affiliate/payouts`);
}

export async function fetchFraud() {
  const [flags, risk] = await Promise.all([
    adminFetch<{ items: AffiliateFraudFlag[] }>(`/admin/affiliate/fraud-flags`),
    adminFetch<{ items: AffiliateRiskScore[] }>(`/admin/affiliate/risk-scores`),
  ]);
  return { flags: flags.items, riskScores: risk.items };
}

export async function fetchContent() {
  return adminFetch<{ items: AffiliateContentSubmission[]; total: number }>(
    `/admin/affiliate/content-submissions`,
  );
}
