import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { AccountMembership } from '../../domain/entities/account-membership.entity'
import type { IAccountMembershipRepository } from '../../domain/repositories/account-membership.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { accountMembership } from '../schema/index'

@Injectable()
export class DrizzleAccountMembershipRepository implements IAccountMembershipRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findActiveByActorId(actorId: string, tenantId: string): Promise<AccountMembership[]> {
    const rows = await this.db
      .select()
      .from(accountMembership)
      .where(
        and(
          eq(accountMembership.actorId, actorId),
          eq(accountMembership.tenantId, tenantId),
          isNull(accountMembership.leftAt),
        ),
      )
    return rows as AccountMembership[]
  }

  async closeAllForActor(actorId: string, tenantId: string, leftAt: Date): Promise<void> {
    await this.db
      .update(accountMembership)
      .set({ leftAt })
      .where(
        and(
          eq(accountMembership.actorId, actorId),
          eq(accountMembership.tenantId, tenantId),
          isNull(accountMembership.leftAt),
        ),
      )
  }

  async insert(data: Omit<AccountMembership, 'id'>): Promise<AccountMembership> {
    const rows = await this.db
      .insert(accountMembership)
      .values({
        tenantId: data.tenantId,
        accountId: data.accountId,
        actorId: data.actorId,
        roleKey: data.roleKey,
        joinedAt: data.joinedAt,
        leftAt: data.leftAt ?? undefined,
      })
      .returning()
    return rows[0] as AccountMembership
  }

  async remove(id: string, tenantId: string, leftAt: Date): Promise<void> {
    await this.db
      .update(accountMembership)
      .set({ leftAt })
      .where(and(eq(accountMembership.id, id), eq(accountMembership.tenantId, tenantId)))
  }
}
