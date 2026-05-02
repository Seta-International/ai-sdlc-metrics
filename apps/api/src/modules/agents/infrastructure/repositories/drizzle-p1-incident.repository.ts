/**
 * drizzle-p1-incident.repository.ts
 *
 * Drizzle-backed implementation of P1IncidentRepository.
 */

import { Inject, Injectable } from '@nestjs/common'
import { and, count, desc, eq, gte } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentP1IncidentLog } from '../schema/agent-readiness.schema'
import {
  P1_INCIDENT_REPOSITORY,
  type P1IncidentRepository,
  type P1IncidentEntity,
  type IncidentSeverity,
  type IncidentCategory,
} from '../../domain/repositories/p1-incident.repository'

type AgentP1IncidentLogRow = typeof agentP1IncidentLog.$inferSelect

function toDomain(row: AgentP1IncidentLogRow): P1IncidentEntity {
  return {
    id: row.id,
    tenantId: row.tenantId,
    openedAt: row.openedAt,
    closedAt: row.closedAt ?? null,
    severity: row.severity as IncidentSeverity,
    category: row.category as IncidentCategory,
    summary: row.summary,
    postMortemUrl: row.postMortemUrl ?? null,
  }
}

@Injectable()
export class DrizzleP1IncidentRepository implements P1IncidentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(incident: Omit<P1IncidentEntity, 'id'>): Promise<P1IncidentEntity> {
    const rows = await this.db
      .insert(agentP1IncidentLog)
      .values({
        tenantId: incident.tenantId,
        openedAt: incident.openedAt,
        closedAt: incident.closedAt ?? null,
        severity: incident.severity,
        category: incident.category,
        summary: incident.summary,
        postMortemUrl: incident.postMortemUrl ?? null,
      })
      .returning()

    const row = rows[0]
    if (!row) throw new Error('insert returned no rows')
    return toDomain(row)
  }

  /**
   * Counts ALL P1 security incidents opened in the last 90 days (open AND closed).
   * The GA gate requires zero incidents regardless of resolution status.
   */
  async countOpenSecurityLast90Days(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

    const rows = await this.db
      .select({ total: count() })
      .from(agentP1IncidentLog)
      .where(
        and(
          eq(agentP1IncidentLog.severity, 'P1'),
          eq(agentP1IncidentLog.category, 'security'),
          gte(agentP1IncidentLog.openedAt, cutoff),
        ),
      )

    return Number(rows[0]?.total ?? 0)
  }

  async close(opts: { id: string; closedAt: Date; postMortemUrl?: string }): Promise<void> {
    await this.db
      .update(agentP1IncidentLog)
      .set({
        closedAt: opts.closedAt,
        postMortemUrl: opts.postMortemUrl ?? null,
      })
      .where(eq(agentP1IncidentLog.id, opts.id))
  }

  async findRecent(opts: {
    limit?: number
    severity?: IncidentSeverity
  }): Promise<P1IncidentEntity[]> {
    const conditions = opts.severity ? [eq(agentP1IncidentLog.severity, opts.severity)] : undefined

    const query = this.db
      .select()
      .from(agentP1IncidentLog)
      .where(conditions ? and(...conditions) : undefined)
      .orderBy(desc(agentP1IncidentLog.openedAt))

    const rows = opts.limit !== undefined ? await query.limit(opts.limit) : await query

    return rows.map(toDomain)
  }
}

export { P1_INCIDENT_REPOSITORY }
