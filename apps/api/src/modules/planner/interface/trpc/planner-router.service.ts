import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { TRPCError } from '@trpc/server'
import { AdminQueryFacade } from '../../../admin/application/facades/admin-query.facade'
import type { PlannerViewFlags } from '../../../admin/application/queries/planner-view-flags.types'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

const MS_SYNC_BACKFILL_PROGRESS_EVENT = 'planner.ms_sync.backfill_progress'

let instance: PlannerRouterService | null = null

@Injectable()
export class PlannerRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly adminQueryFacade: AdminQueryFacade,
    private readonly kernelAuditFacade: KernelAuditFacade,
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

  async assertPersonalEnabled(tenantId: string): Promise<void> {
    const flags = await this.adminQueryFacade.getPlannerViewFlags(tenantId)
    if (!flags.personalEnabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Personal Hubs is not enabled for this tenant',
      })
    }
  }

  async assertRostersEnabled(tenantId: string): Promise<void> {
    const flags = await this.adminQueryFacade.getPlannerViewFlags(tenantId)
    if (!flags.msSyncRostersEnabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Roster sync is not enabled for this tenant',
      })
    }
  }

  getPlannerViewFlags(tenantId: string): Promise<PlannerViewFlags> {
    return this.adminQueryFacade.getPlannerViewFlags(tenantId)
  }

  async getBackfillProgress(
    jobId: string,
  ): Promise<{ processed: number; total: number; completed: boolean } | null> {
    const payload = (await this.kernelAuditFacade.getLatestOutboxPayload(
      jobId,
      MS_SYNC_BACKFILL_PROGRESS_EVENT,
    )) as { processed: number; total: number } | null
    if (!payload) return null
    const { processed, total } = payload
    return { processed, total, completed: total > 0 && processed >= total }
  }

  command<T>(command: T): Promise<unknown> {
    return this.commandBus.execute(command as never)
  }

  query<T>(query: T): Promise<unknown> {
    return this.queryBus.execute(query as never)
  }
}
