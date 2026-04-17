import { describe, it, expect, beforeEach, vi } from 'vitest';
import nodemailerMock from 'nodemailer-mock';

vi.mock('nodemailer', () => ({
  default: nodemailerMock,
  ...nodemailerMock,
}));

describe('email/provider', () => {
  beforeEach(async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;
    vi.resetModules();
    nodemailerMock.mock.reset();
    const mod = await import('../provider.js');
    mod.__resetProviderForTest();
  });

  it('defaults to resend when EMAIL_PROVIDER unset', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'r1' }), { status: 200 }),
    );
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('resend');
    fetchSpy.mockRestore();
  });

  it('dispatches to noop when EMAIL_PROVIDER=none', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res).toEqual({ id: 'noop', provider: 'none' });
  });

  it('dispatches to smtp when EMAIL_PROVIDER=smtp', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'mail.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'from@x';
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('smtp');
  });

  it('throws on invalid EMAIL_PROVIDER with helpful message', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/Invalid EMAIL_PROVIDER='sendgrid'.*resend\|smtp\|none/);
  });

  it('throws with remediation hint when RESEND_API_KEY missing', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/RESEND_API_KEY required when EMAIL_PROVIDER=resend.*apps\/api\/\.env\.local/);
  });

  it('throws with remediation hint when SMTP_HOST missing', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/SMTP_HOST required when EMAIL_PROVIDER=smtp/);
  });

  it('throws with remediation hint when SMTP_PORT missing', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'mail';
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/SMTP_PORT required/);
  });

  it('caches provider across calls', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const { sendEmail } = await import('../provider.js');
    await sendEmail({ to: 'a@b.com', subject: 's' });
    // Change env AFTER first call — cache should win
    process.env.EMAIL_PROVIDER = 'smtp'; // missing SMTP_HOST etc
    const res = await sendEmail({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('none');
  });

  it('__resetProviderForTest clears cache', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const mod = await import('../provider.js');
    await mod.sendEmail({ to: 'a@b.com', subject: 's' });
    process.env.EMAIL_PROVIDER = 'resend'; // missing RESEND_API_KEY
    mod.__resetProviderForTest();
    await expect(mod.sendEmail({ to: 'a@b.com', subject: 's' }))
      .rejects.toThrow(/RESEND_API_KEY required/);
  });

  it('resend dispatch propagates Resend HTTP errors', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const { sendEmail } = await import('../provider.js');
    await expect(sendEmail({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/HTTP 429/);
    fetchSpy.mockRestore();
  });

  it('end-to-end none dispatch does not mock the provider module', async () => {
    process.env.EMAIL_PROVIDER = 'none';
    const { sendEmail } = await import('../provider.js');
    const res = await sendEmail({ to: 'x@y.com', subject: 's' });
    expect(res).toEqual({ id: 'noop', provider: 'none' });
  });

  it('RESEND_FROM default applied when env unset', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.RESEND_FROM;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'r' }), { status: 200 }),
    );
    const { sendEmail } = await import('../provider.js');
    await sendEmail({ to: 'a@b.com', subject: 's' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe('BrightTale <noreply@brighttale.io>');
    fetchSpy.mockRestore();
  });
});
