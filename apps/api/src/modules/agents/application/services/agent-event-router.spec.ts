/**
 * Tests for AgentEventRouter — Plan 09 §5 / R-09.28 cross-tenant event filter.
 *
 * TDD cases:
 *   1. Matching tenant_id → spawn() called, no rejection metric, no rejection audit.
 *   2. Mismatched tenant_id → spawn() NOT called, rejection metric incremented,
 *      audit event emitted.
 *   3. Mixed candidates (one match, one mismatch) → spawn() called once, metric
 *      incremented once for the mismatched schedule.
 *   4. Empty candidate list → spawn() not called, counts are zero.
 *   5. Cross-tenant guard runs BEFORE spawn() (spawn not called on mismatch).
 *
 * OTel metrics notes:
 *   Each test that verifies a metric counter uses a unique `event_type` label to
 *   prevent cross-test accumulation inside the shared in-process MeterProvider.
 *   This follows the same label-isolation strategy used in cost-metrics.spec.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import { metrics } from '@opentelemetry/api'
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics'
import { AgentEventRouter, type IncomingDomainEvent } from './agent-event-router'
import { __INTERNAL_resetInstruments } from '../../infrastructure/observability/event-router-metrics'
import type { ScheduledTurnSpawner } from './scheduled-turn-spawner'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { Schedule } from '../../domain/entities/schedule.entity'

// ─── Test constants ───────────────────────────────────────────────────────────

const TENANT_A = '01900000-0000-7fff-8000-aaaaaaaaaaaa'
const TENANT_B = '01900000-0000-7fff-8000-bbbbbbbbbbbb'
const SCHEDULE_ID_1 = '01900000-0000-7fff-8000-000000000001'
const SCHEDULE_ID_2 = '01900000-0000-7fff-8000-000000000002'

// ─── OTel test setup ─────────────────────────────────────────────────────────
//
// One MeterProvider per process: vitest runs each spec file in an isolated
// worker, so this registration does not conflict with other spec files.
// We use CUMULATIVE to accumulate across the full process run; each test
// that needs metric isolation uses a unique event_type label.

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 100_000,
    }),
  ],
})
metrics.setGlobalMeterProvider(meterProvider)

async function getCounterValue(
  metricName: string,
  attributes: Record<string, string>,
): Promise<number> {
  await meterProvider.forceFlush()
  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const m of sm.metrics) {
        if (m.descriptor.name === metricName) {
          for (const dp of m.dataPoints) {
            const attrs = dp.attributes as Record<string, string>
            if (Object.entries(attributes).every(([k, v]) => attrs[k] === v)) {
              return typeof dp.value === 'number' ? dp.value : 0
            }
          }
        }
      }
    }
  }
  return 0
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSchedule(
  tenantId: string,
  id: string,
  eventType = 'ticket.comment.created',
): Schedule {
  return {
    id,
    tenantId,
    kind: 'personal',
    ownerUserId: '01900000-0000-7fff-8000-000000000099',
    createdBy: '01900000-0000-7fff-8000-000000000099',
    triggerKind: 'event',
    cronExpression: null,
    eventSubscription: { eventType, filter: {} },
    prompt: 'Summarise this ticket comment',
    delegationId: '01900000-0000-7fff-8000-000000000010',
    costCeilingDailyUsd: '1.00',
    invocationCeilingDaily: 5,
    status: 'active',
    pauseReason: null,
    consecutiveFailureCount: 0,
    failureAlertPolicy: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeEvent(tenantId: string, eventType = 'ticket.comment.created'): IncomingDomainEvent {
  return {
    tenantId,
    eventType,
    payload: { commentId: 'c-1', body: 'hello' },
  }
}

// ─── Mock factories ───────────────────────────────────────────────────────────

function makeSpawner(): { spawn: ReturnType<typeof vi.fn> } {
  return {
    spawn: vi.fn().mockResolvedValue({ spawned: true }),
  }
}

function makeAuditFacade(): { recordEvent: ReturnType<typeof vi.fn> } {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AgentEventRouter', () => {
  let spawner: ReturnType<typeof makeSpawner>
  let auditFacade: ReturnType<typeof makeAuditFacade>
  let router: AgentEventRouter

  beforeEach(() => {
    // Reset metric instrument cache before each test so a new counter instance
    // is created. The shared MeterProvider accumulates values, but each test
    // uses a unique event_type label so counters are isolated per-test.
    __INTERNAL_resetInstruments()

    spawner = makeSpawner()
    auditFacade = makeAuditFacade()

    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    router = new AgentEventRouter(
      spawner as unknown as ScheduledTurnSpawner,
      auditFacade as unknown as KernelAuditFacade,
    )
  })

  // ─── 1. Matching tenant → spawn called ───────────────────────────────────────

  describe('matching tenant_id', () => {
    it('calls spawn() with the correct firedBy and eventPayload', async () => {
      const EVENT_TYPE = 'test.matching.spawn'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_A, SCHEDULE_ID_1, EVENT_TYPE)

      const result = await router.routeEvent(event, [schedule])

      expect(result.spawnedCount).toBe(1)
      expect(result.crossTenantRejectedCount).toBe(0)

      expect(spawner.spawn).toHaveBeenCalledOnce()
      expect(spawner.spawn).toHaveBeenCalledWith({
        schedule,
        firedBy: `event:${EVENT_TYPE}`,
        eventPayload: event.payload,
      })
    })

    it('does NOT increment the cross-tenant rejection metric', async () => {
      const EVENT_TYPE = 'test.matching.no-metric'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_A, SCHEDULE_ID_1, EVENT_TYPE)

      await router.routeEvent(event, [schedule])

      const count = await getCounterValue('agent_event_router_cross_tenant_rejected_total', {
        tenant_id: TENANT_A,
        event_type: EVENT_TYPE,
      })
      expect(count).toBe(0)
    })

    it('does NOT emit a cross-tenant audit event', async () => {
      const EVENT_TYPE = 'test.matching.no-audit'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_A, SCHEDULE_ID_1, EVENT_TYPE)

      await router.routeEvent(event, [schedule])

      expect(auditFacade.recordEvent).not.toHaveBeenCalled()
    })
  })

  // ─── 2. Mismatched tenant → spawn NOT called, metric + audit emitted ─────────

  describe('mismatched tenant_id (R-09.28)', () => {
    it('does NOT call spawn()', async () => {
      const EVENT_TYPE = 'test.mismatch.no-spawn'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_B, SCHEDULE_ID_1, EVENT_TYPE)

      const result = await router.routeEvent(event, [schedule])

      expect(result.spawnedCount).toBe(0)
      expect(result.crossTenantRejectedCount).toBe(1)

      expect(spawner.spawn).not.toHaveBeenCalled()
    })

    it('increments agent_event_router_cross_tenant_rejected_total', async () => {
      const EVENT_TYPE = 'test.mismatch.metric'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_B, SCHEDULE_ID_1, EVENT_TYPE)

      await router.routeEvent(event, [schedule])

      const count = await getCounterValue('agent_event_router_cross_tenant_rejected_total', {
        tenant_id: TENANT_A,
        event_type: EVENT_TYPE,
      })
      expect(count).toBe(1)
    })

    it('emits agent.event_router_cross_tenant_rejected kernel audit event', async () => {
      const EVENT_TYPE = 'test.mismatch.audit'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_B, SCHEDULE_ID_1, EVENT_TYPE)

      await router.routeEvent(event, [schedule])

      expect(auditFacade.recordEvent).toHaveBeenCalledOnce()
      expect(auditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          actorId: 'agent:event-router',
          eventType: 'agent.event_router_cross_tenant_rejected',
          module: 'agents',
          subjectId: SCHEDULE_ID_1,
          payload: expect.objectContaining({
            eventTenantId: TENANT_A,
            scheduleTenantId: TENANT_B,
            scheduleId: SCHEDULE_ID_1,
            eventType: EVENT_TYPE,
          }),
        }),
      )
    })

    it('metric uses the event tenant_id, not the schedule tenant_id', async () => {
      const EVENT_TYPE = 'test.mismatch.label'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const schedule = makeSchedule(TENANT_B, SCHEDULE_ID_1, EVENT_TYPE)

      await router.routeEvent(event, [schedule])

      // The metric should be attributed to the EVENT's tenant (TENANT_A), not TENANT_B.
      const countA = await getCounterValue('agent_event_router_cross_tenant_rejected_total', {
        tenant_id: TENANT_A,
        event_type: EVENT_TYPE,
      })
      const countB = await getCounterValue('agent_event_router_cross_tenant_rejected_total', {
        tenant_id: TENANT_B,
        event_type: EVENT_TYPE,
      })
      expect(countA).toBe(1)
      expect(countB).toBe(0)
    })
  })

  // ─── 3. Mixed candidates: one match, one mismatch ────────────────────────────

  describe('mixed candidates', () => {
    it('spawns only for the matching schedule and rejects the mismatched one', async () => {
      const EVENT_TYPE = 'test.mixed.spawn-count'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const scheduleA = makeSchedule(TENANT_A, SCHEDULE_ID_1, EVENT_TYPE)
      const scheduleB = makeSchedule(TENANT_B, SCHEDULE_ID_2, EVENT_TYPE)

      const result = await router.routeEvent(event, [scheduleA, scheduleB])

      expect(result.spawnedCount).toBe(1)
      expect(result.crossTenantRejectedCount).toBe(1)

      expect(spawner.spawn).toHaveBeenCalledOnce()
      expect(spawner.spawn).toHaveBeenCalledWith(expect.objectContaining({ schedule: scheduleA }))
    })

    it('metric increments once for the mismatched schedule only', async () => {
      const EVENT_TYPE = 'test.mixed.metric'
      const event = makeEvent(TENANT_A, EVENT_TYPE)
      const scheduleA = makeSchedule(TENANT_A, SCHEDULE_ID_1, EVENT_TYPE)
      const scheduleB = makeSchedule(TENANT_B, SCHEDULE_ID_2, EVENT_TYPE)

      await router.routeEvent(event, [scheduleA, scheduleB])

      const count = await getCounterValue('agent_event_router_cross_tenant_rejected_total', {
        tenant_id: TENANT_A,
        event_type: EVENT_TYPE,
      })
      expect(count).toBe(1)
    })
  })

  // ─── 4. Empty candidate list ──────────────────────────────────────────────────

  describe('empty candidate list', () => {
    it('returns zero counts and does not call spawn()', async () => {
      const EVENT_TYPE = 'test.empty.no-spawn'
      const event = makeEvent(TENANT_A, EVENT_TYPE)

      const result = await router.routeEvent(event, [])

      expect(result.spawnedCount).toBe(0)
      expect(result.crossTenantRejectedCount).toBe(0)
      expect(spawner.spawn).not.toHaveBeenCalled()
    })
  })

  // ─── 5. Guard fires BEFORE spawn (spawn is the only side effect) ──────────────

  describe('ordering: guard runs before spawn', () => {
    it('audit event is emitted before spawn is called when tenants mismatch', async () => {
      const EVENT_TYPE = 'test.ordering.audit-before-spawn'
      const callOrder: string[] = []

      auditFacade.recordEvent.mockImplementation(async () => {
        callOrder.push('audit')
      })
      spawner.spawn.mockImplementation(async () => {
        callOrder.push('spawn')
        return { spawned: true }
      })

      const event = makeEvent(TENANT_A, EVENT_TYPE)
      // Two schedules: first mismatched (triggers audit), second matching (triggers spawn).
      const mismatch = makeSchedule(TENANT_B, SCHEDULE_ID_1, EVENT_TYPE)
      const match = makeSchedule(TENANT_A, SCHEDULE_ID_2, EVENT_TYPE)

      await router.routeEvent(event, [mismatch, match])

      // audit for mismatch fires first, then spawn for match — spawn never fires for mismatch
      expect(callOrder).toEqual(['audit', 'spawn'])
    })
  })
})
