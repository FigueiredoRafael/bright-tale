import type { OnAdminAlert } from '@tn-figueiredo/fraud-detection';
import { sendEmail } from '@/lib/email/provider';

function adminEmail(): string {
  return process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const sendFraudAdminAlert: OnAdminAlert = async (payload) => {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://brighttale.io';
  const adminUrl = payload.adminUrl ?? `${base}/admin/affiliates/${payload.entityId}`;
  const html = `
    <h2>Fraude detectada: ${escapeHtml(payload.flagType)}</h2>
    <p><strong>Severity:</strong> ${escapeHtml(String(payload.severity))}</p>
    <p><strong>Entity:</strong> ${escapeHtml(payload.entityId)}</p>
    <pre>${escapeHtml(JSON.stringify(payload.details, null, 2))}</pre>
    <p><a href="${escapeHtml(adminUrl)}">Open admin view</a></p>
  `;
  try {
    await sendEmail({
      to: adminEmail(),
      subject: `[Fraud] ${payload.flagType} (${payload.severity})`,
      html,
    });
  } catch (err) {
    // Alerts are best-effort; DB flags are the source of truth.
    // eslint-disable-next-line no-console
    console.error('[fraud:alert] email send failed (swallowed):', err);
  }
};
