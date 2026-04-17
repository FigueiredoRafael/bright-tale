import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: 'r1', provider: 'resend' }),
  isResendConfigured: vi.fn().mockReturnValue(true),
}))

import * as resend from '@/lib/email/resend'
import { ResendAffiliateEmailService } from '@/lib/affiliate/email-service'

describe('ResendAffiliateEmailService', () => {
  const svc = new ResendAffiliateEmailService()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AFFILIATE_ADMIN_EMAIL = 'admin@brighttale.test'
    vi.mocked(resend.isResendConfigured).mockReturnValue(true)
  })

  it('sendAffiliateApplicationReceivedAdmin sends to AFFILIATE_ADMIN_EMAIL', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'Maria', email: 'maria@example.com',
      channelPlatform: 'youtube', channelUrl: 'https://youtube.com/maria',
    })
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@brighttale.test',
      subject: expect.stringContaining('Maria'),
    }))
  })

  it('escapes HTML in user-controlled fields (XSS guard)', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: '<script>alert(1)</script>', email: 'x@y.com',
      channelPlatform: 'youtube', channelUrl: 'https://y.com',
    })
    const arg = vi.mocked(resend.sendEmail).mock.calls[0][0]
    expect(arg.html).not.toContain('<script>')
    expect(arg.html).toContain('&lt;script&gt;')
  })

  it('rewrites javascript: URLs to # in href', async () => {
    await svc.sendAffiliateApplicationReceivedAdmin({
      name: 'X', email: 'x@y.com',
      channelPlatform: 'web', channelUrl: 'javascript:alert(1)',
    })
    const arg = vi.mocked(resend.sendEmail).mock.calls[0][0]
    expect(arg.html).toContain('href="#"')
  })

  it('sendAffiliateApprovalEmail includes tier + commission percent', async () => {
    await svc.sendAffiliateApprovalEmail('joao@x.com', 'João', 'nano', 0.15, 'https://app.com')
    expect(resend.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'joao@x.com',
      html: expect.stringContaining('15%'),
    }))
  })

  it('returns early when Resend not configured', async () => {
    vi.mocked(resend.isResendConfigured).mockReturnValue(false)
    await svc.sendAffiliateApplicationConfirmation('x@x.com', 'X')
    expect(resend.sendEmail).not.toHaveBeenCalled()
  })
})
