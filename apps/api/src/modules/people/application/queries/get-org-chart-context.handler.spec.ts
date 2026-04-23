import { describe, expect, it, vi } from 'vitest'
import { GetOrgChartContextHandler } from './get-org-chart-context.handler'
import { GetOrgChartContextQuery } from './get-org-chart-context.query'

describe('GetOrgChartContextHandler', () => {
  it('delegates to OrgChartQueryService with tenant and actor ids', async () => {
    const service = {
      getContext: vi.fn().mockResolvedValue({
        nodes: [],
        rootEmploymentIds: [],
        focusEmploymentId: null,
      }),
    }
    const handler = new GetOrgChartContextHandler(service as never)

    const result = await handler.execute(new GetOrgChartContextQuery('tenant-1', 'actor-1'))

    expect(service.getContext).toHaveBeenCalledWith('tenant-1', 'actor-1')
    expect(result).toEqual({ nodes: [], rootEmploymentIds: [], focusEmploymentId: null })
  })
})
