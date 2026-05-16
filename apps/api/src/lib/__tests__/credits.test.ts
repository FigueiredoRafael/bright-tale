/**
 * Unit tests for debitCredits() — T7.1: track_id + publish_target_id columns.
 *
 * Mocks the Supabase client; no live DB required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Supabase chainable mock ─────────────────────────────────────────────────

// singleMock is called at the end of select chains (returns data)
const singleMock = vi.fn();
// updateEqMock is called at the end of update chains (returns error)
const updateEqMock = vi.fn().mockResolvedValue({ error: null });
// insertMock is called for credit_usage inserts
const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

// We need two flavors of eq: one that returns the chain (for select) and one that resolves (for update).
// The simplest approach: track the last `from` table to decide which to use.
let lastTable = '';

const sbMock = {
  from: vi.fn().mockImplementation((table: string) => {
    lastTable = table;
    return sbMock;
  }),
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  insert: insertMock,
  eq: vi.fn().mockImplementation(() => {
    // For select chains we need to return sbMock so .single() is available.
    // We return an object that has both single() and is itself a thenable for update chains.
    return eqResult;
  }),
  single: singleMock,
};

// eqResult is the object returned by eq(): supports .single() and direct await (for update/eq)
const eqResult = {
  single: singleMock,
  eq: vi.fn().mockImplementation(() => eqResult),   // for double-eq chains (org_memberships)
  then: (resolve: (v: { error: null }) => void) => resolve({ error: null }), // makes it awaitable
};

vi.mock('../supabase/index.js', () => ({
  createServiceClient: () => sbMock,
}));

import { debitCredits } from '../credits';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-111';
const USER_ID = 'user-222';
const TRACK_ID = 'track-aaa';
const PUBLISH_TARGET_ID = 'pt-bbb';

function makeOrg(addonCredits = 0) {
  return { credits_used: 10, credits_addon: addonCredits };
}

function setupSingleReturns(orgData: object, membershipData: object | null = null) {
  singleMock
    .mockResolvedValueOnce({ data: orgData, error: null })   // org credits_used/credits_addon
    .mockResolvedValueOnce({ data: membershipData, error: null }); // org_memberships
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('debitCredits()', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore implementations after clearAllMocks
    sbMock.from.mockImplementation((table: string) => {
      lastTable = table;
      return sbMock;
    });
    sbMock.select.mockReturnValue(sbMock);
    sbMock.update.mockReturnValue(sbMock);
    sbMock.eq.mockReturnValue(eqResult);
    insertMock.mockResolvedValue({ data: null, error: null });
    eqResult.eq.mockReturnValue(eqResult);
  });

  it('records track_id=null and publish_target_id=null when not supplied', async () => {
    setupSingleReturns(makeOrg());

    await debitCredits(ORG_ID, USER_ID, 'brainstorm', 'text', 5);

    expect(insertMock).toHaveBeenCalledOnce();
    const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.track_id).toBeUndefined();
    expect(insertArg.publish_target_id).toBeUndefined();
  });

  it('records track_id when supplied', async () => {
    setupSingleReturns(makeOrg());

    await debitCredits(ORG_ID, USER_ID, 'brainstorm', 'text', 5, undefined, {
      trackId: TRACK_ID,
    });

    expect(insertMock).toHaveBeenCalledOnce();
    const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.track_id).toBe(TRACK_ID);
    expect(insertArg.publish_target_id).toBeUndefined();
  });

  it('records publish_target_id when supplied', async () => {
    setupSingleReturns(makeOrg());

    await debitCredits(ORG_ID, USER_ID, 'brainstorm', 'text', 5, undefined, {
      publishTargetId: PUBLISH_TARGET_ID,
    });

    expect(insertMock).toHaveBeenCalledOnce();
    const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.track_id).toBeUndefined();
    expect(insertArg.publish_target_id).toBe(PUBLISH_TARGET_ID);
  });

  it('records both track_id and publish_target_id when both are supplied', async () => {
    setupSingleReturns(makeOrg());

    await debitCredits(ORG_ID, USER_ID, 'production', 'text', 20, undefined, {
      trackId: TRACK_ID,
      publishTargetId: PUBLISH_TARGET_ID,
    });

    expect(insertMock).toHaveBeenCalledOnce();
    const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.track_id).toBe(TRACK_ID);
    expect(insertArg.publish_target_id).toBe(PUBLISH_TARGET_ID);
  });
});
