import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetDirectReportsQuery } from './get-direct-reports.query'

export type DirectReportResult = {
  employmentId: string
  fullName: string
  jobTitle: string | null
  avatarUrl: string | null
}

// TODO: replace with real job_assignment query once activity logging is wired
@QueryHandler(GetDirectReportsQuery)
export class GetDirectReportsHandler implements IQueryHandler<
  GetDirectReportsQuery,
  DirectReportResult[]
> {
  async execute(_query: GetDirectReportsQuery): Promise<DirectReportResult[]> {
    return []
  }
}
