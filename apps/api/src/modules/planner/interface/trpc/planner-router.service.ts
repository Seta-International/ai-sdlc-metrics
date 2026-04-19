import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { TRPCError } from '@trpc/server'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'

let instance: PlannerRouterService | null = null

@Injectable()
export class PlannerRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    readonly adminQuery: AdminQueryFacade,
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
    const enabled = await this.adminQuery.isPlannerEnabled(tenantId)
    if (!enabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Planner is not enabled for this tenant',
      })
    }
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
