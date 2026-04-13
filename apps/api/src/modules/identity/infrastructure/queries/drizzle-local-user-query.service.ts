import { Injectable } from '@nestjs/common'
import type { ILocalUserQueryPort, LocalUserDto } from '../../domain/ports/local-user-query.port'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

@Injectable()
export class DrizzleLocalUserQueryService implements ILocalUserQueryPort {
  constructor(private readonly kernelQueryFacade: KernelQueryFacade) {}

  async listByTenantId(tenantId: string): Promise<LocalUserDto[]> {
    const users = await this.kernelQueryFacade.getLocalUsersWithActors(tenantId)
    return users as LocalUserDto[]
  }
}
