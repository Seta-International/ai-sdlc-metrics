import { Injectable } from '@nestjs/common'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { TenantListerLike } from '../../application/services/conversation-retention-scheduler'

@Injectable()
export class KernelTenantLister implements TenantListerLike {
  constructor(private readonly kernel: KernelQueryFacade) {}

  async listActiveTenantIds(): Promise<string[]> {
    return this.kernel.listActiveTenantIds()
  }
}
