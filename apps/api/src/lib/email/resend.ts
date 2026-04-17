/**
 * Resend HTTP implementation of the email provider contract defined in
 * ./provider.ts. Exports `send(params)` only; the public entrypoint is
 * `sendEmail` from `./provider`.
 */
import type { SendEmailParams, SendEmailResult } from './provider.js';

export async function send(params: SendEmailParams): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      '[email:resend] invariant: RESEND_API_KEY missing after provider validation',
    );
  }
  const from = process.env.RESEND_FROM ?? 'BrightTale <noreply@brighttale.io>';

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
      }),
    });
  } catch (err) {
    throw new Error(
      `[email:resend] Network error: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[email:resend] HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { id: string };
  return { id: json.id, provider: 'resend' };
}
