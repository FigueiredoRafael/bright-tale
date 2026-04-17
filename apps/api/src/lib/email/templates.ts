/**
 * Pre-built transactional templates for cross-cutting product flows. Each
 * function renders HTML + subject and dispatches via the provider abstraction.
 * Domain-specific templates (e.g., affiliate application emails) live with
 * the domain (apps/api/src/lib/affiliate/email-service.ts).
 */
import { sendEmail, type SendEmailResult } from './provider.js';

export async function sendContentPublishedEmail(
  to: string,
  title: string,
  url: string,
): Promise<SendEmailResult> {
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

export async function sendCreditsLowEmail(
  to: string,
  remaining: number,
  total: number,
): Promise<SendEmailResult> {
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
