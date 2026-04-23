import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { OrgChartQueryService } from '../services/org-chart-query.service'
import { GetOrgChartChildrenQuery } from './get-org-chart-children.query'
import type { OrgChartNodeDto } from './org-chart.types'

@QueryHandler(GetOrgChartChildrenQuery)
export class GetOrgChartChildrenHandler implements IQueryHandler<
  GetOrgChartChildrenQuery,
  OrgChartNodeDto[]
> {
  constructor(private readonly orgChart: OrgChartQueryService) {}

  execute(query: GetOrgChartChildrenQuery): Promise<OrgChartNodeDto[]> {
    return this.orgChart.getChildren(query.tenantId, query.employmentId)
  }
}
