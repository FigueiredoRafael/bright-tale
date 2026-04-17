import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/provider', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'x', provider: 'none' }),
}));

import * as provider from '@/lib/email/provider';
import { sendContentPublishedEmail, sendCreditsLowEmail } from '../templates';

describe('email/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APP_ORIGIN;
  });

  it('sendContentPublishedEmail subject contains title', async () => {
    await sendContentPublishedEmail('a@b.com', 'My Post', 'https://x.com/p');
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@b.com',
      subject: expect.stringContaining('My Post'),
    }));
  });

  it('sendContentPublishedEmail HTML includes the url verbatim (no escape at template layer)', async () => {
    const url = 'https://x.com/p?a=<script>';
    await sendContentPublishedEmail('a@b.com', 'title', url);
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain(url);
  });

  it('sendCreditsLowEmail renders percentage correctly (0%, 50%, 100%)', async () => {
    await sendCreditsLowEmail('a@b.com', 1000, 1000);
    let arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('0%');

    vi.clearAllMocks();
    await sendCreditsLowEmail('a@b.com', 500, 1000);
    arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('50%');

    vi.clearAllMocks();
    await sendCreditsLowEmail('a@b.com', 0, 1000);
    arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('100%');
  });

  it('sendCreditsLowEmail uses APP_ORIGIN when set', async () => {
    process.env.APP_ORIGIN = 'https://staging.brighttale.io';
    await sendCreditsLowEmail('a@b.com', 100, 1000);
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('https://staging.brighttale.io/settings/billing');
  });

  it('both pass through to sendEmail (single call each)', async () => {
    await sendContentPublishedEmail('a@b.com', 't', 'https://x');
    await sendCreditsLowEmail('a@b.com', 1, 10);
    expect(provider.sendEmail).toHaveBeenCalledTimes(2);
  });
});
