import { Injectable } from '@nestjs/common'
import { eq, lt } from 'drizzle-orm'
import type { Db } from '@future/db'
import {
  agentWriteDedup,
  type AgentWriteDedupRow,
  type NewAgentWriteDedupRow,
} from '../schema/agents.schema'
import type { IWriteDedupRepository } from '../../domain/repositories/write-dedup.repository'

@Injectable()
export class DrizzleWriteDedupRepository implements IWriteDedupRepository {
  constructor(private readonly db: Db) {}

  async findByKey(idempotencyKey: string): Promise<AgentWriteDedupRow | null> {
    const rows = await this.db
      .select()
      .from(agentWriteDedup)
      .where(eq(agentWriteDedup.idempotencyKey, idempotencyKey))
      .limit(1)
    return rows[0] ?? null
  }

  async insert(row: NewAgentWriteDedupRow): Promise<void> {
    await this.db.insert(agentWriteDedup).values(row).onConflictDoNothing()
  }

  async deleteExpired(): Promise<{ deletedCount: number }> {
    const result = await this.db
      .delete(agentWriteDedup)
      .where(lt(agentWriteDedup.expiresAt, new Date()))
    return { deletedCount: result.rowCount ?? 0 }
  }
}
