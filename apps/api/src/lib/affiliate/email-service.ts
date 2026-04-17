import type { IAffiliateEmailService, AffiliateTier } from '@tn-figueiredo/affiliate'
import { sendEmail } from '@/lib/email/provider'

function adminEmail(): string {
  return process.env.AFFILIATE_ADMIN_EMAIL ?? 'admin@brighttale.io'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(s: string): string {
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '#'
    return escapeHtml(u.toString())
  } catch {
    return '#'
  }
}

export class ResendAffiliateEmailService implements IAffiliateEmailService {
  async sendAffiliateApplicationReceivedAdmin(data: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): Promise<void> {
    await sendEmail({
      to: adminEmail(),
      subject: `Nova aplicação de afiliado: ${data.name}`,
      html: this.renderApplicationReceivedAdmin(data),
    })
  }

  async sendAffiliateApplicationConfirmation(email: string, name: string): Promise<void> {
    await sendEmail({
      to: email,
      subject: 'Recebemos sua aplicação de afiliado BrightTale',
      html: this.renderApplicationConfirmation(name),
    })
  }

  async sendAffiliateApprovalEmail(
    email: string, name: string, tier: AffiliateTier, commissionRate: number,
    portalUrl: string, fixedFeeBrl?: number | null,
  ): Promise<void> {
    await sendEmail({
      to: email,
      subject: '🎉 Sua aplicação de afiliado foi aprovada',
      html: this.renderApproval(name, tier, commissionRate, portalUrl, fixedFeeBrl ?? null),
    })
  }

  async sendAffiliateContractProposalEmail(
    email: string, name: string,
    currentTier: AffiliateTier, currentRate: number,
    proposedTier: AffiliateTier, proposedRate: number,
    portalUrl: string, notes?: string,
    currentFixedFeeBrl?: number | null, proposedFixedFeeBrl?: number | null,
  ): Promise<void> {
    await sendEmail({
      to: email,
      subject: 'Nova proposta de contrato de afiliado',
      html: this.renderContractProposal(
        name, currentTier, currentRate, proposedTier, proposedRate, portalUrl,
        notes, currentFixedFeeBrl ?? null, proposedFixedFeeBrl ?? null,
      ),
    })
  }

  private renderApplicationReceivedAdmin(d: {
    name: string; email: string; channelPlatform: string; channelUrl: string
    subscribersCount?: number; suggestedCode?: string; notes?: string
  }): string {
    const url = safeUrl(d.channelUrl)
    const subs = d.subscribersCount ? `<p>${d.subscribersCount} inscritos</p>` : ''
    const code = d.suggestedCode ? `<p>Sugestão de código: <code>${escapeHtml(d.suggestedCode)}</code></p>` : ''
    const notes = d.notes ? `<p><em>${escapeHtml(d.notes)}</em></p>` : ''
    return `<h1>Nova aplicação de afiliado</h1>
<p><strong>${escapeHtml(d.name)}</strong> (${escapeHtml(d.email)})</p>
<p>${escapeHtml(d.channelPlatform)}: <a href="${url}">${escapeHtml(d.channelUrl)}</a></p>
${subs}${code}${notes}`
  }

  private renderApplicationConfirmation(name: string): string {
    return `<h1>Olá ${escapeHtml(name)}</h1>
<p>Recebemos sua aplicação de afiliado. Vamos analisar e responder em breve por email.</p>
<p>— Equipe BrightTale</p>`
  }

  private renderApproval(name: string, tier: string, rate: number, portalUrl: string, fee: number | null): string {
    const feeLine = fee ? ` + R$${fee.toFixed(2)} fixo` : ''
    return `<h1>Bem-vindo ao programa de afiliados, ${escapeHtml(name)}! 🎉</h1>
<p>Você foi aprovado no tier <strong>${escapeHtml(tier)}</strong> com comissão de <strong>${(rate * 100).toFixed(0)}%</strong>${feeLine}.</p>
<p><a href="${safeUrl(portalUrl)}">Acessar portal de afiliado →</a></p>
<p>— Equipe BrightTale</p>`
  }

  private renderContractProposal(
    name: string, currentTier: string, currentRate: number,
    proposedTier: string, proposedRate: number, portalUrl: string,
    notes?: string, currentFee?: number | null, proposedFee?: number | null,
  ): string {
    const cf = currentFee ? ` + R$${currentFee.toFixed(2)}` : ''
    const pf = proposedFee ? ` + R$${proposedFee.toFixed(2)}` : ''
    const notesLine = notes ? `<p><em>${escapeHtml(notes)}</em></p>` : ''
    return `<h1>Nova proposta de contrato — ${escapeHtml(name)}</h1>
<p><strong>Atual:</strong> ${escapeHtml(currentTier)} (${(currentRate * 100).toFixed(0)}%${cf})</p>
<p><strong>Proposto:</strong> ${escapeHtml(proposedTier)} (${(proposedRate * 100).toFixed(0)}%${pf})</p>
${notesLine}
<p><a href="${safeUrl(portalUrl)}">Ver proposta no portal →</a></p>`
  }
}
