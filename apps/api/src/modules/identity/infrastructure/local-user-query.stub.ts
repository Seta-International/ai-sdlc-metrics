import type { ILocalUserQueryPort, LocalUserDto } from '../domain/ports/local-user-query.port'

export class LocalUserQueryStub implements ILocalUserQueryPort {
  async listByTenantId(_tenantId: string): Promise<LocalUserDto[]> {
    return []
  }
}
