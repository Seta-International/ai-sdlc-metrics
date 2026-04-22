import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentStoredSubAgents } from '../schema/agents.schema'
import type {
  StoredSubAgentEntry,
  StoredSubAgentPort,
} from '../../domain/ports/stored-sub-agent.port'

type StoredSubAgentRow = typeof agentStoredSubAgents.$inferSelect

function toEntry(row: StoredSubAgentRow): StoredSubAgentEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    config: row.config,
    version: row.version,
    status: row.status as StoredSubAgentEntry['status'],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  }
}

@Injectable()
export class DrizzleStoredSubAgentRepository implements StoredSubAgentPort {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findActiveByKey(opts: {
    tenantId: string
    key: string
  }): Promise<StoredSubAgentEntry | null> {
    const rows = await this.db
      .select()
      .from(agentStoredSubAgents)
      .where(
        and(
          eq(agentStoredSubAgents.tenantId, opts.tenantId),
          eq(agentStoredSubAgents.key, opts.key),
          eq(agentStoredSubAgents.status, 'active'),
        ),
      )
      .orderBy(desc(agentStoredSubAgents.version))
      .limit(1)

    return rows[0] ? toEntry(rows[0] as StoredSubAgentRow) : null
  }
}
