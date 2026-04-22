import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentConversations } from '../schema/agents.schema'
import type { ConversationEntity } from '../../domain/entities/conversation.entity'
import type { ConversationRepository } from '../../domain/repositories/conversation.repository'

type ConversationRow = typeof agentConversations.$inferSelect

function toEntity(row: ConversationRow): ConversationEntity {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    surface: row.surface,
    status: row.status as 'active' | 'archived',
    title: row.title,
    lastUserTurnAt: row.lastUserTurnAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    summaryFailureStreak: row.summaryFailureStreak,
    summaryDisabledAt: row.summaryDisabledAt,
  }
}

@Injectable()
export class DrizzleConversationRepository implements ConversationRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async loadOrCreateActive(opts: {
    tenantId: string
    userId: string
    surface: string
  }): Promise<{ conversation: ConversationEntity; isNew: boolean }> {
    // Try INSERT first — unique partial index enforces at-most-one active per scope.
    // ON CONFLICT DO NOTHING returns no rows if the row already exists.
    const inserted = await this.db
      .insert(agentConversations)
      .values({
        tenantId: opts.tenantId,
        userId: opts.userId,
        surface: opts.surface,
        status: 'active',
      })
      .onConflictDoNothing()
      .returning()

    if (inserted.length > 0) {
      return { conversation: toEntity(inserted[0] as ConversationRow), isNew: true }
    }

    // Row already exists — fetch it.
    const existing = await this.db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.tenantId, opts.tenantId),
          eq(agentConversations.userId, opts.userId),
          eq(agentConversations.surface, opts.surface),
          eq(agentConversations.status, 'active'),
        ),
      )
      .limit(1)

    if (existing.length === 0) {
      // Race: the row existed but is no longer visible (e.g., archived between insert and select).
      // Retry the insert — this is safe because a new row can now be created.
      const retried = await this.db
        .insert(agentConversations)
        .values({
          tenantId: opts.tenantId,
          userId: opts.userId,
          surface: opts.surface,
          status: 'active',
        })
        .onConflictDoNothing()
        .returning()

      if (retried.length > 0) {
        return { conversation: toEntity(retried[0] as ConversationRow), isNew: true }
      }

      throw new Error(
        `conversation race: conflict on (${opts.tenantId}, ${opts.userId}, ${opts.surface}) but row not visible`,
      )
    }

    return { conversation: toEntity(existing[0] as ConversationRow), isNew: false }
  }

  async loadById(opts: { id: string; tenantId: string }): Promise<ConversationEntity | undefined> {
    const rows = await this.db
      .select()
      .from(agentConversations)
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
      .limit(1)

    return rows[0] ? toEntity(rows[0] as ConversationRow) : undefined
  }

  async archive(opts: { id: string; tenantId: string }): Promise<void> {
    await this.db
      .update(agentConversations)
      .set({
        status: 'archived',
        archivedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async delete(opts: { id: string; tenantId: string }): Promise<void> {
    await this.db
      .delete(agentConversations)
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async listGlobal(opts: {
    tenantId: string
    userId: string
    cursor?: string
    limit: number
  }): Promise<ConversationEntity[]> {
    if (opts.cursor) {
      // Keyset pagination: fetch the cursor row's updated_at first, then filter
      const cursorRows = await this.db
        .select()
        .from(agentConversations)
        .where(
          and(
            eq(agentConversations.id, opts.cursor),
            eq(agentConversations.tenantId, opts.tenantId),
          ),
        )
        .limit(1)

      if (cursorRows.length === 0) {
        return []
      }

      const cursorRow = cursorRows[0] as ConversationRow
      const rows = await this.db
        .select()
        .from(agentConversations)
        .where(
          and(
            eq(agentConversations.tenantId, opts.tenantId),
            eq(agentConversations.userId, opts.userId),
            lt(agentConversations.updatedAt, cursorRow.updatedAt),
          ),
        )
        .orderBy(desc(agentConversations.updatedAt))
        .limit(opts.limit)

      return rows.map((r) => toEntity(r as ConversationRow))
    }

    const rows = await this.db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.tenantId, opts.tenantId),
          eq(agentConversations.userId, opts.userId),
        ),
      )
      .orderBy(desc(agentConversations.updatedAt))
      .limit(opts.limit)

    return rows.map((r) => toEntity(r as ConversationRow))
  }

  async listBySurface(opts: {
    tenantId: string
    userId: string
    surface: string
  }): Promise<ConversationEntity[]> {
    const rows = await this.db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.tenantId, opts.tenantId),
          eq(agentConversations.userId, opts.userId),
          eq(agentConversations.surface, opts.surface),
        ),
      )
      .orderBy(desc(agentConversations.updatedAt))

    return rows.map((r) => toEntity(r as ConversationRow))
  }

  async incrementSummaryFailureStreak(opts: { id: string; tenantId: string }): Promise<number> {
    const rows = await this.db
      .update(agentConversations)
      .set({
        summaryFailureStreak: sql`${agentConversations.summaryFailureStreak} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
      .returning({ summaryFailureStreak: agentConversations.summaryFailureStreak })

    return (rows[0] as { summaryFailureStreak: number } | undefined)?.summaryFailureStreak ?? 0
  }

  async resetSummaryFailureStreak(opts: { id: string; tenantId: string }): Promise<void> {
    await this.db
      .update(agentConversations)
      .set({
        summaryFailureStreak: 0,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async setSummaryDisabled(opts: { id: string; tenantId: string; at: Date }): Promise<void> {
    await this.db
      .update(agentConversations)
      .set({
        summaryDisabledAt: opts.at,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async clearSummaryDisabled(opts: { id: string; tenantId: string }): Promise<void> {
    await this.db
      .update(agentConversations)
      .set({
        summaryDisabledAt: null,
        summaryFailureStreak: 0,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async updateTitle(opts: { id: string; tenantId: string; title: string }): Promise<void> {
    await this.db
      .update(agentConversations)
      .set({
        title: opts.title,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async touchLastUserTurn(opts: { id: string; tenantId: string; at: Date }): Promise<void> {
    await this.db
      .update(agentConversations)
      .set({
        lastUserTurnAt: opts.at,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(agentConversations.id, opts.id), eq(agentConversations.tenantId, opts.tenantId)),
      )
  }

  async archiveIdleConversations(opts: {
    idleThresholdDays: number
    mode: 'archive' | 'hard_delete'
    tenantId: string
  }): Promise<number> {
    const idleFilter = sql`${agentConversations.updatedAt} < now() - make_interval(days => ${opts.idleThresholdDays})`

    if (opts.mode === 'hard_delete') {
      const deleted = await this.db
        .delete(agentConversations)
        .where(
          and(
            eq(agentConversations.tenantId, opts.tenantId),
            eq(agentConversations.status, 'active'),
            idleFilter,
          ),
        )
        .returning({ id: agentConversations.id })
      return deleted.length
    }

    const archived = await this.db
      .update(agentConversations)
      .set({
        status: 'archived',
        archivedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(agentConversations.tenantId, opts.tenantId),
          eq(agentConversations.status, 'active'),
          idleFilter,
        ),
      )
      .returning({ id: agentConversations.id })
    return archived.length
  }
}
