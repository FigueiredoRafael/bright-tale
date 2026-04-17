import { describe, it, expect } from 'vitest'
import { StubTaxIdRepository } from '@/lib/affiliate/tax-id-service'

describe('StubTaxIdRepository', () => {
  const repo = new StubTaxIdRepository()

  it('findByEntity returns null', async () => {
    expect(await repo.findByEntity('user', 'abc')).toBeNull()
  })

  it('save is no-op', async () => {
    await expect(repo.save({
      entityType: 'user', entityId: 'abc', taxId: '123', taxIdType: 'cpf',
      status: 'regular', legalName: null, lastCheckedAt: null,
    })).resolves.toBeUndefined()
  })

  it('getStatus returns regular', async () => {
    expect(await repo.getStatus('123.456.789-00')).toEqual({ status: 'regular' })
  })
})
