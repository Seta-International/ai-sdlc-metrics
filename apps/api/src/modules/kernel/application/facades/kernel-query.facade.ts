import { Injectable } from '@nestjs/common'

/**
 * KernelQueryFacade is the only cross-module import allowed from the kernel.
 * No module imports kernel repositories or entities directly.
 */
@Injectable()
export class KernelQueryFacade {
  // TODO: implement actor lookup, role checks, delegation resolution
  async getActor(tenantId: string, actorId: string): Promise<null> {
    return null
  }

  async hasRole(tenantId: string, actorId: string, role: string): Promise<boolean> {
    return false
  }
}
