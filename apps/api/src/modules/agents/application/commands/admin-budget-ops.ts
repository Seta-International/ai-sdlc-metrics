import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { agentTenantBudget } from '../../infrastructure/schema/agents.schema'
import { recordBudgetRefill } from '../../infrastructure/observability/cost-metrics'

// ─── AdminBudgetOps ───────────────────────────────────────────────────────────

/**
 * Admin write operations for tenant budget management.
 *
 * Authorization (`canDo('admin.budget.topup')`) is enforced at the tRPC layer
 * (Plan 09 wiring). This service is responsible for data mutations and audit
 * trail only.
 */
@Injectable()
export class AdminBudgetOps {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  /**
   * Add `amountUsd` to the tenant's remaining budget.
   * Emits a `agent.budget_topup` kernel audit event.
   */
  async topUp(opts: {
    tenantId: string
    amountUsd: number
    reason: string
    actorUserId: string
  }): Promise<void> {
    await this.db
      .update(agentTenantBudget)
      .set({
        remainingUsd: sql`${agentTenantBudget.remainingUsd} + ${String(opts.amountUsd)}`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))

    await this.auditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: opts.actorUserId,
      eventType: 'agent.budget_topup',
      module: 'agents',
      subjectId: opts.tenantId,
      payload: {
        amountUsd: opts.amountUsd,
        reason: opts.reason,
      },
    })

    // Emit budget refill metric (Plan 05 §8, R-05.33–R-05.34).
    recordBudgetRefill(opts.tenantId, 'admin_topup')
  }

  /**
   * Set the tenant's daily budget limit to `amountUsd`.
   * Emits a `agent.budget_limit_changed` kernel audit event.
   */
  async setDailyLimit(opts: {
    tenantId: string
    amountUsd: number
    actorUserId: string
  }): Promise<void> {
    await this.db
      .update(agentTenantBudget)
      .set({
        dailyLimitUsd: String(opts.amountUsd),
        updatedAt: sql`NOW()`,
      })
      .where(eq(agentTenantBudget.tenantId, opts.tenantId))

    await this.auditFacade.recordEvent({
      tenantId: opts.tenantId,
      actorId: opts.actorUserId,
      eventType: 'agent.budget_limit_changed',
      module: 'agents',
      subjectId: opts.tenantId,
      payload: {
        dailyLimitUsd: opts.amountUsd,
      },
    })
  }
}
