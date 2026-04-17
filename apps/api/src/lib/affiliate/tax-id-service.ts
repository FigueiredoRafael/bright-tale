import type { IAffiliateTaxIdRepository } from '@tn-figueiredo/affiliate'

export class StubTaxIdRepository implements IAffiliateTaxIdRepository {
  async findByEntity(_entityType: string, _entityId: string) {
    return null
  }

  async save(_data: Parameters<IAffiliateTaxIdRepository['save']>[0]): Promise<void> {
    // no-op — real Tax ID storage deferred to Phase 2F (Receita Federal API)
  }

  async getStatus(_taxId: string) {
    return { status: 'regular' as const }
  }
}
