import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Delegation } from '../../domain/entities/delegation.entity'
import type { IDelegationRepository } from '../../domain/repositories/delegation.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { delegation } from '../schema/delegation.schema'

@Injectable()
export class DrizzleDelegationRepository implements IDelegationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findActiveDelegationsForDelegatee(
    delegateeId: string,
    tenantId: string,
  ): Promise<Delegation[]> {
    const now = new Date()
    const rows = await this.db
      .select()
      .from(delegation)
      .where(
        and(
          eq(delegation.delegateeId, delegateeId),
          eq(delegation.tenantId, tenantId),
          lt(delegation.validFrom, now),
          gt(delegation.validUntil, now),
        ),
      )

    return rows as Delegation[]
  }
}
