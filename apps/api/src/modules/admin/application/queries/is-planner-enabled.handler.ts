import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantSettings } from '../../infrastructure/schema/admin.schema'
import { IsPlannerEnabledQuery } from './is-planner-enabled.query'

@Injectable()
@QueryHandler(IsPlannerEnabledQuery)
export class IsPlannerEnabledHandler implements IQueryHandler<IsPlannerEnabledQuery, boolean> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: IsPlannerEnabledQuery): Promise<boolean> {
    const rows = await this.db
      .select({ plannerCoreEnabled: tenantSettings.plannerCoreEnabled })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, query.tenantId))
      .limit(1)

    return rows[0]?.plannerCoreEnabled ?? false
  }
}
