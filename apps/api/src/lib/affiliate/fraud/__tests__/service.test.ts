import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AffiliateFraudAdapter } from '../service';

type EngineMock = {
  checkSelfReferral: ReturnType<typeof vi.fn>;
};

function fakeEngine(): EngineMock {
  return { checkSelfReferral: vi.fn().mockResolvedValue(undefined) };
}

function fakeSb(email: string | null): SupabaseClient<never> {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({
    data: email ? { email } : null,
    error: null,
  });
  const from = vi.fn().mockReturnValue(chain);
  return { from } as unknown as SupabaseClient<never>;
}

const basePayload: {
  affiliate: { id: string; email: string; knownIpHashes?: string[] };
  referral: { id: string };
  signupIpHash: string;
  userId: string;
  platform?: string;
} = {
  affiliate: { id: 'aff-1', email: 'a@b.com', knownIpHashes: ['hash-1'] },
  referral: { id: 'ref-1' },
  signupIpHash: 'hash-1',
  userId: 'user-1',
  platform: 'web',
};

type LogFn = (m: string, meta?: unknown) => void;

describe('AffiliateFraudAdapter', () => {
  let engine: EngineMock;
  let logger: { info: LogFn; warn: LogFn; error: LogFn };

  beforeEach(() => {
    engine = fakeEngine();
    logger = {
      error: vi.fn<LogFn>(),
      info: vi.fn<LogFn>(),
      warn: vi.fn<LogFn>(),
    };
  });

  it('maps affiliate → entity and passes knownIpHashes through', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb('x@y.com'), logger);
    await adapter.checkSelfReferral(basePayload);
    const call = engine.checkSelfReferral.mock.calls[0][0];
    expect(call.entity).toEqual(basePayload.affiliate);
    expect(call.signupIpHash).toBe('hash-1');
    expect(call.userId).toBe('user-1');
  });

  it('narrows platform: web stays web', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral(basePayload);
    expect(engine.checkSelfReferral.mock.calls[0][0].platform).toBe('web');
  });

  it('narrows platform: android and ios pass through', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral({ ...basePayload, platform: 'android' });
    expect(engine.checkSelfReferral.mock.calls[0][0].platform).toBe('android');
    await adapter.checkSelfReferral({ ...basePayload, platform: 'ios' });
    expect(engine.checkSelfReferral.mock.calls[1][0].platform).toBe('ios');
  });

  it('narrows platform: unknown values → null', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral({ ...basePayload, platform: 'pwa' });
    expect(engine.checkSelfReferral.mock.calls[0][0].platform).toBeNull();
  });

  it('getUserEmail resolves via user_profiles.id', async () => {
    const sb = fakeSb('resolved@x.com');
    const adapter = new AffiliateFraudAdapter(engine as never, sb, logger);
    await adapter.checkSelfReferral(basePayload);
    const getEmailFn = engine.checkSelfReferral.mock.calls[0][0].getUserEmail;
    expect(await getEmailFn('user-1')).toBe('resolved@x.com');
  });

  it('getUserEmail returns null when profile missing', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await adapter.checkSelfReferral(basePayload);
    const getEmailFn = engine.checkSelfReferral.mock.calls[0][0].getUserEmail;
    expect(await getEmailFn('user-unknown')).toBeNull();
  });

  it('swallows engine errors and logs once — never rethrows', async () => {
    engine.checkSelfReferral.mockRejectedValueOnce(new Error('engine exploded'));
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb(null), logger);
    await expect(adapter.checkSelfReferral(basePayload)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('returns void on success', async () => {
    const adapter = new AffiliateFraudAdapter(engine as never, fakeSb('x@y.com'), logger);
    const res = await adapter.checkSelfReferral(basePayload);
    expect(res).toBeUndefined();
  });
});
