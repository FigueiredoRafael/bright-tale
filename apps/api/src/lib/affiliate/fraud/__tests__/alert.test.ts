import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/provider', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'x', provider: 'none' }),
}));

import * as provider from '@/lib/email/provider';
import { sendFraudAdminAlert } from '../alert';

const basePayload = {
  entityId: 'aff-1',
  flagType: 'self_referral_ip_match',
  severity: 'high',
  details: { foo: 'bar' },
  riskScore: 55,
  flagCount: 1,
  adminUrl: 'https://app.brighttale.io/admin/affiliates/aff-1',
} as const;

describe('sendFraudAdminAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AFFILIATE_ADMIN_EMAIL = 'admin@brighttale.test';
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('sends to AFFILIATE_ADMIN_EMAIL with subject including flagType + severity', async () => {
    await sendFraudAdminAlert(basePayload);
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@brighttale.test',
      subject: expect.stringMatching(/self_referral_ip_match.*high/),
    }));
  });

  it('escapes HTML in details', async () => {
    await sendFraudAdminAlert({
      ...basePayload,
      details: { note: '<script>alert(1)</script>' },
    });
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).not.toContain('<script>alert(1)</script>');
    expect(arg.html).toContain('&lt;script&gt;');
  });

  it('falls back to derived adminUrl when payload.adminUrl absent', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.brighttale.io';
    const { adminUrl: _drop, ...rest } = basePayload;
    void _drop;
    await sendFraudAdminAlert(rest);
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0];
    expect(arg.html).toContain('https://staging.brighttale.io/admin/affiliates/aff-1');
  });

  it('swallows provider errors (alerts are best-effort)', async () => {
    vi.mocked(provider.sendEmail).mockRejectedValueOnce(new Error('transport down'));
    await expect(sendFraudAdminAlert(basePayload)).resolves.toBeUndefined();
  });
});
