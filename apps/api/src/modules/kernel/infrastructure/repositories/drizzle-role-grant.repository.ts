import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { RoleGrant, RoleGrantSourceValue } from '../../domain/entities/role-grant.entity'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { roleGrant } from '../schema/index'

@Injectable()
export class DrizzleRoleGrantRepository implements IRoleGrantRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByActorId(actorId: string, tenantId: string): Promise<RoleGrant[]> {
    const now = new Date()
    const rows = await this.db
      .select()
      .from(roleGrant)
      .where(
        and(
          eq(roleGrant.actorId, actorId),
          eq(roleGrant.tenantId, tenantId),
          or(isNull(roleGrant.validUntil), gt(roleGrant.validUntil, now)),
        ),
      )

    return rows as RoleGrant[]
  }

  async insert(data: {
    tenantId: string
    actorId: string
    roleKey: RoleGrant['roleKey']
    scopeType: RoleGrant['scopeType']
    scopeId: string | null
    grantedBy: string
    source?: RoleGrantSourceValue
  }): Promise<RoleGrant> {
    const rows = await this.db
      .insert(roleGrant)
      .values({
        tenantId: data.tenantId,
        actorId: data.actorId,
        roleKey: data.roleKey,
        scopeType: data.scopeType,
        scopeId: data.scopeId ?? undefined,
        grantedBy: data.grantedBy,
        source: data.source ?? 'manual',
      })
      .returning()
    return rows[0] as RoleGrant
  }

  async revokeAllForActor(actorId: string, tenantId: string, revokedAt: Date): Promise<void> {
    await this.db
      .update(roleGrant)
      .set({ validUntil: revokedAt })
      .where(
        and(
          eq(roleGrant.actorId, actorId),
          eq(roleGrant.tenantId, tenantId),
          isNull(roleGrant.validUntil),
        ),
      )
  }

  async revokeBySource(
    actorId: string,
    tenantId: string,
    source: RoleGrantSourceValue,
    revokedAt: Date,
  ): Promise<void> {
    await this.db
      .update(roleGrant)
      .set({ validUntil: revokedAt })
      .where(
        and(
          eq(roleGrant.actorId, actorId),
          eq(roleGrant.tenantId, tenantId),
          eq(roleGrant.source, source),
          isNull(roleGrant.validUntil),
        ),
      )
  }
}
