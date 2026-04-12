import { beforeEach, describe, expect, it } from 'vitest'
import { GetStaffingOverviewQuery } from './get-staffing-overview.query'
import { GetStaffingOverviewHandler } from './get-staffing-overview.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('GetStaffingOverviewHandler', () => {
  let handler: GetStaffingOverviewHandler

  beforeEach(() => {
    handler = new GetStaffingOverviewHandler()
  })

  it('returns staffing overview entries', async () => {
    const result = await handler.execute(
      new GetStaffingOverviewQuery(TENANT_ID, new Date('2026-01-01'), new Date('2026-12-31')),
    )

    expect(result.entries).toEqual([])
  })
})
