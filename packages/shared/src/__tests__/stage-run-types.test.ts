import type { StageRun, AwaitingReason } from '../pipeline/inputs';
import { AWAITING_REASONS } from '../pipeline/inputs';
import { describe, it, expect, expectTypeOf } from 'vitest';

describe('StageRun', () => {
  it('has optional trackId and publishTargetId', () => {
    expectTypeOf<StageRun>().toHaveProperty('trackId').toEqualTypeOf<string | null | undefined>();
    expectTypeOf<StageRun>().toHaveProperty('publishTargetId').toEqualTypeOf<string | null | undefined>();
  });
});

describe('AWAITING_REASONS', () => {
  it('includes provider_quota_exhausted as a valid reason', () => {
    expect(AWAITING_REASONS).toContain('provider_quota_exhausted');
  });

  it('AwaitingReason type accepts provider_quota_exhausted (compile check)', () => {
    // This value assignment would fail TypeScript compile if the type is wrong
    const reason: AwaitingReason = 'provider_quota_exhausted';
    expect(reason).toBe('provider_quota_exhausted');
  });
});
