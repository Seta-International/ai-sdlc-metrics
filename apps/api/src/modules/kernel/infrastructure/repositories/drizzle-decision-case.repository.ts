import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  DecisionCase,
  DecisionOutcome,
  IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'
import { decisionCase, decisionOutcome } from '../schema/index'

@Injectable()
export class DrizzleDecisionCaseRepository implements IDecisionCaseRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<DecisionCase | null> {
    const rows = await this.db
      .select()
      .from(decisionCase)
      .where(and(eq(decisionCase.id, id), eq(decisionCase.tenantId, tenantId)))
      .limit(1)
    return (rows[0] as DecisionCase | undefined) ?? null
  }

  async insert(data: {
    tenantId: string
    module: string
    subjectId: string
    requestedBy: string
  }): Promise<DecisionCase> {
    const rows = await this.db
      .insert(decisionCase)
      .values({
        tenantId: data.tenantId,
        module: data.module,
        subjectId: data.subjectId,
        requestedBy: data.requestedBy,
      })
      .returning()
    return rows[0] as DecisionCase
  }

  async updateStatus(id: string, tenantId: string, status: DecisionCase['status']): Promise<void> {
    await this.db
      .update(decisionCase)
      .set({ status })
      .where(and(eq(decisionCase.id, id), eq(decisionCase.tenantId, tenantId)))
  }

  async insertOutcome(data: {
    tenantId: string
    caseId: string
    finalAction: 'approved' | 'rejected'
    decidedBy: string
    comment: string | null
  }): Promise<DecisionOutcome> {
    const rows = await this.db
      .insert(decisionOutcome)
      .values({
        tenantId: data.tenantId,
        caseId: data.caseId,
        finalAction: data.finalAction,
        decidedBy: data.decidedBy,
        comment: data.comment,
      })
      .returning()
    return rows[0] as DecisionOutcome
  }
}
