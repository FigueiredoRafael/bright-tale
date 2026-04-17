import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

// Capture constructor args across rebuilds. Must be mocked BEFORE the module
// imports — vi.mock is hoisted by vitest.
const attributeCtorCalls: unknown[][] = []

vi.mock('@/lib/supabase', () => ({
  createServiceClient: vi.fn(() => ({})),
}))

vi.mock('@tn-figueiredo/affiliate', async () => {
  const actual = await vi.importActual<typeof import('@tn-figueiredo/affiliate')>(
    '@tn-figueiredo/affiliate',
  )
  return {
    ...actual,
    AttributeSignupToAffiliateUseCase: class {
      constructor(...args: unknown[]) {
        attributeCtorCalls.push(args)
      }
    },
  }
})

import { __resetAffiliateContainer, buildAffiliateContainer } from '@/lib/affiliate/container'

describe('AffiliateContainer — fraud service gating (2E)', () => {
  const originalFlag = process.env.FRAUD_DETECTION_ENABLED

  beforeEach(() => {
    attributeCtorCalls.length = 0
    __resetAffiliateContainer()
  })

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.FRAUD_DETECTION_ENABLED
    else process.env.FRAUD_DETECTION_ENABLED = originalFlag
    __resetAffiliateContainer()
  })

  it('passes a non-undefined fraud service when FRAUD_DETECTION_ENABLED=true', () => {
    process.env.FRAUD_DETECTION_ENABLED = 'true'
    buildAffiliateContainer()
    expect(attributeCtorCalls.length).toBe(1)
    const thirdArg = attributeCtorCalls[0][2]
    expect(thirdArg).toBeDefined()
    expect(typeof (thirdArg as { checkSelfReferral?: unknown }).checkSelfReferral).toBe('function')
  })

  it('passes undefined when FRAUD_DETECTION_ENABLED unset (parity with 2A)', () => {
    delete process.env.FRAUD_DETECTION_ENABLED
    buildAffiliateContainer()
    expect(attributeCtorCalls[0][2]).toBeUndefined()
  })

  it('passes undefined when FRAUD_DETECTION_ENABLED=false', () => {
    process.env.FRAUD_DETECTION_ENABLED = 'false'
    buildAffiliateContainer()
    expect(attributeCtorCalls[0][2]).toBeUndefined()
  })
})
