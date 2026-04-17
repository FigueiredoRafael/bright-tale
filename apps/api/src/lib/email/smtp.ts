import nodemailer, { type Transporter } from 'nodemailer';
import type { SendEmailParams, SendEmailResult } from './provider.js';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  if (!host || !portStr) {
    throw new Error('[email:smtp] invariant: SMTP_HOST/SMTP_PORT missing after provider validation');
  }
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(portStr, 10),
    // `secure` omitted intentionally: nodemailer auto-detects per RFC — port 465
    // defaults to implicit TLS; any other port uses STARTTLS after EHLO (e.g.,
    // 587 prod, 1025 MailHog unauthenticated).
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    pool: true,
  });
  return _transporter;
}

export async function send(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    });
    return { id: info.messageId, provider: 'smtp' };
  } catch (err) {
    throw new Error(
      `[email:smtp] ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
