import { Inject, Injectable } from '@nestjs/common'
import { and, count, eq, gte, inArray, like, lt, lte, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentDraft } from '../schema/agent-draft.schema'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'
import type {
  Draft,
  DraftProvenance,
  DraftStatus,
  DraftTier,
  NewDraft,
} from '../../application/services/draft-types'

type AgentDraftRow = typeof agentDraft.$inferSelect

function toDomain(row: AgentDraftRow): Draft {
  return {
    id: row.id,
    tenantId: row.tenantId,
    traceId: row.traceId,
    flowId: row.flowId,
    initiatorUserId: row.initiatorUserId,
    onBehalfOf: row.onBehalfOf ?? null,
    viaDelegationId: row.viaDelegationId,
    viaScheduleId: row.viaScheduleId ?? null,
    approverUserId: row.approverUserId ?? null,
    tier: row.tier as DraftTier,
    status: row.status as DraftStatus,
    toolName: row.toolName,
    args: row.args,
    expectedOutputShape: row.expectedOutputShape ?? null,
    permissionEnvelopeAtDraftTime: row.permissionEnvelopeAtDraftTime as Record<string, unknown>,
    approvalFreshness: row.approvalFreshness as Draft['approvalFreshness'],
    approvalTtl: row.approvalTtl as string,
    draftedAt: row.draftedAt,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt ?? null,
    executedAt: row.executedAt ?? null,
    executionOutcome: row.executionOutcome ?? null,
    provenance: row.provenance as DraftProvenance,
    taintAtDraftTime: row.taintAtDraftTime,
  }
}

@Injectable()
export class DrizzleDraftRepository implements IDraftRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(draft: NewDraft): Promise<Draft> {
    const rows = await this.db
      .insert(agentDraft)
      .values({
        ...(draft.id !== undefined ? { id: draft.id } : {}),
        tenantId: draft.tenantId,
        traceId: draft.traceId,
        flowId: draft.flowId,
        initiatorUserId: draft.initiatorUserId,
        onBehalfOf: draft.onBehalfOf ?? null,
        viaDelegationId: draft.viaDelegationId,
        viaScheduleId: draft.viaScheduleId ?? null,
        approverUserId: draft.approverUserId ?? null,
        tier: draft.tier,
        toolName: draft.toolName,
        args: draft.args,
        expectedOutputShape: draft.expectedOutputShape ?? null,
        permissionEnvelopeAtDraftTime: draft.permissionEnvelopeAtDraftTime,
        approvalFreshness: draft.approvalFreshness,
        approvalTtl: `${draft.approvalTtlHours} hours`,
        draftedAt: draft.draftedAt,
        expiresAt: draft.expiresAt,
        provenance: draft.provenance as Record<string, unknown>,
        taintAtDraftTime: draft.taintAtDraftTime,
      })
      .returning()

