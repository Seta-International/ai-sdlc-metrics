import { Injectable, Inject } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IRosterMemberRepository } from '../../domain/repositories/roster-member.repository'
import { RosterMemberEntity } from '../../domain/entities/roster-member.entity'
import { rosterMember } from '../schema/planner.schema'

@Injectable()
export class DrizzleRosterMemberRepository implements IRosterMemberRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async replaceForRoster(params: {
    tenantId: string
    msRosterId: string
    ssoSubjects: string[]
  }): Promise<void> {
    const { tenantId, msRosterId, ssoSubjects } = params

    await this.db
      .delete(rosterMember)
      .where(and(eq(rosterMember.tenantId, tenantId), eq(rosterMember.msRosterId, msRosterId)))

    if (ssoSubjects.length === 0) return

    await this.db.insert(rosterMember).values(
      ssoSubjects.map((ssoSubject) => ({
        tenantId,
        msRosterId,
        ssoSubject,
        actorId: null,
        syncedAt: new Date(),
      })),
    )
  }

  async listMembers(params: {
    tenantId: string
    msRosterId: string
  }): Promise<RosterMemberEntity[]> {
    const rows = await this.db
      .select()
      .from(rosterMember)
      .where(
        and(
          eq(rosterMember.tenantId, params.tenantId),
          eq(rosterMember.msRosterId, params.msRosterId),
        ),
      )
    return rows.map(rowToEntity)
  }

  async listUnresolved(tenantId: string): Promise<RosterMemberEntity[]> {
    const rows = await this.db
      .select()
      .from(rosterMember)
      .where(and(eq(rosterMember.tenantId, tenantId), isNull(rosterMember.actorId)))
    return rows.map(rowToEntity)
  }

  async resolveMember(
    tenantId: string,
    msRosterId: string,
    ssoSubject: string,
    actorId: string,
  ): Promise<void> {
    await this.db
      .update(rosterMember)
      .set({ actorId })
      .where(
        and(
          eq(rosterMember.tenantId, tenantId),
          eq(rosterMember.msRosterId, msRosterId),
          eq(rosterMember.ssoSubject, ssoSubject),
        ),
      )
  }
}

type RosterMemberRow = typeof rosterMember.$inferSelect

function rowToEntity(row: RosterMemberRow): RosterMemberEntity {
  return new RosterMemberEntity(
    row.tenantId,
    row.msRosterId,
    row.actorId ?? null,
    row.ssoSubject,
    row.syncedAt,
  )
}
