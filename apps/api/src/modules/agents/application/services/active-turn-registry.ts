import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { eq } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { agentActiveTurns } from '../../infrastructure/schema/agents.schema'
import type { UsageSnapshot } from './abort-coordinator'

export interface TurnEntry {
  userId: string
  /** Budget tier assigned at turn start. Downstream services (sub-agent runner, synthesizer) read this to select the appropriate model. */
  tier: 'full' | 'nano'
  userCancelController: AbortController
  systemAbortController: AbortController
  turnAbortSignal: AbortSignal
  usageAccumulator: UsageSnapshot
  heartbeatTimer: ReturnType<typeof setInterval>
}

@Injectable()
export class ActiveTurnRegistry {
  private readonly turns = new Map<string, TurnEntry>()

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async register(opts: {
    traceId: string
    tenantId: string
    userId: string
    conversationId: string | null
    surface: string
    /** Budget tier from BudgetChecker.preTurnCheck — 'full' or 'nano'. Stored in-memory for downstream use within this pod. */
    tier: 'full' | 'nano'
    userCancelController: AbortController
    systemAbortController: AbortController
    turnAbortSignal: AbortSignal
    usageAccumulator: UsageSnapshot
  }): Promise<void> {
    const podId = process.env['POD_ID'] ?? 'local'

    await this.db.insert(agentActiveTurns).values({
      traceId: opts.traceId,
      tenantId: opts.tenantId,
      userId: opts.userId,
      conversationId: opts.conversationId ?? undefined,
      podId,
      surface: opts.surface,
    })

    const heartbeatTimer = setInterval(async () => {
      await this.db
        .update(agentActiveTurns)
        .set({ lastHeartbeatAt: new Date() })
        .where(eq(agentActiveTurns.traceId, opts.traceId))
    }, 5_000)

    this.turns.set(opts.traceId, {
      userId: opts.userId,
      tier: opts.tier,
      userCancelController: opts.userCancelController,
      systemAbortController: opts.systemAbortController,
      turnAbortSignal: opts.turnAbortSignal,
      usageAccumulator: opts.usageAccumulator,
      heartbeatTimer,
    })
  }

  async unregister(traceId: string): Promise<void> {
    const entry = this.turns.get(traceId)
    if (!entry) return
    clearInterval(entry.heartbeatTimer)
    this.turns.delete(traceId)
    await this.db.delete(agentActiveTurns).where(eq(agentActiveTurns.traceId, traceId))
  }

  getEntry(traceId: string): TurnEntry | undefined {
    return this.turns.get(traceId)
  }

  cancel(traceId: string): 'ok' | 'not_found' {
    const entry = this.turns.get(traceId)
    if (!entry) return 'not_found'
    entry.userCancelController.abort()
    return 'ok'
  }

  updateUsage(traceId: string, patch: Partial<UsageSnapshot>): void {
    const entry = this.turns.get(traceId)
    if (!entry) return
    Object.assign(entry.usageAccumulator, patch)
  }
}
