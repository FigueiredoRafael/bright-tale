import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('NEXT_PUBLIC_ADMIN_SLUG', 'admin');

import { reviewContent } from '@/app/zadmin/(protected)/affiliates/actions/content';
import { resolveFlag } from '@/app/zadmin/(protected)/affiliates/actions/fraud';

describe('content + fraud actions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, error: null }), { status: 200 }),
    );
  });

  it('reviewContent → PUT /content-submissions/:sid/review with {status, notes}', async () => {
    await reviewContent('sub-1', 'approved', 'looks good');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/affiliate/content-submissions/sub-1/review');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      status: 'approved',
      notes: 'looks good',
    });
  });

  it('resolveFlag → POST /fraud-flags/:fid/resolve with 4 fields', async () => {
    await resolveFlag('flag-1', 'false_positive', 'manual review', true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/affiliate/fraud-flags/flag-1/resolve');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      status: 'false_positive',
      notes: 'manual review',
      pauseAffiliate: true,
    });
  });
});
