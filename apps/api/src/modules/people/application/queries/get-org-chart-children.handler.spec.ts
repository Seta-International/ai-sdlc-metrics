import { describe, expect, it, vi } from 'vitest'
import { GetOrgChartChildrenHandler } from './get-org-chart-children.handler'
import { GetOrgChartChildrenQuery } from './get-org-chart-children.query'

describe('GetOrgChartChildrenHandler', () => {
  it('delegates to OrgChartQueryService with tenant and employment ids', async () => {
    const service = { getChildren: vi.fn().mockResolvedValue([]) }
    const handler = new GetOrgChartChildrenHandler(service as never)

    const result = await handler.execute(new GetOrgChartChildrenQuery('tenant-1', 'employment-1'))

    expect(service.getChildren).toHaveBeenCalledWith('tenant-1', 'employment-1')
    expect(result).toEqual([])
  })
})
