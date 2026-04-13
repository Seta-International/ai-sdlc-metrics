import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { userIdentity, actor } from '../../infrastructure/schema/index'
import { GetLocalUsersWithActorsQuery } from './get-local-users-with-actors.query'

export interface LocalUserWithActorDto {
  actorId: string
  email: string
  displayName: string
  status: string
  lastLoginAt: Date | null
  createdAt: Date
}

@QueryHandler(GetLocalUsersWithActorsQuery)
export class GetLocalUsersWithActorsHandler implements IQueryHandler<
  GetLocalUsersWithActorsQuery,
  LocalUserWithActorDto[]
> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetLocalUsersWithActorsQuery): Promise<LocalUserWithActorDto[]> {
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
      .innerJoin(actor, and(eq(actor.id, userIdentity.actorId), eq(actor.tenantId, query.tenantId)))
      .where(and(eq(userIdentity.tenantId, query.tenantId), eq(userIdentity.provider, 'local')))
      .orderBy(actor.displayName)

    return rows as LocalUserWithActorDto[]
  }
}
