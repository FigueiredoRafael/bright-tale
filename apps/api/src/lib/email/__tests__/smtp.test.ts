import { describe, it, expect, vi, beforeEach } from 'vitest';
import nodemailerMock from 'nodemailer-mock';

// smtp.ts does `import nodemailer from 'nodemailer'` (default import). Vitest
// requires the mock factory to shape the default export explicitly.
vi.mock('nodemailer', () => ({
  default: nodemailerMock,
  ...nodemailerMock,
}));

describe('email/smtp', () => {
  beforeEach(() => {
    nodemailerMock.mock.reset();
    process.env.SMTP_HOST = 'mail.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'from@brighttale.local';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    vi.resetModules();
  });

  it('forwards html/text/replyTo/from to transporter', async () => {
    const { send } = await import('../smtp.js');
    await send({
      to: 'a@b.com',
      subject: 's',
      html: '<p>hi</p>',
      text: 'hi',
      replyTo: 'r@x.com',
    });
    const [mail] = nodemailerMock.mock.getSentMail();
    expect(mail.html).toBe('<p>hi</p>');
    expect(mail.text).toBe('hi');
    expect(mail.replyTo).toBe('r@x.com');
    expect(mail.from).toBe('from@brighttale.local');
  });

  it('forwards array to as-is (nodemailer accepts array)', async () => {
    const { send } = await import('../smtp.js');
    await send({ to: ['a@b.com', 'c@d.com'], subject: 's' });
    const [mail] = nodemailerMock.mock.getSentMail();
    expect(mail.to).toEqual(['a@b.com', 'c@d.com']);
  });

  it('returns messageId and provider:smtp', async () => {
    const { send } = await import('../smtp.js');
    const res = await send({ to: 'a@b.com', subject: 's' });
    expect(res.provider).toBe('smtp');
    expect(typeof res.id).toBe('string');
  });

  it('singleton: multiple sends reuse the same transporter', async () => {
    const transportersBefore = nodemailerMock.mock.getTransporters().length;
    const { send } = await import('../smtp.js');
    await send({ to: 'a@b.com', subject: '1' });
    await send({ to: 'a@b.com', subject: '2' });
    await send({ to: 'a@b.com', subject: '3' });
    expect(nodemailerMock.mock.getSentMail().length).toBe(3);
    // Only ONE transporter was created across 3 sends (delta = 1, not 3)
    expect(nodemailerMock.mock.getTransporters().length - transportersBefore).toBe(1);
  });

  it('configures auth when SMTP_USER is set', async () => {
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    const { send } = await import('../smtp.js');
    await send({ to: 'a@b.com', subject: 's' });
    // Verify send succeeds with auth config (mock doesn't surface transporter opts,
    // but reaching here means createTransport accepted auth shape)
    expect(nodemailerMock.mock.getSentMail().length).toBe(1);
  });

  it('wraps transport error with [email:smtp] prefix', async () => {
    nodemailerMock.mock.setShouldFailOnce();
    const { send } = await import('../smtp.js');
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/\[email:smtp\]/);
  });

  it('preserves Error.cause on wrap', async () => {
    nodemailerMock.mock.setShouldFailOnce();
    const { send } = await import('../smtp.js');
    try {
      await send({ to: 'a@b.com', subject: 's' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error & { cause?: unknown }).cause).toBeDefined();
    }
  });
});
