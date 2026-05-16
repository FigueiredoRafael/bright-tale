/**
 * Unit tests for the WordPress config helper (T6.5b).
 *
 * Category A/B — no real DB; Supabase client is fully mocked.
 *
 * Coverage:
 * 1. getWordPressConfig — returns config from publish_targets when row exists
 * 2. getWordPressConfig — returns null when no row exists
 * 3. getWordPressCredentials — decrypts password and returns plain struct
 * 4. getWordPressCredentials — returns null when no config exists
 * 5. upsertWordPressConfig — inserts into publish_targets when no existing row
 * 6. upsertWordPressConfig — updates existing publish_targets row
 * 7. upsertWordPressConfig — strips trailing slash from siteUrl
 * 8. upsertWordPressConfig — throws when publish_targets insert fails
 * 9. deleteWordPressConfig — deletes from publish_targets
 * 10. deleteWordPressConfig — throws when publish_targets delete fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Env setup (must happen before module import) ─────────────────────────────
const TEST_SECRET = 'a'.repeat(64);
process.env.ENCRYPTION_SECRET = TEST_SECRET;

// ── Mock crypto so tests don't need a real encryption key ────────────────────
vi.mock('../../crypto.js', () => ({
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => s.replace(/^enc:/, '')),
  aadFor: vi.fn((t: string, c: string, id: string, u: string) => `${t}:${c}:${id}:${u}`),
}));

// ── Mock Supabase client ──────────────────────────────────────────────────────
const mockFrom = vi.fn();

vi.mock('../../supabase/index.js', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

import {
  getWordPressConfig,
  getWordPressCredentials,
  upsertWordPressConfig,
  deleteWordPressConfig,
} from '../wordpress-config.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CHANNEL_ID = 'chan-111';

const PT_ROW = {
  id: 'pt-id-1',
  channel_id: CHANNEL_ID,
  config_json: { siteUrl: 'https://wp.test', username: 'admin' },
  credentials_encrypted: 'enc:secret',
  display_name: 'https://wp.test',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ── Chain builder ─────────────────────────────────────────────────────────────

function buildChain(finalValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockResolvedValue(finalValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalValue);
  (chain.delete as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getWordPressConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns config from publish_targets when row exists', async () => {
    const ptChain = buildChain({ data: PT_ROW, error: null });
    mockFrom.mockReturnValueOnce(ptChain);

    const result = await getWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(result).not.toBeNull();
    expect(result?.siteUrl).toBe('https://wp.test');
    expect(result?.username).toBe('admin');
    expect(result?.id).toBe('pt-id-1');
    expect(result?.channelId).toBe(CHANNEL_ID);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('publish_targets');
  });

  it('returns null when publish_targets has no row', async () => {
    const ptChain = buildChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(ptChain);

    const result = await getWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(result).toBeNull();
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('publish_targets');
  });
});

describe('getWordPressCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns decrypted credentials from publish_targets', async () => {
    const ptChain = buildChain({ data: PT_ROW, error: null });
    mockFrom.mockReturnValueOnce(ptChain);

    const creds = await getWordPressCredentials(CHANNEL_ID, { from: mockFrom } as never);

    expect(creds).not.toBeNull();
    expect(creds?.siteUrl).toBe('https://wp.test');
    expect(creds?.username).toBe('admin');
    // decrypt mock strips "enc:" prefix
    expect(creds?.password).toBe('secret');
  });

  it('returns null when no config exists', async () => {
    const ptChain = buildChain({ data: null, error: null });
    mockFrom.mockReturnValueOnce(ptChain);

    const creds = await getWordPressCredentials(CHANNEL_ID, { from: mockFrom } as never);

    expect(creds).toBeNull();
  });
});

describe('upsertWordPressConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildPtInsertChain() {
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: insertFn,
    };
    (chain.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    return chain;
  }

  it('inserts into publish_targets when no existing row', async () => {
    const ptChain = buildPtInsertChain();
    mockFrom
      .mockReturnValueOnce(ptChain)   // select existing publish_targets
      .mockReturnValueOnce(ptChain);  // insert into publish_targets

    await upsertWordPressConfig(
      CHANNEL_ID,
      { siteUrl: 'https://new.site', username: 'user', password: 'plain' },
      { from: mockFrom } as never,
    );

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'publish_targets');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'publish_targets');

    const ptInsertArgs = (ptChain.insert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ptInsertArgs[0].type).toBe('wordpress');
    expect(ptInsertArgs[0].channel_id).toBe(CHANNEL_ID);
    expect(ptInsertArgs[0].credentials_encrypted).toBe('enc:plain');
    expect((ptInsertArgs[0].config_json as Record<string, unknown>).siteUrl).toBe('https://new.site');
  });

  it('updates existing publish_targets row when one already exists', async () => {
    const existingPtId = 'existing-pt-id';
    const updateFn = vi.fn().mockReturnThis();
    const eqFn = vi.fn().mockResolvedValue({ data: null, error: null });

    const ptSelectChain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: existingPtId }, error: null }),
    };
    (ptSelectChain.select as ReturnType<typeof vi.fn>).mockReturnValue(ptSelectChain);
    (ptSelectChain.eq as ReturnType<typeof vi.fn>).mockReturnValue(ptSelectChain);

    const ptUpdateChain: Record<string, unknown> = {
      update: updateFn,
      eq: eqFn,
    };
    updateFn.mockReturnValue({ eq: eqFn });

    mockFrom
      .mockReturnValueOnce(ptSelectChain)   // select existing publish_targets
      .mockReturnValueOnce(ptUpdateChain);  // update publish_targets

    await upsertWordPressConfig(
      CHANNEL_ID,
      { siteUrl: 'https://updated.site', username: 'newuser', password: 'newpw' },
      { from: mockFrom } as never,
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ credentials_encrypted: 'enc:newpw' }),
    );
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('strips trailing slash from siteUrl before writing', async () => {
    const ptChain = buildPtInsertChain();
    mockFrom
      .mockReturnValueOnce(ptChain)
      .mockReturnValueOnce(ptChain);

    await upsertWordPressConfig(
      CHANNEL_ID,
      { siteUrl: 'https://trailing.slash/', username: 'u', password: 'pw' },
      { from: mockFrom } as never,
    );

    const ptInsertArgs = (ptChain.insert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((ptInsertArgs[0].config_json as Record<string, unknown>).siteUrl).toBe('https://trailing.slash');
  });

  it('throws when publish_targets insert fails', async () => {
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'insert error' } });
    const ptSelectChain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: insertFn,
    };
    (ptSelectChain.select as ReturnType<typeof vi.fn>).mockReturnValue(ptSelectChain);
    (ptSelectChain.eq as ReturnType<typeof vi.fn>).mockReturnValue(ptSelectChain);

    mockFrom
      .mockReturnValueOnce(ptSelectChain)
      .mockReturnValueOnce(ptSelectChain);

    await expect(
      upsertWordPressConfig(
        CHANNEL_ID,
        { siteUrl: 'https://x.test', username: 'u', password: 'pw' },
        { from: mockFrom } as never,
      ),
    ).rejects.toThrow('insert error');
  });
});

describe('deleteWordPressConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes from publish_targets by channel_id and type', async () => {
    const ptDeleteChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };

    mockFrom.mockReturnValueOnce({ delete: vi.fn().mockReturnValue(ptDeleteChain) });

    await deleteWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('publish_targets');
  });

  it('throws when publish_targets delete fails', async () => {
    const ptDeleteChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'delete error' } }),
      }),
    };
    mockFrom.mockReturnValueOnce({ delete: vi.fn().mockReturnValue(ptDeleteChain) });

    await expect(
      deleteWordPressConfig(CHANNEL_ID, { from: mockFrom } as never),
    ).rejects.toThrow('delete error');
  });
});
