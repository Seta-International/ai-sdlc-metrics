import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantSettings } from '../../infrastructure/schema/admin.schema'
import { GetTenantTimezoneQuery } from './get-tenant-timezone.query'

const DEFAULT_TENANT_TIMEZONE = 'Asia/Ho_Chi_Minh'

@Injectable()
@QueryHandler(GetTenantTimezoneQuery)
export class GetTenantTimezoneHandler implements IQueryHandler<GetTenantTimezoneQuery, string> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetTenantTimezoneQuery): Promise<string> {
    const rows = await this.db
      .select({ timezone: tenantSettings.timezone })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, query.tenantId))
      .limit(1)

    return rows[0]?.timezone ?? DEFAULT_TENANT_TIMEZONE
  }
}
