import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentIteration } from '../schema/agent-iteration.schema'
import type { AgentIterationRow, NewAgentIterationRow } from '../schema/agent-iteration.schema'
import type { AgentIterationRepository } from '../../domain/repositories/agent-iteration.repository'

@Injectable()
export class DrizzleAgentIterationRepository implements AgentIterationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async save(row: NewAgentIterationRow): Promise<AgentIterationRow> {
    const rows = await this.db.insert(agentIteration).values(row).returning()

    const saved = rows[0]
    if (!saved) throw new Error('DrizzleAgentIterationRepository.save: insert returned no rows')
    return saved
  }

  async findByTurnId(turnId: string): Promise<AgentIterationRow[]> {
    return this.db
      .select()
      .from(agentIteration)
      .where(eq(agentIteration.turnId, turnId))
      .orderBy(agentIteration.iterationNumber)
  }
}
