import { beforeEach, describe, expect, it } from 'vitest'
import { GetCapacityReportQuery } from './get-capacity-report.query'
import { GetCapacityReportHandler } from './get-capacity-report.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('GetCapacityReportHandler', () => {
  let handler: GetCapacityReportHandler

  beforeEach(() => {
    handler = new GetCapacityReportHandler()
  })

  it('returns capacity report with date-range-aware data', async () => {
    const result = await handler.execute(
      new GetCapacityReportQuery(TENANT_ID, new Date('2026-04-01'), new Date('2026-04-30')),
    )

    expect(result.entries).toEqual([])
    expect(result.bench).toEqual([])
    expect(result.overAllocated).toEqual([])
  })
})
