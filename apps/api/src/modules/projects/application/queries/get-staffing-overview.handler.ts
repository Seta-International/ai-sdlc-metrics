import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ALLOCATION_REPOSITORY,
  type IAllocationRepository,
} from '../../domain/repositories/allocation.repository.port'
import { GetStaffingOverviewQuery } from './get-staffing-overview.query'

export interface StaffingOverviewEntry {
  actorId: string
  confirmedHoursPerDay: number
  standardHoursPerDay: number
  utilizationPercent: number
}

export interface GetStaffingOverviewResult {
  entries: StaffingOverviewEntry[]
}

@QueryHandler(GetStaffingOverviewQuery)
export class GetStaffingOverviewHandler implements IQueryHandler<
  GetStaffingOverviewQuery,
  GetStaffingOverviewResult
> {
  constructor(@Inject(ALLOCATION_REPOSITORY) private readonly allocRepo: IAllocationRepository) {}

  async execute(query: GetStaffingOverviewQuery): Promise<GetStaffingOverviewResult> {
    // NOTE: In a full implementation, this would iterate over all active actors
    // from PeopleQueryFacade, then call sumConfirmedHoursPerDay for each.
    // Standard hours default to 8h (or from TimeQueryFacade when available).
    // This is a simplified version — the full implementation requires
    // PeopleQueryFacade.listActiveActors() which returns all active employment profiles.
    return { entries: [] }
  }
}
