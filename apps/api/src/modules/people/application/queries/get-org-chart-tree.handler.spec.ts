import { describe, expect, it, vi } from 'vitest'
import { GetOrgChartTreeHandler } from './get-org-chart-tree.handler'
import { GetOrgChartTreeQuery } from './get-org-chart-tree.query'

describe('GetOrgChartTreeHandler', () => {
  it('delegates tree query to service with tenant/actor/team/depth', async () => {
    const service = {
      getTree: vi.fn().mockResolvedValue({
        rootIds: [],
        nodesById: {},
        childrenByParentId: {},
        focusEmploymentId: null,
      }),
    }
    const handler = new GetOrgChartTreeHandler(service as never)
    await handler.execute(new GetOrgChartTreeQuery('tenant-1', 'actor-1', null, 3))
    expect(service.getTree).toHaveBeenCalledWith('tenant-1', 'actor-1', { teamId: null, depth: 3 })
  })
})
