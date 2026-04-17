import type {
  Affiliate, AffiliateStats, AffiliateReferral, AffiliateCommission,
  AffiliatePixKey, AffiliatePixKeyType, AffiliatePayout,
  AffiliateContentSubmission, ContentSubmissionPlatform, ContentSubmissionType,
  ApplyAsAffiliateInput,
} from '@tn-figueiredo/affiliate';

export type AffiliateApiErrorCode =
  | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION' | 'UNKNOWN';

export class AffiliateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: AffiliateApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AffiliateApiError';
  }
}

type PkgOk<T> = { success: true; data?: T };
type PkgErr = { success: false; error: string };
type PkgResp<T> = PkgOk<T> | PkgErr;

function codeFor(status: number): AffiliateApiErrorCode {
  if (status === 404) return 'NOT_FOUND';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400) return 'VALIDATION';
  return 'UNKNOWN';
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/affiliate${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (res.status === 204) return undefined as T;

  let json: PkgResp<T>;
  try {
    json = (await res.json()) as PkgResp<T>;
  } catch {
    throw new AffiliateApiError(res.status, codeFor(res.status), `HTTP ${res.status}`);
  }

  if (!res.ok || !('success' in json) || json.success === false) {
    const msg = (json as PkgErr).error ?? `HTTP ${res.status}`;
    throw new AffiliateApiError(res.status, codeFor(res.status), msg);
  }
  return (json.data as T) ?? (undefined as T);
}

export interface AddPixKeyInput {
  keyType: AffiliatePixKeyType;
  keyValue: string;
  label?: string;
  isDefault?: boolean;
}

export interface SubmitContentInput {
  url: string;
  platform: ContentSubmissionPlatform;
  contentType: ContentSubmissionType;
  title?: string;
  description?: string;
  postedAt?: string;
}

export interface ClickByPlatform {
  sourcePlatform: string;
  clicks: number;
  conversions: number;
}

export const affiliateApi = {
  async getMe(): Promise<Affiliate | null> {
    try {
      return await call<Affiliate>('/me');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  },
  getStats: () => call<AffiliateStats>('/stats'),
  getReferrals: () => call<AffiliateReferral[]>('/referrals'),
  getCommissions: () => call<AffiliateCommission[]>('/me/commissions'),
  getClicksByPlatform: () => call<ClickByPlatform[]>('/clicks-by-platform'),
  listPixKeys: () => call<AffiliatePixKey[]>('/pix-keys'),
  addPixKey: (i: AddPixKeyInput) =>
    call<AffiliatePixKey>('/pix-keys', { method: 'POST', body: JSON.stringify(i) }),
  setDefaultPixKey: (id: string) =>
    call<void>(`/pix-keys/${encodeURIComponent(id)}/default`, { method: 'PUT' }),
  deletePixKey: (id: string) =>
    call<void>(`/pix-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  submitContent: (i: SubmitContentInput) =>
    call<AffiliateContentSubmission>('/content-submissions', {
      method: 'POST', body: JSON.stringify(i),
    }),
  acceptProposal: (lgpdData?: { ip: string; ua: string }) =>
    call<Affiliate>('/accept-proposal', {
      method: 'POST', body: JSON.stringify({ lgpdData }),
    }),
  rejectProposal: () =>
    call<void>('/reject-proposal', { method: 'POST', body: '{}' }),
  requestPayout: () =>
    call<AffiliatePayout>('/payouts', { method: 'POST', body: '{}' }),
  apply: (i: ApplyAsAffiliateInput) =>
    call<Affiliate>('/apply', { method: 'POST', body: JSON.stringify(i) }),
};

export type AffiliateApi = typeof affiliateApi;
