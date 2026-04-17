/**
 * F5-006 — Resend transactional email.
 *
 * Free tier: 3k emails/mês, 100/dia. Pago $20/mês = 50k. Domínio precisa
 * DNS verificado pra SPF/DKIM.
 */

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
  provider: 'resend';
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY não configurado.');
  const from = process.env.RESEND_FROM ?? 'BrightTale <noreply@brighttale.io>';

  const res = await fetch('https://api.resend.com/emails', {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json() as { id: string };
  return { id: json.id, provider: 'resend' };
}

/* ─── Pre-built email templates ─────────────────────────────────────── */

export async function sendContentPublishedEmail(to: string, title: string, url: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `✅ Publicado: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2DD4A8;">Seu conteúdo tá no ar</h2>
        <p>O post <strong>${title}</strong> foi publicado com sucesso.</p>
        <p><a href="${url}" style="display: inline-block; padding: 10px 20px; background: #2DD4A8; color: white; text-decoration: none; border-radius: 6px;">Ver no site</a></p>
        <p style="color: #666; font-size: 12px;">BrightTale · Content Automation</p>
      </div>
    `,
  });
}

export async function sendCreditsLowEmail(to: string, remaining: number, total: number): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `⚠️ Créditos acabando (${remaining} restantes)`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #f59e0b;">Créditos BrightTale acabando</h2>
        <p>Você já usou ${((1 - remaining / total) * 100).toFixed(0)}% dos créditos do mês.</p>
        <p>Restam <strong>${remaining.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')}</strong>.</p>
        <p><a href="${process.env.APP_ORIGIN ?? 'https://app.brighttale.io'}/settings/billing">Fazer upgrade ou comprar créditos</a></p>
      </div>
    `,
  });
}

// Alias for email/provider.ts dispatcher. Removed in the atomic refactor commit
// alongside consumer migration (Commit B); kept here for additive safety.
export const send = sendEmail;
