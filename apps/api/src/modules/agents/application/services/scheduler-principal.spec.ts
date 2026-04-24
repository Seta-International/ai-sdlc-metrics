import { describe, it, expect } from 'vitest'
import { SchedulerPrincipal } from './scheduler-principal'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { AgentDelegation } from '../../../kernel/application/facades/kernel-delegation.facade'

// ─── Test constants ───────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7fff-8000-000000000001'
const USER_ID = '01900000-0000-7fff-8000-000000000002'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000003'

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: '01900000-0000-7fff-8000-000000000010',
    tenantId: TENANT_ID,
    kind: 'personal',
    ownerUserId: USER_ID,
    createdBy: USER_ID,
    triggerKind: 'cron',
    cronExpression: '0 * * * *',
    eventSubscription: null,
    prompt: 'daily summary',
    delegationId: DELEGATION_ID,
    costCeilingDailyUsd: '1.00',
    invocationCeilingDaily: 5,
    status: 'active',
    pauseReason: null,
    consecutiveFailureCount: 0,
    failureAlertPolicy: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeDelegation(overrides: Partial<AgentDelegation> = {}): AgentDelegation {
  return {
    id: DELEGATION_ID,
    tenantId: TENANT_ID,
    delegatorUserId: USER_ID,
    delegate: 'agent:scheduler',
    scope: {},
    expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    status: 'active',
    autonomousWritesAllowed: false,
    createdAt: new Date(),
    ...overrides,
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SchedulerPrincipal', () => {
  const service = new SchedulerPrincipal()

  describe('resolve() — personal schedule', () => {
    it('returns actor=user, userOnBehalfOf=ownerUserId, canDoBasis=delegator', () => {
      const schedule = makeSchedule({ kind: 'personal', ownerUserId: USER_ID })
      const delegation = makeDelegation()

      const result = service.resolve({ schedule, delegation })

      expect(result.actorPrincipal).toBe('user')
      expect(result.userOnBehalfOf).toBe(USER_ID)
      expect(result.delegationId).toBe(DELEGATION_ID)
      expect(result.canDoBasis).toBe('delegator')
    })
  })

  describe('resolve() — tenant_wide schedule', () => {
    it('returns actor=agent:scheduler, userOnBehalfOf=null, canDoBasis=scheduler', () => {
      const schedule = makeSchedule({
        kind: 'tenant_wide',
        ownerUserId: null,
        delegationId: DELEGATION_ID,
      })
      const delegation = makeDelegation({ delegatorUserId: null })

      const result = service.resolve({ schedule, delegation })

      expect(result.actorPrincipal).toBe('agent:scheduler')
      expect(result.userOnBehalfOf).toBeNull()
      expect(result.delegationId).toBe(DELEGATION_ID)
      expect(result.canDoBasis).toBe('scheduler')
    })
  })
})
