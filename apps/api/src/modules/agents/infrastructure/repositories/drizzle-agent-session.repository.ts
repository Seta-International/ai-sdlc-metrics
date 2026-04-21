import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentSessions } from '../schema/agents.schema'
import type { AgentSessionEntry, AgentSessionPort } from '../../domain/ports/agent-session.port'

type AgentSessionRow = typeof agentSessions.$inferSelect

function toEntry(row: AgentSessionRow): AgentSessionEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    conversationId: row.conversationId,
    routerPromptHash: row.routerPromptHash,
    permissionNarrativeHash: row.permissionNarrativeHash,
    toolCatalogHash: row.toolCatalogHash,
    directiveSchemaHash: row.directiveSchemaHash,
    canonicalizerVersionHash: row.canonicalizerVersionHash,
    pinnedSubAgentPromptHashes: row.pinnedSubAgentPromptHashes,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }
}

@Injectable()
export class DrizzleAgentSessionRepository implements AgentSessionPort {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByConversation(opts: {
    tenantId: string
    userId: string
    conversationId: string
  }): Promise<AgentSessionEntry | null> {
    const rows = await this.db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.tenantId, opts.tenantId),
          eq(agentSessions.userId, opts.userId),
          eq(agentSessions.conversationId, opts.conversationId),
          isNull(agentSessions.endedAt),
        ),
      )
      .orderBy(desc(agentSessions.startedAt))
      .limit(1)

    return rows[0] ? toEntry(rows[0] as AgentSessionRow) : null
  }

  async create(
    entry: Omit<AgentSessionEntry, 'startedAt' | 'endedAt'>,
  ): Promise<AgentSessionEntry> {
    const rows = await this.db
      .insert(agentSessions)
      .values({
        id: entry.id,
        tenantId: entry.tenantId,
        userId: entry.userId,
        conversationId: entry.conversationId,
        routerPromptHash: entry.routerPromptHash,
        permissionNarrativeHash: entry.permissionNarrativeHash,
        toolCatalogHash: entry.toolCatalogHash,
        directiveSchemaHash: entry.directiveSchemaHash,
        canonicalizerVersionHash: entry.canonicalizerVersionHash,
        pinnedSubAgentPromptHashes: entry.pinnedSubAgentPromptHashes,
      })
      .returning()

    return toEntry(rows[0] as AgentSessionRow)
  }

  async endSession(id: string): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({ endedAt: sql`now()` })
      .where(and(eq(agentSessions.id, id), isNull(agentSessions.endedAt)))
  }
}
