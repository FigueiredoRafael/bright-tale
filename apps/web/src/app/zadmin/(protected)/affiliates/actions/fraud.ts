'use client';
import { adminApi } from '@/lib/admin-path';

type ResolveStatus = 'confirmed_fraud' | 'false_positive' | 'resolved' | 'investigating';

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

export async function resolveFlag(
  flagId: string,
  status: ResolveStatus,
  notes?: string,
  pauseAffiliate?: boolean,
): Promise<void> {
  return send('POST', adminApi(`/affiliate/fraud-flags/${encodeURIComponent(flagId)}/resolve`), {
    status,
    notes,
    pauseAffiliate,
  });
}
