import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AffiliateEntityAdapter } from '../entity-adapter';
import type { SupabaseAffiliateRepository } from '../../repository';

function fakeRepo() {
  return {
    findById: vi.fn(),
    pause: vi.fn(),
    addContractHistory: vi.fn(),
  } as unknown as SupabaseAffiliateRepository & {
    findById: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    addContractHistory: ReturnType<typeof vi.fn>;
  };
}

describe('AffiliateEntityAdapter', () => {
  let repo: ReturnType<typeof fakeRepo>;
  let adapter: AffiliateEntityAdapter;

  beforeEach(() => {
    repo = fakeRepo();
    adapter = new AffiliateEntityAdapter(repo);
  });

  it('findById delegates to SupabaseAffiliateRepository.findById', async () => {
    repo.findById.mockResolvedValue({ id: 'aff-1', email: 'x@y.com' });
    const res = await adapter.findById('aff-1');
    expect(repo.findById).toHaveBeenCalledWith('aff-1');
    expect(res).toEqual({ id: 'aff-1', email: 'x@y.com' });
  });

  it('findById returns null when repo returns null', async () => {
    repo.findById.mockResolvedValue(null);
    expect(await adapter.findById('missing')).toBeNull();
  });

  it('pause delegates with options pass-through', async () => {
    repo.pause.mockResolvedValue({ id: 'aff-1' });
    await adapter.pause('aff-1', { skipAudit: true });
    expect(repo.pause).toHaveBeenCalledWith('aff-1', { skipAudit: true });
  });

  it('addHistory remaps paused_fraud → paused with note prefix', async () => {
    repo.addContractHistory.mockResolvedValue(undefined);
    await adapter.addHistory({
      entityId: 'aff-2', action: 'paused_fraud',
      notes: 'score 82 auto-pause', oldStatus: 'active', newStatus: 'paused',
    });
    expect(repo.addContractHistory).toHaveBeenCalledWith(expect.objectContaining({
      affiliateId: 'aff-2',
      action: 'paused',
      notes: '[fraud-engine] score 82 auto-pause',
      oldStatus: 'active',
      newStatus: 'paused',
    }));
  });

  it('addHistory passes through non-fraud actions verbatim', async () => {
    repo.addContractHistory.mockResolvedValue(undefined);
    await adapter.addHistory({ entityId: 'aff-3', action: 'paused', notes: 'manual' });
    expect(repo.addContractHistory).toHaveBeenCalledWith(expect.objectContaining({
      affiliateId: 'aff-3', action: 'paused', notes: 'manual',
    }));
  });

  it('addHistory supplies default notes when paused_fraud without notes', async () => {
    repo.addContractHistory.mockResolvedValue(undefined);
    await adapter.addHistory({ entityId: 'aff-4', action: 'paused_fraud' });
    expect(repo.addContractHistory).toHaveBeenCalledWith(expect.objectContaining({
      notes: '[fraud-engine] auto-pause',
    }));
  });
});
