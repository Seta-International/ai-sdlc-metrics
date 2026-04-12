import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetCapacityReportQuery } from './get-capacity-report.query'

export interface CapacityEntry {
  actorId: string
  confirmedHoursPerDay: number
  standardHoursPerDay: number
  utilizationPercent: number
  category: 'bench' | 'available' | 'normal' | 'over_allocated'
}

export interface GetCapacityReportResult {
  entries: CapacityEntry[]
  bench: CapacityEntry[]
  overAllocated: CapacityEntry[]
}

@QueryHandler(GetCapacityReportQuery)
export class GetCapacityReportHandler implements IQueryHandler<
  GetCapacityReportQuery,
  GetCapacityReportResult
> {
  async execute(_query: GetCapacityReportQuery): Promise<GetCapacityReportResult> {
    // NOTE: Full implementation requires PeopleQueryFacade.listActiveActors().
    // For each actor, calls sumConfirmedHoursPerDay(actorId, tenantId, startDate, endDate)
    // with the report's date range, then classifies:
    //   bench: utilization < 20%
    //   over_allocated: utilization > 100%
    //   available: 20% <= utilization < 80%
    //   normal: 80% <= utilization <= 100%
    // Standard hours default to 8h (or from TimeQueryFacade when available).
    return { entries: [], bench: [], overAllocated: [] }
  }
}
