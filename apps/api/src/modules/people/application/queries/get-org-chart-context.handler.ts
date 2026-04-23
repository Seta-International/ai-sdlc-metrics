import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { OrgChartQueryService } from '../services/org-chart-query.service'
import { GetOrgChartContextQuery } from './get-org-chart-context.query'
import type { OrgChartContextDto } from './org-chart.types'

@QueryHandler(GetOrgChartContextQuery)
export class GetOrgChartContextHandler implements IQueryHandler<
  GetOrgChartContextQuery,
  OrgChartContextDto
> {
  constructor(private readonly orgChart: OrgChartQueryService) {}

  execute(query: GetOrgChartContextQuery): Promise<OrgChartContextDto> {
    return this.orgChart.getContext(query.tenantId, query.actorId)
  }
}
