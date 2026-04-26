/**
 * AgentEventRouter — routes incoming domain events to matching active schedules
 * and calls ScheduledTurnSpawner.spawn() for each match.
 *
 * Plan 09 §5 (Event-triggered spawn) / R-09.28:
 *
 *   "Event-router MUST filter schedule matches by `event.tenant_id === schedule.tenant_id`
 *   BEFORE calling ScheduledTurnSpawner.spawn(). Any attempted cross-tenant routing is
 *   rejected and audited as a P0 candidate."
 *
 * Cross-tenant guard (R-09.28):
 *   Before spawn() is called for any matched schedule, this router HARD-CHECKS that
 *   event.tenant_id === schedule.tenant_id. On mismatch:
 *     1. Skip the spawn (no pg-boss job is enqueued).
 *     2. Increment `agent_event_router_cross_tenant_rejected_total{tenant_id, event_type}`.
 *     3. Emit kernel audit event `agent.event_router_cross_tenant_rejected` for compliance.
 *
 * The label `tenant_id` on the metric uses the EVENT's tenant_id (not the schedule's),
 * so an alert on any non-zero value fires against the originating tenant context.
 *
 * Observability: Plan 09 §8, metric `agent_event_router_cross_tenant_rejected_total`.
 */

import { Injectable, Logger } from '@nestjs/common'
import { ScheduledTurnSpawner } from './scheduled-turn-spawner'
import { recordCrossTenantRejected } from '../../infrastructure/observability/event-router-metrics'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { Schedule } from '../../domain/entities/schedule.entity'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * An incoming domain event presented to the router.
 * Carried from the outbox_event polling relay (CLAUDE.md §Events).
 */
export interface IncomingDomainEvent {
  /** The tenant that emitted this event. Hard boundary for cross-tenant checks. */
  tenantId: string
  /** Fully-qualified domain event type, e.g. 'ticket.comment.created'. */
  eventType: string
  /** Raw event payload — passed through to the spawner for taint seeding. */
  payload: unknown
}

/**
 * Result of routing a single domain event against a set of candidate schedules.
 */
export interface RouteEventResult {
  /** Number of schedules where spawn() was successfully called. */
  spawnedCount: number
  /** Number of schedules rejected due to cross-tenant mismatch (R-09.28). */
  crossTenantRejectedCount: number
}

// ─── AgentEventRouter ────────────────────────────────────────────────────────

/**
 * Routes a domain event to matching agent schedules.
 *
 * Callers (domain event handlers, outbox relay) pass the incoming event plus
 * the candidate schedule list (already filtered by event_type from the DB so
 * the caller need not re-do that query). The router then enforces the
 * cross-tenant guard before delegating to ScheduledTurnSpawner.
 *
 * Callers own the schedule-lookup query (typically a DB query on
 * `agent_schedule WHERE trigger_kind = 'event' AND event_subscription->>'event_type' = :eventType
 * AND status = 'active'`). The router does NOT do DB lookups itself — it takes the
 * candidate list as input. This keeps the router testable without a DB connection.
 */
@Injectable()
export class AgentEventRouter {
  private readonly logger = new Logger(AgentEventRouter.name)

  constructor(
    private readonly spawner: ScheduledTurnSpawner,
    private readonly kernelAuditFacade: KernelAuditFacade,
  ) {}

  /**
   * Route a domain event to its matching schedules.
   *
   * For each candidate schedule:
   *   1. HARD-CHECK `event.tenantId === schedule.tenantId` (R-09.28).
   *      On mismatch → skip, emit metric + audit, continue.
   *   2. On match → call ScheduledTurnSpawner.spawn().
   *
   * All metric + audit calls happen BEFORE spawn() (there is no spawn on mismatch).
   *
   * @param event  - The incoming domain event (carries tenantId + eventType + payload).
   * @param candidateSchedules - Active event-triggered schedules for this event_type.
   *                             Caller has pre-filtered by event_type; this router adds
   *                             the tenant_id safety check on top.
   */
  async routeEvent(
    event: IncomingDomainEvent,
    candidateSchedules: Schedule[],
  ): Promise<RouteEventResult> {
    let spawnedCount = 0
    let crossTenantRejectedCount = 0

    for (const schedule of candidateSchedules) {
      // ── R-09.28: Cross-tenant guard ────────────────────────────────────────
      if (event.tenantId !== schedule.tenantId) {
        crossTenantRejectedCount++

        this.logger.warn(
          `AgentEventRouter: cross-tenant mismatch — event.tenantId=${event.tenantId} ` +
            `schedule.tenantId=${schedule.tenantId} scheduleId=${schedule.id} ` +
            `eventType=${event.eventType} — REJECTED (R-09.28 P0 candidate)`,
        )

        // Metric: agent_event_router_cross_tenant_rejected_total{tenant_id, event_type}
        // Uses event.tenantId so the alert fires in the originating tenant context.
        recordCrossTenantRejected(event.tenantId, event.eventType)

        // Kernel audit for compliance — P0 candidate
        await this.kernelAuditFacade.recordEvent({
          tenantId: event.tenantId,
          actorId: 'agent:event-router',
          eventType: 'agent.event_router_cross_tenant_rejected',
          module: 'agents',
          subjectId: schedule.id,
          payload: {
            eventTenantId: event.tenantId,
            scheduleTenantId: schedule.tenantId,
            scheduleId: schedule.id,
            eventType: event.eventType,
          },
        })

        // Do NOT call spawner.spawn() for this schedule.
        continue
      }

      // ── Tenant matches — proceed to spawn ──────────────────────────────────
      await this.spawner.spawn({
        schedule,
        firedBy: `event:${event.eventType}`,
        eventPayload: event.payload,
      })

      spawnedCount++
    }

    return { spawnedCount, crossTenantRejectedCount }
  }
}