    return toDomain(rows[0] as AgentDraftRow)
  }

  async getById(opts: { tenantId: string; draftId: string }): Promise<Draft | null> {
    const rows = await this.db
      .select()
      .from(agentDraft)
      .where(and(eq(agentDraft.tenantId, opts.tenantId), eq(agentDraft.id, opts.draftId)))
      .limit(1)

    return rows[0] ? toDomain(rows[0] as AgentDraftRow) : null
  }

  async updateStatus(opts: {
    tenantId: string
    draftId: string
    status: DraftStatus
    extra?: {
      approvedAt?: Date
      executedAt?: Date
      executionOutcome?: string
    }
  }): Promise<void> {
    await this.db
      .update(agentDraft)
      .set({
        status: opts.status,
        ...(opts.extra?.approvedAt !== undefined ? { approvedAt: opts.extra.approvedAt } : {}),
        ...(opts.extra?.executedAt !== undefined ? { executedAt: opts.extra.executedAt } : {}),
        ...(opts.extra?.executionOutcome !== undefined
          ? { executionOutcome: opts.extra.executionOutcome }
          : {}),
      })
      .where(and(eq(agentDraft.tenantId, opts.tenantId), eq(agentDraft.id, opts.draftId)))
  }

  async atomicTransitionToExecuted(opts: {
    tenantId: string
    draftId: string
    fromStatus: DraftStatus
  }): Promise<boolean> {
    const rows = await this.db
      .update(agentDraft)
      .set({ status: 'executed', executedAt: sql`now()` })
      .where(
        and(
          eq(agentDraft.tenantId, opts.tenantId),
          eq(agentDraft.id, opts.draftId),
          eq(agentDraft.status, opts.fromStatus),
        ),
      )
      .returning({ id: agentDraft.id })

    return rows.length > 0
  }

  async listPendingExpired(opts: { tenantId: string; now: Date }): Promise<Draft[]> {
    const rows = await this.db
      .select()
      .from(agentDraft)
      .where(
        and(
          eq(agentDraft.tenantId, opts.tenantId),
          eq(agentDraft.status, 'pending'),
          lt(agentDraft.expiresAt, opts.now),
        ),
      )

    return rows.map((row) => toDomain(row as AgentDraftRow))
  }

  async listAllPendingExpired(opts: { now: Date }): Promise<Draft[]> {
    const rows = await this.db
      .select()
      .from(agentDraft)
      .where(and(eq(agentDraft.status, 'pending'), lt(agentDraft.expiresAt, opts.now)))

    return rows.map((row) => toDomain(row as AgentDraftRow))
  }

  async listForApprover(opts: {
    tenantId: string
    approverId: string
    statuses?: DraftStatus[]
  }): Promise<Draft[]> {
    const conditions = [
      eq(agentDraft.tenantId, opts.tenantId),
      eq(agentDraft.approverUserId, opts.approverId),
    ]

    if (opts.statuses !== undefined && opts.statuses.length > 0) {
      conditions.push(inArray(agentDraft.status, opts.statuses))
    }

    const rows = await this.db
      .select()
      .from(agentDraft)
      .where(and(...conditions))

    return rows.map((row) => toDomain(row as AgentDraftRow))
  }

  async listAuditDrafts(opts: {
    tenantId: string
    initiatorUserId?: string
    approverUserId?: string
    tier?: DraftTier
    statuses?: DraftStatus[]
    domainKind?: string
    approvedAtFrom?: Date
    approvedAtTo?: Date
    taintAtDraftTime?: boolean
    page?: number
    pageSize?: number
  }): Promise<{ items: Draft[]; total: number }> {
    const page = opts.page ?? 1
    const pageSize = Math.min(opts.pageSize ?? 20, 100)
    const offset = (page - 1) * pageSize

    const conditions = [eq(agentDraft.tenantId, opts.tenantId)]

    if (opts.initiatorUserId !== undefined) {
      conditions.push(eq(agentDraft.initiatorUserId, opts.initiatorUserId))
    }
    if (opts.approverUserId !== undefined) {
      conditions.push(eq(agentDraft.approverUserId, opts.approverUserId))
    }
    if (opts.tier !== undefined) {
      conditions.push(eq(agentDraft.tier, opts.tier))
    }
    if (opts.statuses !== undefined && opts.statuses.length > 0) {
      conditions.push(inArray(agentDraft.status, opts.statuses))
    }
    if (opts.domainKind !== undefined) {
      conditions.push(like(agentDraft.toolName, `${opts.domainKind}.%`))
    }
    if (opts.approvedAtFrom !== undefined) {
      conditions.push(gte(agentDraft.approvedAt, opts.approvedAtFrom))
    }
    if (opts.approvedAtTo !== undefined) {
      conditions.push(lte(agentDraft.approvedAt, opts.approvedAtTo))
    }
    if (opts.taintAtDraftTime !== undefined) {
      conditions.push(eq(agentDraft.taintAtDraftTime, opts.taintAtDraftTime))
    }

    const where = and(...conditions)

    const totalRows = await this.db.select({ total: count() }).from(agentDraft).where(where)

    const total = Number(totalRows[0]?.total ?? 0)

    const rows = await this.db
      .select()
      .from(agentDraft)
      .where(where)
      .orderBy(agentDraft.draftedAt)
      .limit(pageSize)
      .offset(offset)

    return { items: rows.map((row) => toDomain(row as AgentDraftRow)), total }
  }
}
