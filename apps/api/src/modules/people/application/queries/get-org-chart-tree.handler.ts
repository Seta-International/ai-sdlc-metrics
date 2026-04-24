import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { OrgChartQueryService } from '../services/org-chart-query.service'
import type { OrgChartTreeDto } from './org-chart.types'
import { GetOrgChartTreeQuery } from './get-org-chart-tree.query'

@QueryHandler(GetOrgChartTreeQuery)
export class GetOrgChartTreeHandler implements IQueryHandler<
  GetOrgChartTreeQuery,
  OrgChartTreeDto
> {
  constructor(private readonly orgChart: OrgChartQueryService) {}

  execute(query: GetOrgChartTreeQuery): Promise<OrgChartTreeDto> {
    return this.orgChart.getTree(query.tenantId, query.actorId, {
      teamId: query.teamId,
      depth: query.depth,
    })
  }
}
