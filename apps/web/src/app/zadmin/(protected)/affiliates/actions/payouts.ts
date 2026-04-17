'use client';
import { adminApi } from '@/lib/admin-path';

async function send(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: { code: string; message: string } };
      if (j?.error) msg = `${j.error.code}: ${j.error.message}`;
    } catch { /* ignore parse */ }
    throw new Error(`[affiliate-admin] ${msg}`);
  }
}

export async function approvePayout(affiliateId: string, payoutId: string): Promise<void> {
  return send('POST', adminApi(
    `/affiliate/${encodeURIComponent(affiliateId)}/payouts/${encodeURIComponent(payoutId)}/approve`,
  ));
}
export async function rejectPayout(
  affiliateId: string,
  payoutId: string,
  notes: string,
): Promise<void> {
  return send('POST', adminApi(
    `/affiliate/${encodeURIComponent(affiliateId)}/payouts/${encodeURIComponent(payoutId)}/reject`,
  ), { notes });
}
export async function completePayout(affiliateId: string, payoutId: string): Promise<void> {
  return send('POST', adminApi(
    `/affiliate/${encodeURIComponent(affiliateId)}/payouts/${encodeURIComponent(payoutId)}/complete`,
  ));
}
