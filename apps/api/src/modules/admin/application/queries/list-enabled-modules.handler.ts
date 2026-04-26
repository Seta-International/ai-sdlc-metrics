import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { tenantModuleToggle } from '../../infrastructure/schema/admin.schema'
import { ListEnabledModulesQuery } from './list-enabled-modules.query'

@Injectable()
@QueryHandler(ListEnabledModulesQuery)
export class ListEnabledModulesHandler implements IQueryHandler<
  ListEnabledModulesQuery,
  ReadonlySet<string>
> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: ListEnabledModulesQuery): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .select({ moduleKey: tenantModuleToggle.moduleKey })
      .from(tenantModuleToggle)
      .where(
        and(eq(tenantModuleToggle.tenantId, query.tenantId), eq(tenantModuleToggle.enabled, true)),
      )

    return new Set(rows.map((r) => r.moduleKey))
  }
}
