import { send as resendSend } from './resend.js';
import { send as smtpSend } from './smtp.js';
import { send as noopSend } from './noop.js';

export type EmailProvider = 'resend' | 'smtp' | 'none';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
  provider: EmailProvider;
}

type SendFn = (params: SendEmailParams) => Promise<SendEmailResult>;

let _cached: SendFn | null = null;

function requireEnv(name: string, provider: EmailProvider): void {
  if (!process.env[name]) {
    throw new Error(
      `[email:provider] ${name} required when EMAIL_PROVIDER=${provider}. Set in deployment env or apps/api/.env.local.`,
    );
  }
}

function resolve(): SendFn {
  const provider = (process.env.EMAIL_PROVIDER ?? 'resend') as EmailProvider;
  switch (provider) {
    case 'resend':
      requireEnv('RESEND_API_KEY', 'resend');
      return resendSend;
    case 'smtp':
      requireEnv('SMTP_HOST', 'smtp');
      requireEnv('SMTP_PORT', 'smtp');
      requireEnv('SMTP_FROM', 'smtp');
      return smtpSend;
    case 'none':
      return noopSend;
    default:
      throw new Error(
        `[email:provider] Invalid EMAIL_PROVIDER='${provider}'. Valid: resend|smtp|none.`,
      );
  }
}

function getProvider(): SendFn {
  if (_cached) return _cached;
  _cached = resolve();
  return _cached;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  return getProvider()(params);
}

/** Test-only. Resets the provider cache so tests can swap EMAIL_PROVIDER. */
export function __resetProviderForTest(): void {
  _cached = null;
}
