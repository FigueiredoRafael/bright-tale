import type { SendEmailParams, SendEmailResult } from './provider.js';

export async function send(_params: SendEmailParams): Promise<SendEmailResult> {
  return { id: 'noop', provider: 'none' };
}
