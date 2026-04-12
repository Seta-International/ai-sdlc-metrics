import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { ILocalUserQueryPort, LocalUserDto } from '../../domain/ports/local-user-query.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { userIdentity, actor } from '../../../kernel/infrastructure/schema/index'

@Injectable()
export class DrizzleLocalUserQueryService implements ILocalUserQueryPort {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async listByTenantId(tenantId: string): Promise<LocalUserDto[]> {
    const rows = await this.db
      .select({
        actorId: userIdentity.actorId,
        email: userIdentity.email,
        displayName: actor.displayName,
        status: userIdentity.status,
        lastLoginAt: userIdentity.lastLoginAt,
        createdAt: userIdentity.createdAt,
      })
      .from(userIdentity)
      .innerJoin(actor, and(eq(actor.id, userIdentity.actorId), eq(actor.tenantId, tenantId)))
      .where(and(eq(userIdentity.tenantId, tenantId), eq(userIdentity.provider, 'local')))
      .orderBy(actor.displayName)

    return rows as LocalUserDto[]
  }
}
