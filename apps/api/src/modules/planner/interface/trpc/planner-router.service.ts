import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { TRPCError } from '@trpc/server'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import type { PlannerViewFlags } from '../../../admin/application/queries/planner-view-flags.types'

let instance: PlannerRouterService | null = null

@Injectable()
export class PlannerRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly adminQueryFacade: AdminQueryFacade,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): PlannerRouterService {
    if (!instance) throw new Error('PlannerRouterService not initialized')
    return instance
  }

  async assertPlannerEnabled(tenantId: string): Promise<void> {
    const enabled = await this.adminQueryFacade.isPlannerEnabled(tenantId)
    if (!enabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Planner is not enabled for this tenant',
      })
    }
  }

  getPlannerViewFlags(tenantId: string): Promise<PlannerViewFlags> {
    return this.adminQueryFacade.getPlannerViewFlags(tenantId)
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
