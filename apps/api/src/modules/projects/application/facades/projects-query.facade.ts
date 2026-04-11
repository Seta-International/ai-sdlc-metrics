import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { Allocation } from '../../domain/entities/allocation.entity'
import type { GetAccountStaffingResult } from '../queries/get-account-staffing.handler'
import { GetPersonAllocationsQuery } from '../queries/get-person-allocations.query'
import { GetAccountStaffingQuery } from '../queries/get-account-staffing.query'

/**
 * ProjectsQueryFacade is the only cross-module import allowed from the projects module.
 * Other modules use this to read staffing/allocation data.
 */
@Injectable()
export class ProjectsQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getPersonAllocations(actorId: string, tenantId: string): Promise<Allocation[]> {
    return this.queryBus.execute(new GetPersonAllocationsQuery(actorId, tenantId))
  }

  getAccountStaffing(accountId: string, tenantId: string): Promise<GetAccountStaffingResult> {
    return this.queryBus.execute(new GetAccountStaffingQuery(accountId, tenantId))
  }

  /**
   * Returns total confirmed hours/day for an actor within a date range.
   * Used by other modules (e.g. Time) to check capacity before approving leave.
   */
  async sumConfirmedHoursForActor(
    actorId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Delegates directly to the allocation repository via a query.
    // In production, this would use a dedicated query handler.
    // For now, this is a convenience method that other modules can call.
    const allocations = await this.getPersonAllocations(actorId, tenantId)
    return allocations
      .filter((a) => a.status === 'confirmed')
      .filter((a) => a.startedAt <= endDate && (a.endedAt === null || a.endedAt >= startDate))
      .reduce((sum, a) => sum + Number(a.hoursPerDay), 0)
  }
}
