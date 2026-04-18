import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { userIdentity } from '../../infrastructure/schema/index'
import { GetUserIdentityByActorIdQuery } from './get-user-identity-by-actor-id.query'

@QueryHandler(GetUserIdentityByActorIdQuery)
export class GetUserIdentityByActorIdHandler implements IQueryHandler<
  GetUserIdentityByActorIdQuery,
  string | null
> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetUserIdentityByActorIdQuery): Promise<string | null> {
    const rows = await this.db
      .select({ ssoSubject: userIdentity.ssoSubject })
      .from(userIdentity)
      .where(
        and(eq(userIdentity.actorId, query.actorId), eq(userIdentity.tenantId, query.tenantId)),
      )
      .limit(1)

    return rows[0]?.ssoSubject ?? null
  }
}
