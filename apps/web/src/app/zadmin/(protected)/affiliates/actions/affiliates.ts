'use client';
import { adminApi } from '@/lib/admin-path';
import type {
  ApproveAffiliateInput,
  ProposeContractChangeInput,
} from '@tn-figueiredo/affiliate';

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

export async function approve(id: string, input: ApproveAffiliateInput): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/approve`), input);
}
export async function pause(id: string): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/pause`));
}
export async function proposeChange(id: string, input: ProposeContractChangeInput): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/propose-change`), input);
}
export async function cancelProposal(id: string): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/cancel-proposal`));
}
export async function renewContract(id: string): Promise<void> {
  return send('POST', adminApi(`/affiliate/${encodeURIComponent(id)}/renew`));
}
