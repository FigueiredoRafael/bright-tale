import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseFraudRepository } from '../fraud-repo';

function chainable(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const fns = ['select', 'eq', 'gte', 'in', 'order', 'limit'];
  for (const fn of fns) chain[fn] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(returnValue);
  chain.insert = vi.fn().mockResolvedValue(returnValue);
  chain.upsert = vi.fn().mockResolvedValue(returnValue);
  // terminal operator for non-single reads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(returnValue);
  return chain;
}

function mockSb(returnValue: unknown): SupabaseClient<never> {
  const from = vi.fn().mockReturnValue(chainable(returnValue));
  return { from } as unknown as SupabaseClient<never>;
}

describe('SupabaseFraudRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findRecentFlag queries affiliate_fraud_flags keyed on affiliate_id', async () => {
    const sb = mockSb({ data: { id: 'flag-1' }, error: null });
    const repo = new SupabaseFraudRepository(sb);
    const res = await repo.findRecentFlag({ entityId: 'aff-1', flagType: 'self_referral_ip_match', since: '2026-04-16' });
    expect(sb.from).toHaveBeenCalledWith('affiliate_fraud_flags');
    expect(res).toEqual({ id: 'flag-1' });
  });

  it('findRecentFlag returns null when data is null', async () => {
    const sb = mockSb({ data: null, error: null });
    const repo = new SupabaseFraudRepository(sb);
    const res = await repo.findRecentFlag({ entityId: 'aff-1', flagType: 'x', since: '2026-01-01' });
    expect(res).toBeNull();
  });

  it('findRecentFlag throws on Supabase error', async () => {
    const sb = mockSb({ data: null, error: { message: 'db down' } });
    const repo = new SupabaseFraudRepository(sb);
    await expect(repo.findRecentFlag({ entityId: 'x', flagType: 'y', since: 'z' }))
      .rejects.toMatchObject({ message: 'db down' });
  });

  it('createFlag inserts with affiliate_id remap + status open', async () => {
    const sb = mockSb({ error: null });
    const repo = new SupabaseFraudRepository(sb);
    await repo.createFlag({
      entityId: 'aff-2', referralId: 'ref-1', flagType: 'self_referral_ip_match',
      severity: 'high', details: { foo: 'bar' }, status: 'open',
    });
    const insertArgs = (sb.from('affiliate_fraud_flags') as unknown as { insert: ReturnType<typeof vi.fn> }).insert.mock.calls[0][0];
    expect(insertArgs.affiliate_id).toBe('aff-2');
    expect(insertArgs.referral_id).toBe('ref-1');
    expect(insertArgs.status).toBe('open');
  });

  it('createFlag accepts null referralId', async () => {
    const sb = mockSb({ error: null });
    const repo = new SupabaseFraudRepository(sb);
    await repo.createFlag({
      entityId: 'aff-3', flagType: 'self_referral_email_similar',
      severity: 'medium', details: {}, status: 'open',
    });
    const insertArgs = (sb.from('affiliate_fraud_flags') as unknown as { insert: ReturnType<typeof vi.fn> }).insert.mock.calls[0][0];
    expect(insertArgs.referral_id).toBeNull();
  });

  it('listOpenFlags filters status in [open, investigating]', async () => {
    const sb = mockSb({ data: [{ flag_type: 'x', severity: 'high' }], error: null });
    const repo = new SupabaseFraudRepository(sb);
    const res = await repo.listOpenFlags('aff-4');
    expect(res).toEqual([{ flagType: 'x', severity: 'high' }]);
  });

  it('upsertRiskScore upserts on affiliate_id conflict', async () => {
    const sb = mockSb({ error: null });
    const repo = new SupabaseFraudRepository(sb);
    await repo.upsertRiskScore({ entityId: 'aff-5', score: 55, flagCount: 2, updatedAt: '2026-04-17T00:00:00Z' });
    const upsertArgs = (sb.from('affiliate_risk_scores') as unknown as { upsert: ReturnType<typeof vi.fn> }).upsert.mock.calls[0];
    expect(upsertArgs[0].affiliate_id).toBe('aff-5');
    expect(upsertArgs[1]).toMatchObject({ onConflict: 'affiliate_id' });
  });
});
