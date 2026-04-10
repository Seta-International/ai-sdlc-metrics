import { Injectable } from '@nestjs/common'

/**
 * KernelQueryFacade is the only cross-module import allowed from the kernel.
 * No module imports kernel repositories or entities directly.
 */
@Injectable()
export class KernelQueryFacade {
  // TODO: implement actor lookup, role checks, delegation resolution
  async getActor(_tenantId: string, _actorId: string): Promise<null> {
    return null
  }

  async hasRole(_tenantId: string, _actorId: string, _role: string): Promise<boolean> {
    return false
  }
}
