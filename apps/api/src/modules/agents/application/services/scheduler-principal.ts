import { Injectable } from '@nestjs/common'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { AgentDelegation } from '../../../kernel/application/facades/kernel-delegation.facade'

export interface SchedulerPrincipalResult {
  actorPrincipal: 'user' | 'agent:scheduler'
  userOnBehalfOf: string | null
  delegationId: string
  canDoBasis: 'delegator' | 'scheduler'
}

/**
 * Resolves the effective identity for a scheduled agent run at spawn time.
 *
 * - personal schedule  → impersonate the owner user (canDo checks run as delegator)
 * - tenant_wide schedule → act as the scheduler principal itself (canDo checks run as scheduler)
 *
 * Pure logic — no DB, no external dependencies.
 */
@Injectable()
export class SchedulerPrincipal {
  resolve(opts: { schedule: Schedule; delegation: AgentDelegation }): SchedulerPrincipalResult {
    const { schedule, delegation } = opts

    if (schedule.kind === 'personal') {
      return {
        actorPrincipal: 'user',
        userOnBehalfOf: schedule.ownerUserId,
        delegationId: delegation.id,
        canDoBasis: 'delegator',
      }
    }

    // tenant_wide
    return {
      actorPrincipal: 'agent:scheduler',
      userOnBehalfOf: null,
      delegationId: delegation.id,
      canDoBasis: 'scheduler',
    }
  }
}
