import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('@/lib/email/provider', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'p1', provider: 'none' }),
}))

import * as provider from '@/lib/email/provider'
import { ResendAffiliateEmailService } from '@/lib/affiliate/email-service'

describe('ResendAffiliateEmailService', () => {
  const svc = new ResendAffiliateEmailService()
  const originalAdminEmail = process.env.AFFILIATE_ADMIN_EMAIL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AFFILIATE_ADMIN_EMAIL = 'admin@brighttale.test'
  })

  afterAll(() => {
    if (originalAdminEmail === undefined) {
      delete process.env.AFFILIATE_ADMIN_EMAIL
    } else {
      process.env.AFFILIATE_ADMIN_EMAIL = originalAdminEmail
    }
  })

  it('sendAffiliateApplicationReceivedAdmin sends to AFFILIATE_ADMIN_EMAIL', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'Maria', email: 'maria@example.com',
      channelPlatform: 'youtube', channelUrl: 'https://youtube.com/maria',
    })
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@brighttale.test',
      subject: expect.stringContaining('Maria'),
    }))
  })

  it('escapes HTML in user-controlled fields (XSS guard)', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: '<script>alert(1)</script>', email: 'x@y.com',
      channelPlatform: 'youtube', channelUrl: 'https://y.com',
    })
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).not.toContain('<script>')
    expect(arg.html).toContain('&lt;script&gt;')
  })

  it('rewrites javascript: URLs to # in href', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'javascript:alert(1)',
    })
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
  })

  it('sendAffiliateApprovalEmail includes tier + commission percent', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João', 'nano', 0.15, 'https://app.com')
    expect(provider.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'joao@x.com',
      html: expect.stringContaining('15%'),
    }))
  })

  it('sendAffiliateContractProposalEmail includes both currentRate AND proposedRate as percentages', async () => {
    await svc.sendAffiliateContractProposalEmail(
      'pedro@x.com', 'Pedro',
      'nano', 0.15,
      'micro', 0.20,
      'https://app.com/portal',
      'upgrade offer',
    )
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.to).toBe('pedro@x.com')
    expect(arg.html).toContain('15%')
    expect(arg.html).toContain('20%')
    expect(arg.html).toContain('Pedro')
  })

  it('sendAffiliateApprovalEmail body includes recipient name', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João Silva', 'nano', 0.15, 'https://app.com')
    const arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('João Silva')
  })

  it('safeUrl rejects vbscript: and data: schemes (rendered as #)', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'vbscript:msgbox(1)',
    })
    let arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
    expect(arg.html).not.toContain('href="vbscript:')

    vi.clearAllMocks()
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'data:text/html,<script>alert(1)</script>',
    })
    arg = vi.mocked(provider.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
    expect(arg.html).not.toContain('href="data:')
  })
})
