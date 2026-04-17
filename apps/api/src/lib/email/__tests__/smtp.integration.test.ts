import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { preflightMailhog, clearMailhog, pollForMessages } from '@/test/mailhog';

// Set SMTP envs BEFORE importing provider so cache resolves correctly.
process.env.EMAIL_PROVIDER = 'smtp';
process.env.SMTP_HOST = process.env.MAILHOG_HOST ?? 'localhost';
process.env.SMTP_PORT = process.env.MAILHOG_SMTP_PORT ?? '1025';
process.env.SMTP_FROM = 'from@brighttale.local';

const preflightOk = await preflightMailhog();

describe.skipIf(!preflightOk)('SMTP integration via MailHog', () => {
  beforeAll(async () => {
    const { __resetProviderForTest } = await import('@/lib/email/provider');
    __resetProviderForTest();
  });

  beforeEach(async () => {
    await clearMailhog();
  });

  it('sends basic email', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    const res = await sendEmail({
      to: 'dest@brighttale.local',
      subject: 'integration-basic',
      html: '<p>hello</p>',
    });
    expect(res.provider).toBe('smtp');
    expect(res.id).toBeTruthy();

    const msgs = await pollForMessages(1);
    expect(msgs.length).toBe(1);
    expect(msgs[0].Content.Headers.Subject).toContain('integration-basic');
  });

  it('multi-recipient single envelope with multiple RCPT TO', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    await sendEmail({
      to: ['a@brighttale.local', 'b@brighttale.local'],
      subject: 'multi',
    });
    const msgs = await pollForMessages(1);
    expect(msgs.length).toBe(1);
    expect(msgs[0].To.length).toBe(2);
  });

  it('preserves replyTo header', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    await sendEmail({
      to: 'dest@brighttale.local',
      subject: 'rt',
      replyTo: 'reply@brighttale.local',
      html: '<p>x</p>',
    });
    const msgs = await pollForMessages(1);
    const replyToHeader = msgs[0].Content.Headers['Reply-To'];
    expect(replyToHeader?.[0]).toContain('reply@brighttale.local');
  });

  it('multipart HTML + text', async () => {
    const { sendEmail } = await import('@/lib/email/provider');
    await sendEmail({
      to: 'dest@brighttale.local',
      subject: 'mp',
      html: '<p>html body</p>',
      text: 'text body',
    });
    const msgs = await pollForMessages(1);
    expect(msgs[0].Content.Headers['Content-Type']?.[0]).toMatch(/multipart/);
  });
});
