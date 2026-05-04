import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentScorerRegistration } from '../schema/agents.schema'
import {
  SCORER_REGISTRATION_REPOSITORY,
  type ScorerRegistrationRepository,
  type ScorerRegistrationEntity,
  type ScorerStatus,
} from '../../domain/repositories/scorer-registration.repository'
import type { ScorerKind, ScorerScope } from '../../domain/scorer-types'

type AgentScorerRegistrationRow = typeof agentScorerRegistration.$inferSelect

function toDomain(row: AgentScorerRegistrationRow): ScorerRegistrationEntity {
  return {
    scorerId: row.scorerId,
    name: row.name,
    kind: row.kind as ScorerKind,
    scope: row.scope as ScorerScope,
    registeredAt: row.registeredAt,
    metaEvalAgreement: row.metaEvalAgreement !== null ? parseFloat(row.metaEvalAgreement) : null,
    status: row.status as ScorerStatus,
  }
}

@Injectable()
export class DrizzleScorerRegistrationRepository implements ScorerRegistrationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async upsert(
    reg: Omit<ScorerRegistrationEntity, 'registeredAt'>,
  ): Promise<ScorerRegistrationEntity> {
    const rows = await this.db
      .insert(agentScorerRegistration)
      .values({
        scorerId: reg.scorerId,
        name: reg.name,
        kind: reg.kind,
        scope: reg.scope,
        metaEvalAgreement: reg.metaEvalAgreement !== null ? String(reg.metaEvalAgreement) : null,
        status: reg.status,
      })
      .onConflictDoUpdate({
        target: agentScorerRegistration.scorerId,
        set: {
          name: reg.name,
          kind: reg.kind,
          scope: reg.scope,
          metaEvalAgreement: reg.metaEvalAgreement !== null ? String(reg.metaEvalAgreement) : null,
          status: reg.status,
        },
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('upsert returned no rows')
    return toDomain(row)
  }

  async findById(scorerId: string): Promise<ScorerRegistrationEntity | null> {
    const rows = await this.db
      .select()
      .from(agentScorerRegistration)
      .where(eq(agentScorerRegistration.scorerId, scorerId))
      .limit(1)

    return rows[0] ? toDomain(rows[0]) : null
  }

  async findAll(): Promise<ScorerRegistrationEntity[]> {
    const rows = await this.db.select().from(agentScorerRegistration)
    return rows.map(toDomain)
  }

  async promote(scorerId: string, metaEvalAgreement: number): Promise<void> {
    await this.db
      .update(agentScorerRegistration)
      .set({
        status: 'gating_eligible',
        metaEvalAgreement: String(metaEvalAgreement),
      })
      .where(eq(agentScorerRegistration.scorerId, scorerId))
  }

  async demote(scorerId: string): Promise<void> {
    await this.db
      .update(agentScorerRegistration)
      .set({ status: 'provisional' })
      .where(eq(agentScorerRegistration.scorerId, scorerId))
  }
}

export { SCORER_REGISTRATION_REPOSITORY }
