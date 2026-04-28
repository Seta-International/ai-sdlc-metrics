import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantSettings } from '../../infrastructure/schema/admin.schema'
import { GetPlannerViewFlagsQuery } from './get-planner-view-flags.query'
import type { PlannerViewFlags } from './planner-view-flags.types'

export type { PlannerViewFlags }

@Injectable()
@QueryHandler(GetPlannerViewFlagsQuery)
export class GetPlannerViewFlagsHandler implements IQueryHandler<
  GetPlannerViewFlagsQuery,
  PlannerViewFlags
> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetPlannerViewFlagsQuery): Promise<PlannerViewFlags> {
    const rows = await this.db
      .select({
        plannerViewsEnabled: tenantSettings.plannerViewsEnabled,
        plannerGridEnabled: tenantSettings.plannerGridEnabled,
        plannerScheduleEnabled: tenantSettings.plannerScheduleEnabled,
        plannerChartsEnabled: tenantSettings.plannerChartsEnabled,
        plannerChartsTrendsEnabled: tenantSettings.plannerChartsTrendsEnabled,
        plannerPersonalEnabled: tenantSettings.plannerPersonalEnabled,
        plannerMsSyncEnabled: tenantSettings.plannerMsSyncEnabled,
        plannerMsSyncAttachmentsEnabled: tenantSettings.plannerMsSyncAttachmentsEnabled,
        plannerMsSyncRostersEnabled: tenantSettings.plannerMsSyncRostersEnabled,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, query.tenantId))
      .limit(1)

    const row = rows[0]
    return {
      viewsEnabled: row?.plannerViewsEnabled ?? false,
      gridEnabled: row?.plannerGridEnabled ?? false,
      scheduleEnabled: row?.plannerScheduleEnabled ?? false,
      chartsEnabled: row?.plannerChartsEnabled ?? false,
      trendsEnabled: row?.plannerChartsTrendsEnabled ?? false,
      personalEnabled: row?.plannerPersonalEnabled ?? false,
      msSyncEnabled: row?.plannerMsSyncEnabled ?? false,
      msSyncAttachmentsEnabled: row?.plannerMsSyncAttachmentsEnabled ?? true,
      msSyncRostersEnabled: row?.plannerMsSyncRostersEnabled ?? false,
    }
  }
}
