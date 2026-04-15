import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import type { AgentInsightEntity } from '../../domain/entities/agent-insight.entity'
import type { AgentInsightRepository } from '../../domain/repositories/agent-insight.repository'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentInsights } from '../schema/agents.schema'

@Injectable()
export class DrizzleAgentInsightRepository implements AgentInsightRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async create(
    insight: Omit<AgentInsightEntity, 'id' | 'createdAt' | 'isDismissed'>,
  ): Promise<AgentInsightEntity> {
    const rows = await this.db.insert(agentInsights).values(insight).returning()
    return rows[0] as AgentInsightEntity
  }

  async findByActor(actorId: string, tenantId: string): Promise<AgentInsightEntity[]> {
    const rows = await this.db
      .select()
      .from(agentInsights)
      .where(
        and(
          eq(agentInsights.actorId, actorId),
          eq(agentInsights.tenantId, tenantId),
          eq(agentInsights.isDismissed, false),
        ),
      )
    return rows as AgentInsightEntity[]
  }

  async dismiss(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(agentInsights)
      .set({ isDismissed: true })
      .where(and(eq(agentInsights.id, id), eq(agentInsights.tenantId, tenantId)))
  }
}
