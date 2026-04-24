/**
 * Minimal SMTP send wrapper for apps/web Server Actions.
 *
 * Mirrors the abstraction from apps/api/src/lib/email/provider.ts but
 * kept intentionally small — apps/web sends only operational / admin
 * emails (manager-promoted, ops notifications). Transactional user
 * email (affiliates, credits, content published) stays in apps/api.
 *
 * Reads the same SMTP_* env vars as apps/api. See
 * docs/security/EMAIL-CONFIG.md for provisioning.
 */

import nodemailer, { type Transporter } from 'nodemailer'

let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (_transporter) return _transporter
  const host = process.env.SMTP_HOST
  const portStr = process.env.SMTP_PORT
  if (!host || !portStr) {
    throw new Error(
      '[email:web] SMTP_HOST / SMTP_PORT missing. Set apps/web/.env.local (see docs/security/EMAIL-CONFIG.md).',
    )
  }
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(portStr, 10),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    pool: true,
  })
  return _transporter
}

export interface SendResult {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(params: {
  to: string | string[]
  subject: string
  html?: string
  text?: string
}): Promise<SendResult> {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
