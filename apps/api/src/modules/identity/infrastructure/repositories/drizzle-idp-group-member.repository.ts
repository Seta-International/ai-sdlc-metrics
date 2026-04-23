import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { IdpGroupMemberEntity } from '../../domain/entities/idp-group-member.entity'
import type { IIdpGroupMemberRepository } from '../../domain/repositories/idp-group-member.repository'
import { idpGroupMember } from '../schema'

@Injectable()
export class DrizzleIdpGroupMemberRepository implements IIdpGroupMemberRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async replaceForGroup(input: {
    tenantId: string
    externalGroupId: string
    ssoSubjects: string[]
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(idpGroupMember)
        .where(
          and(
            eq(idpGroupMember.tenantId, input.tenantId),
            eq(idpGroupMember.externalGroupId, input.externalGroupId),
          ),
        )

      if (input.ssoSubjects.length === 0) return

      await tx.insert(idpGroupMember).values(
        input.ssoSubjects.map((ssoSubject) => ({
          tenantId: input.tenantId,
          externalGroupId: input.externalGroupId,
          ssoSubject,
        })),
      )
    })
  }

  async listMembers(input: {
    tenantId: string
    externalGroupId: string
  }): Promise<IdpGroupMemberEntity[]> {
    const rows = await this.db
      .select()
      .from(idpGroupMember)
      .where(
        and(
          eq(idpGroupMember.tenantId, input.tenantId),
          eq(idpGroupMember.externalGroupId, input.externalGroupId),
        ),
      )

    return rows.map((row) =>
      IdpGroupMemberEntity.create({
        tenantId: row.tenantId,
        externalGroupId: row.externalGroupId,
        ssoSubject: row.ssoSubject,
        syncedAt: row.syncedAt,
      }),
    )
  }
}
