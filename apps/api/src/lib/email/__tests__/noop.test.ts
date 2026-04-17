import { describe, it, expect, vi } from 'vitest';
import { send } from '../noop';

describe('email/noop', () => {
  it('returns noop shape synchronously', async () => {
    const res = await send({ to: 'a@b.com', subject: 'hi' });
    expect(res).toEqual({ id: 'noop', provider: 'none' });
  });

  it('accepts invalid to without validation (pass-through)', async () => {
    const res = await send({ to: 'not-an-email', subject: 'x' });
    expect(res.provider).toBe('none');
  });

  it('has zero side effects (no fetch, no nodemailer exercised)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch should not be called');
    });
    await send({ to: 'a@b.com', subject: 'x' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
