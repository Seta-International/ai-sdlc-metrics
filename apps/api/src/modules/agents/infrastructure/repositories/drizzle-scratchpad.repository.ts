import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { agentScratchpad } from '../schema/agents.schema'
import type { ScratchpadValue } from '../../domain/entities/scratchpad.entity'
import type { ScratchpadRepository } from '../../domain/repositories/scratchpad.repository'

export interface ScratchpadWriteOpts {
  tainted: boolean
  /** Registry-pinned allowlist for this sub-agent. Field is rejected if absent. */
  allowedFields: string[]
  subAgentKey: string
  traceId: string
}

/**
 * DrizzleScratchpadRepository — Drizzle ORM implementation of ScratchpadRepository (L3.5).
 *
 * write() validates the field against the caller-supplied allowedFields (the
 * sub-agent's registry-pinned list). Unknown fields are rejected before any DB
 * interaction. Every successful write emits kernel audit event
 * `agent.scratchpad_written` carrying `{ sub_agent_key, field, tainted, trace_id }`.
 * The taint flag is stored alongside the value and returned on read().
 *
 * GDPR path: deleteForUser() hard-deletes all scratchpad entries for the user.
 */
@Injectable()
export class DrizzleScratchpadRepository implements ScratchpadRepository {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly audit: KernelAuditFacade,
  ) {}

  async read(tenantId: string, userId: string, field: string): Promise<ScratchpadValue | null> {
    const rows = await this.db
      .select({
        value: agentScratchpad.value,
        tainted: agentScratchpad.tainted,
      })
      .from(agentScratchpad)
      .where(
        and(
          eq(agentScratchpad.tenantId, tenantId),
          eq(agentScratchpad.userId, userId),
          eq(agentScratchpad.field, field),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row) return null
    return { value: row.value, tainted: row.tainted }
  }

  /**
   * Write a scratchpad field. The `opts.allowedFields` parameter carries the
   * sub-agent's registry-pinned allowlist; if `field` is absent the write is
   * rejected without touching the DB.
   *
   * Note: this method signature extends the base ScratchpadRepository interface
   * with the allowedFields, subAgentKey, and traceId needed for validation and
   * audit. The service layer is responsible for supplying these at call time.
   */
  async write(
    tenantId: string,
    userId: string,
    field: string,
    value: unknown,
    opts: ScratchpadWriteOpts,
  ): Promise<void> {
    if (!opts.allowedFields.includes(field)) {
      throw new Error(
        `Scratchpad field "${field}" is not in the allowed fields list for sub-agent "${opts.subAgentKey}". Allowed: [${opts.allowedFields.join(', ')}]`,
      )
    }

    await this.db
      .insert(agentScratchpad)
      .values({
        tenantId,
        userId,
        field,
        value: value as Record<string, unknown>,
        tainted: opts.tainted,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [agentScratchpad.tenantId, agentScratchpad.userId, agentScratchpad.field],
        set: {
          value: value as Record<string, unknown>,
          tainted: opts.tainted,
          updatedAt: new Date(),
        },
      })

    await this.audit.recordEvent({
      tenantId,
      actorId: userId,
      eventType: 'agent.scratchpad_written',
      module: 'agents',
      subjectId: userId,
      payload: {
        sub_agent_key: opts.subAgentKey,
        field,
        tainted: opts.tainted,
        trace_id: opts.traceId,
      },
    })
  }

  async deleteForUser(tenantId: string, userId: string): Promise<{ count: number }> {
    const rows = await this.db
      .delete(agentScratchpad)
      .where(and(eq(agentScratchpad.tenantId, tenantId), eq(agentScratchpad.userId, userId)))
      .returning({ field: agentScratchpad.field })
    return { count: rows.length }
  }
}
