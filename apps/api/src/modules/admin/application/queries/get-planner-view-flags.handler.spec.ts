import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@future/db'
import { vi } from 'vitest'
import { GetPlannerViewFlagsQuery } from './get-planner-view-flags.query'
import { GetPlannerViewFlagsHandler } from './get-planner-view-flags.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const OTHER_TENANT_ID = '01900000-0000-7000-8000-000000000002'

function makeDb(
  rows: Array<{
    plannerViewsEnabled: boolean
    plannerGridEnabled: boolean
    plannerScheduleEnabled: boolean
    plannerChartsEnabled: boolean
    plannerChartsTrendsEnabled: boolean
    plannerPersonalEnabled: boolean
    plannerMsSyncEnabled: boolean
    plannerMsSyncAttachmentsEnabled: boolean
  }>,
): Db {
  const selectFn = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  })
  return { select: selectFn } as unknown as Db
}

describe('GetPlannerViewFlagsHandler', () => {
  let handler: GetPlannerViewFlagsHandler

  describe('when no tenant_settings row exists', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(makeDb([]))
    })

    it('returns all flags as false (msSyncAttachmentsEnabled defaults true)', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(OTHER_TENANT_ID))
      expect(result).toEqual({
        viewsEnabled: false,
        gridEnabled: false,
        scheduleEnabled: false,
        chartsEnabled: false,
        trendsEnabled: false,
        personalEnabled: false,
        msSyncEnabled: false,
        msSyncAttachmentsEnabled: true,
      })
    })
  })

  describe('when row exists with plannerViewsEnabled = true, others false', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(
        makeDb([
          {
            plannerViewsEnabled: true,
            plannerGridEnabled: false,
            plannerScheduleEnabled: false,
            plannerChartsEnabled: false,
            plannerChartsTrendsEnabled: false,
            plannerPersonalEnabled: false,
            plannerMsSyncEnabled: false,
            plannerMsSyncAttachmentsEnabled: false,
          },
        ]),
      )
    })

    it('returns viewsEnabled = true and others = false', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))
      expect(result).toEqual({
        viewsEnabled: true,
        gridEnabled: false,
        scheduleEnabled: false,
        chartsEnabled: false,
        trendsEnabled: false,
        personalEnabled: false,
        msSyncEnabled: false,
        msSyncAttachmentsEnabled: false,
      })
    })
  })

  describe('when row exists with all flags enabled', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(
        makeDb([
          {
            plannerViewsEnabled: true,
            plannerGridEnabled: true,
            plannerScheduleEnabled: true,
            plannerChartsEnabled: true,
            plannerChartsTrendsEnabled: true,
            plannerPersonalEnabled: true,
            plannerMsSyncEnabled: true,
            plannerMsSyncAttachmentsEnabled: true,
          },
        ]),
      )
    })

    it('returns all flags as true', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))
      expect(result).toEqual({
        viewsEnabled: true,
        gridEnabled: true,
        scheduleEnabled: true,
        chartsEnabled: true,
        trendsEnabled: true,
        personalEnabled: true,
        msSyncEnabled: true,
        msSyncAttachmentsEnabled: true,
      })
    })
  })

  describe('when row exists with trendsEnabled = true only', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(
        makeDb([
          {
            plannerViewsEnabled: false,
            plannerGridEnabled: false,
            plannerScheduleEnabled: false,
            plannerChartsEnabled: false,
            plannerChartsTrendsEnabled: true,
            plannerPersonalEnabled: false,
            plannerMsSyncEnabled: false,
            plannerMsSyncAttachmentsEnabled: false,
          },
        ]),
      )
    })

    it('returns trendsEnabled = true and others = false', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))
      expect(result).toEqual({
        viewsEnabled: false,
        gridEnabled: false,
        scheduleEnabled: false,
        chartsEnabled: false,
        trendsEnabled: true,
        personalEnabled: false,
        msSyncEnabled: false,
        msSyncAttachmentsEnabled: false,
      })
    })
  })

  describe('when row exists with plannerPersonalEnabled = true only', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(
        makeDb([
          {
            plannerViewsEnabled: false,
            plannerGridEnabled: false,
            plannerScheduleEnabled: false,
            plannerChartsEnabled: false,
            plannerChartsTrendsEnabled: false,
            plannerPersonalEnabled: true,
            plannerMsSyncEnabled: false,
            plannerMsSyncAttachmentsEnabled: false,
          },
        ]),
      )
    })

    it('returns personalEnabled = true and others = false', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))
      expect(result).toEqual({
        viewsEnabled: false,
        gridEnabled: false,
        scheduleEnabled: false,
        chartsEnabled: false,
        trendsEnabled: false,
        personalEnabled: true,
        msSyncEnabled: false,
        msSyncAttachmentsEnabled: false,
      })
    })
  })

  describe('when row exists with plannerMsSyncAttachmentsEnabled = false (kill-switch off)', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(
        makeDb([
          {
            plannerViewsEnabled: false,
            plannerGridEnabled: false,
            plannerScheduleEnabled: false,
            plannerChartsEnabled: false,
            plannerChartsTrendsEnabled: false,
            plannerPersonalEnabled: false,
            plannerMsSyncEnabled: true,
            plannerMsSyncAttachmentsEnabled: false,
          },
        ]),
      )
    })

    it('returns msSyncAttachmentsEnabled = false', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))
      expect(result.msSyncAttachmentsEnabled).toBe(false)
    })
  })

  describe('when row exists with plannerMsSyncEnabled = true only', () => {
    beforeEach(() => {
      handler = new GetPlannerViewFlagsHandler(
        makeDb([
          {
            plannerViewsEnabled: false,
            plannerGridEnabled: false,
            plannerScheduleEnabled: false,
            plannerChartsEnabled: false,
            plannerChartsTrendsEnabled: false,
            plannerPersonalEnabled: false,
            plannerMsSyncEnabled: true,
            plannerMsSyncAttachmentsEnabled: false,
          },
        ]),
      )
    })

    it('returns msSyncEnabled = true and others = false', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))
      expect(result).toEqual({
        viewsEnabled: false,
        gridEnabled: false,
        scheduleEnabled: false,
        chartsEnabled: false,
        trendsEnabled: false,
        personalEnabled: false,
        msSyncEnabled: true,
        msSyncAttachmentsEnabled: false,
      })
    })
  })
})
