import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentConversationMessages } from '../schema/agents.schema'
import type {
  ConversationMessageContent,
  ConversationMessageEntity,
} from '../../domain/entities/conversation-message.entity'
import type { ConversationMessageRepository } from '../../domain/repositories/conversation-message.repository'

type MessageRow = typeof agentConversationMessages.$inferSelect

function toEntity(row: MessageRow): ConversationMessageEntity {
  return {
    id: row.id,
    conversationId: row.conversationId,
    tenantId: row.tenantId,
    userId: row.userId,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content as ConversationMessageContent | null,
    summary: row.summary,
    traceId: row.traceId,
    createdAt: row.createdAt,
  }
}

@Injectable()
export class DrizzleConversationMessageRepository implements ConversationMessageRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async persist(opts: {
    conversationId: string
    tenantId: string
    message: Omit<ConversationMessageEntity, 'id' | 'createdAt'>
  }): Promise<ConversationMessageEntity> {
    const rows = await this.db
      .insert(agentConversationMessages)
      .values({
        conversationId: opts.message.conversationId,
        tenantId: opts.message.tenantId,
        userId: opts.message.userId,
        role: opts.message.role,
        content: opts.message.content,
        summary: opts.message.summary,
        traceId: opts.message.traceId,
      })
      .returning()

    return toEntity(rows[0] as MessageRow)
  }

  async persistMany(opts: {
    conversationId: string
    tenantId: string
    messages: Array<Omit<ConversationMessageEntity, 'id' | 'createdAt'>>
  }): Promise<ConversationMessageEntity[]> {
    if (opts.messages.length === 0) {
      return []
    }

    const rows = await this.db
      .insert(agentConversationMessages)
      .values(
        opts.messages.map((m) => ({
          conversationId: m.conversationId,
          tenantId: m.tenantId,
          userId: m.userId,
          role: m.role,
          content: m.content,
          summary: m.summary,
          traceId: m.traceId,
        })),
      )
      .returning()

    return rows.map((r) => toEntity(r as MessageRow))
  }

  async listForWindow(opts: {
    conversationId: string
    tenantId: string
    limit: number
    before?: string
  }): Promise<ConversationMessageEntity[]> {
    if (opts.before) {
      // Keyset pagination: fetch the cursor row's created_at, then return rows before it.
      const cursorRows = await this.db
        .select()
        .from(agentConversationMessages)
        .where(
          and(
            eq(agentConversationMessages.id, opts.before),
            eq(agentConversationMessages.tenantId, opts.tenantId),
            eq(agentConversationMessages.conversationId, opts.conversationId),
          ),
        )
        .limit(1)

      if (cursorRows.length === 0) {
        return []
      }

      const cursorRow = cursorRows[0] as MessageRow
      const rows = await this.db
        .select()
        .from(agentConversationMessages)
        .where(
          and(
            eq(agentConversationMessages.tenantId, opts.tenantId),
            eq(agentConversationMessages.conversationId, opts.conversationId),
            lt(agentConversationMessages.createdAt, cursorRow.createdAt),
          ),
        )
        .orderBy(desc(agentConversationMessages.createdAt))
        .limit(opts.limit)

      return rows.map((r) => toEntity(r as MessageRow))
    }

    const rows = await this.db
      .select()
      .from(agentConversationMessages)
      .where(
        and(
          eq(agentConversationMessages.tenantId, opts.tenantId),
          eq(agentConversationMessages.conversationId, opts.conversationId),
        ),
      )
      .orderBy(desc(agentConversationMessages.createdAt))
      .limit(opts.limit)

    return rows.map((r) => toEntity(r as MessageRow))
  }

  async updateSummary(opts: {
    messageId: string
    tenantId: string
    summary: string
  }): Promise<void> {
    await this.db
      .update(agentConversationMessages)
      .set({ summary: opts.summary })
      .where(
        and(
          eq(agentConversationMessages.id, opts.messageId),
          eq(agentConversationMessages.tenantId, opts.tenantId),
        ),
      )
  }

  async hardDeleteContent(opts: { userId: string; tenantId: string }): Promise<{ count: number }> {
    // NULL out content and summary for all messages belonging to this user.
    // Retain row shells: id, conversation_id, tenant_id, user_id, role, trace_id, created_at.
    // This satisfies GDPR erasure (R-04.28) while preserving audit join capability.
    const rows = await this.db
      .update(agentConversationMessages)
      .set({
        content: null,
        summary: null,
      })
      .where(
        and(
          eq(agentConversationMessages.tenantId, opts.tenantId),
          eq(agentConversationMessages.userId, opts.userId),
        ),
      )
      .returning({ id: agentConversationMessages.id })

    return { count: rows.length }
  }

  async search(opts: {
    tenantId: string
    userId: string
    query: string
    limit: number
  }): Promise<ConversationMessageEntity[]> {
    // FTS search over the agent_message_fts_idx (R-04.8):
    // - user role: searches content->>'text'
    // - all roles: searches summary
    // NEVER searches raw tool-result content.
    //
    // We use plainto_tsquery for simple phrase matching without special characters.
    const tsQuery = sql`plainto_tsquery('simple', ${opts.query})`
    const tsVector = sql`
      to_tsvector('simple',
        CASE
          WHEN ${agentConversationMessages.role} = 'user'
          THEN coalesce(${agentConversationMessages.content}->>'text', '')
          ELSE ''
        END
        || ' ' || coalesce(${agentConversationMessages.summary}, '')
      )
    `

    const rows = await this.db
      .select()
      .from(agentConversationMessages)
      .where(
        and(
          eq(agentConversationMessages.tenantId, opts.tenantId),
          eq(agentConversationMessages.userId, opts.userId),
          sql`${tsVector} @@ ${tsQuery}`,
        ),
      )
      .orderBy(asc(agentConversationMessages.createdAt))
      .limit(opts.limit)

    return rows.map((r) => toEntity(r as MessageRow))
  }
}
