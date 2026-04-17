import { describe, it, expect, beforeEach, vi } from 'vitest';
import { send } from '../resend';

describe('email/resend', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_abc';
    delete process.env.RESEND_FROM;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockReset();
  });

  it('sends with correct URL, headers, body', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r_1' }), { status: 200 }));
    const res = await send({ to: 'a@b.com', subject: 'hello', html: '<b>hi</b>' });
    expect(res).toEqual({ id: 'r_1', provider: 'resend' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_abc',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      from: 'BrightTale <noreply@brighttale.io>',
      to: ['a@b.com'],
      subject: 'hello',
      html: '<b>hi</b>',
    });
  });

  it('maps replyTo → reply_to key', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r' }), { status: 200 }));
    await send({ to: 'a@b.com', subject: 's', replyTo: 'r@x.com' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reply_to).toBe('r@x.com');
    expect(body.replyTo).toBeUndefined();
  });

  it('passes through array to as array', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r' }), { status: 200 }));
    await send({ to: ['a@b.com', 'c@d.com'], subject: 's' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.to).toEqual(['a@b.com', 'c@d.com']);
  });

  it('applies RESEND_FROM env when set', async () => {
    process.env.RESEND_FROM = 'Custom <custom@x.com>';
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: 'r' }), { status: 200 }));
    await send({ to: 'a@b.com', subject: 's' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toBe('Custom <custom@x.com>');
  });

  it('throws on HTTP 4xx with truncated body', async () => {
    const longBody = 'x'.repeat(500);
    fetchSpy.mockResolvedValue(new Response(longBody, { status: 429 }));
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/HTTP 429.*x{200}$/);
  });

  it('throws on HTTP 5xx', async () => {
    fetchSpy.mockResolvedValue(new Response('server error', { status: 503 }));
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/HTTP 503/);
  });

  it('wraps network errors with Error.cause', async () => {
    const netErr = new TypeError('fetch failed');
    fetchSpy.mockRejectedValue(netErr);
    try {
      await send({ to: 'a@b.com', subject: 's' });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/\[email:resend\] Network error:/);
      expect((err as Error & { cause?: unknown }).cause).toBe(netErr);
    }
  });

  it('invariant throw when RESEND_API_KEY missing', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(send({ to: 'a@b.com', subject: 's' })).rejects.toThrow(/invariant/);
  });
});
