/**
 * Unit tests for the WordPress config helper (T6.5a).
 *
 * Category A/B — no real DB; Supabase client is fully mocked.
 *
 * Coverage:
 * 1. getWordPressConfig — primary path: publish_targets row found
 * 2. getWordPressConfig — fallback path: publish_targets empty → wordpress_configs hit
 * 3. getWordPressConfig — legacy flag (PUBLISH_TARGETS_PRIMARY=false): only reads wordpress_configs
 * 4. getWordPressConfig — returns null when both tables have no row
 * 5. getWordPressCredentials — decrypts password and returns plain struct
 * 6. upsertWordPressConfig — writes both tables
 * 7. deleteWordPressConfig — deletes from both tables
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const WC_ROW = {
  id: 'wc-id-1',
  channel_id: CHANNEL_ID,
  site_url: 'https://wc.test',
  username: 'wc-admin',
  password: 'enc:wc-secret',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ── Chain builder ─────────────────────────────────────────────────────────────
// Mirrors the pattern from personas.test.ts.

function buildChain(finalValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockResolvedValue(finalValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalValue);
  // Allow further eq() chaining after delete()
  (chain.delete as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getWordPressConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PUBLISH_TARGETS_PRIMARY;
  });

  afterEach(() => {
    delete process.env.PUBLISH_TARGETS_PRIMARY;
  });

  it('returns config from publish_targets when row exists (primary path)', async () => {
    const ptChain = buildChain({ data: PT_ROW, error: null });
    mockFrom.mockReturnValueOnce(ptChain);

    const result = await getWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('publish_targets');
    expect(result?.siteUrl).toBe('https://wp.test');
    expect(result?.username).toBe('admin');
    expect(result?.id).toBe('pt-id-1');
    // wordpress_configs should NOT be queried when publish_targets has a row
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('publish_targets');
  });

  it('falls back to wordpress_configs when publish_targets has no row', async () => {
    const ptChain = buildChain({ data: null, error: null });
    const wcChain = buildChain({ data: WC_ROW, error: null });
    mockFrom
      .mockReturnValueOnce(ptChain)
      .mockReturnValueOnce(wcChain);

    const result = await getWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('wordpress_configs');
    expect(result?.siteUrl).toBe('https://wc.test');
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'publish_targets');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'wordpress_configs');
  });

  it('returns null when both tables have no row', async () => {
    const ptChain = buildChain({ data: null, error: null });
    const wcChain = buildChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(ptChain)
      .mockReturnValueOnce(wcChain);

    const result = await getWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(result).toBeNull();
  });

  it('reads only wordpress_configs when PUBLISH_TARGETS_PRIMARY=false (legacy mode)', async () => {
    process.env.PUBLISH_TARGETS_PRIMARY = 'false';

    const wcChain = buildChain({ data: WC_ROW, error: null });
    mockFrom.mockReturnValueOnce(wcChain);

    const result = await getWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(result).not.toBeNull();
    expect(result?.source).toBe('wordpress_configs');
    // publish_targets must NOT be queried
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('wordpress_configs');
  });
});

describe('getWordPressCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PUBLISH_TARGETS_PRIMARY;
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
    const wcChain = buildChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(ptChain)
      .mockReturnValueOnce(wcChain);

    const creds = await getWordPressCredentials(CHANNEL_ID, { from: mockFrom } as never);

    expect(creds).toBeNull();
  });
});

describe('upsertWordPressConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: build a chain that handles the select-then-insert flow for publish_targets
  function buildPtInsertChain() {
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // no existing row
      insert: insertFn,
    };
    (chain.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    return chain;
  }

  it('inserts into publish_targets and upserts wordpress_configs (no existing pt row)', async () => {
    const ptChain = buildPtInsertChain();
    const wcChain = buildChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(ptChain)   // select existing publish_targets
      .mockReturnValueOnce(ptChain)   // insert into publish_targets
      .mockReturnValueOnce(wcChain);  // upsert wordpress_configs

    await upsertWordPressConfig(
      CHANNEL_ID,
      { siteUrl: 'https://new.site', username: 'user', password: 'plain' },
      { from: mockFrom } as never,
    );

    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'publish_targets');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'publish_targets');
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'wordpress_configs');

    // publish_targets insert args
    const ptInsertArgs = (ptChain.insert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ptInsertArgs[0].type).toBe('wordpress');
    expect(ptInsertArgs[0].channel_id).toBe(CHANNEL_ID);
    expect(ptInsertArgs[0].credentials_encrypted).toBe('enc:plain');
    expect((ptInsertArgs[0].config_json as Record<string, unknown>).siteUrl).toBe('https://new.site');

    // wordpress_configs upsert args
    const wcUpsertArgs = (wcChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(wcUpsertArgs[0].channel_id).toBe(CHANNEL_ID);
    expect(wcUpsertArgs[0].site_url).toBe('https://new.site');
    expect(wcUpsertArgs[0].password).toBe('enc:plain');
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

    const wcChain = buildChain({ data: null, error: null });

    mockFrom
      .mockReturnValueOnce(ptSelectChain)   // select existing publish_targets
      .mockReturnValueOnce(ptUpdateChain)   // update publish_targets
      .mockReturnValueOnce(wcChain);        // upsert wordpress_configs

    await upsertWordPressConfig(
      CHANNEL_ID,
      { siteUrl: 'https://updated.site', username: 'newuser', password: 'newpw' },
      { from: mockFrom } as never,
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ credentials_encrypted: 'enc:newpw' }),
    );
  });

  it('strips trailing slash from siteUrl before writing', async () => {
    const ptChain = buildPtInsertChain();
    const wcChain = buildChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(ptChain)
      .mockReturnValueOnce(ptChain)
      .mockReturnValueOnce(wcChain);

    await upsertWordPressConfig(
      CHANNEL_ID,
      { siteUrl: 'https://trailing.slash/', username: 'u', password: 'pw' },
      { from: mockFrom } as never,
    );

    const wcUpsertArgs = (wcChain.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(wcUpsertArgs[0].site_url).toBe('https://trailing.slash');
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

  it('deletes from both publish_targets and wordpress_configs', async () => {
    // Each table needs its own chain since delete chains independently
    const ptChain = buildChain({ data: null, error: null });
    const wcChain = buildChain({ data: null, error: null });
    // delete returns chain; chain awaits to { data, error }
    const ptDeleteChain = {
      ...ptChain,
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    const wcDeleteChain = {
      ...wcChain,
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    // mockFrom: first call publish_targets delete, second call wordpress_configs delete
    mockFrom
      .mockReturnValueOnce({ delete: vi.fn().mockReturnValue(ptDeleteChain) })
      .mockReturnValueOnce({ delete: vi.fn().mockReturnValue(wcDeleteChain) });

    await deleteWordPressConfig(CHANNEL_ID, { from: mockFrom } as never);

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'publish_targets');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'wordpress_configs');
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
