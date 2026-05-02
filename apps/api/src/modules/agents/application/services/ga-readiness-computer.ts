import { Inject, Injectable, Optional } from '@nestjs/common'
import type { GaReadinessStateEntity } from '../../domain/repositories/ga-readiness-state.repository'
import {
  GA_READINESS_STATE_REPOSITORY,
  GA_READINESS_SINGLETON_ID,
} from '../../domain/repositories/ga-readiness-state.repository'
import type { GaReadinessStateRepository } from '../../domain/repositories/ga-readiness-state.repository'
import { READINESS_CHECK_REPOSITORY } from '../../domain/repositories/readiness-check.repository'
import type { ReadinessCheckRepository } from '../../domain/repositories/readiness-check.repository'
import { RUNBOOK_DRY_RUN_REPOSITORY } from '../../domain/repositories/runbook-dry-run.repository'
import type {
  RunbookDryRunRepository,
  RunbookId,
} from '../../domain/repositories/runbook-dry-run.repository'
import { P1_INCIDENT_REPOSITORY } from '../../domain/repositories/p1-incident.repository'
import type { P1IncidentRepository } from '../../domain/repositories/p1-incident.repository'
import type { GaMetricsPort } from '../../domain/ports/ga-metrics.port'
import { GA_METRICS_PORT } from '../../domain/ports/ga-metrics.port'

const ALL_RUNBOOK_IDS: RunbookId[] = [
  'provider_outage',
  'budget_exhaustion_midflight',
  'quality_canary_degradation',
  'cross_tenant_leak_alert',
  'content_hash_store_miss',
  'adapter_dropped_cache_fields',
  'approval_inbox_flood',
  'gdpr_erasure_partial_success',
]

@Injectable()
export class GaReadinessComputer {
  constructor(
    @Inject(READINESS_CHECK_REPOSITORY)
    private readonly readinessCheckRepo: ReadinessCheckRepository,
    @Inject(GA_READINESS_STATE_REPOSITORY)
    private readonly gaReadinessStateRepo: GaReadinessStateRepository,
    @Inject(RUNBOOK_DRY_RUN_REPOSITORY)
    private readonly runbookRepo: RunbookDryRunRepository,
    @Inject(P1_INCIDENT_REPOSITORY)
    private readonly p1IncidentRepo: P1IncidentRepository,
    @Optional()
    @Inject(GA_METRICS_PORT)
    private readonly gaMetrics: GaMetricsPort | null,
  ) {}

  async compute(): Promise<GaReadinessStateEntity> {
    // a. Check all criteria passed
    const latestChecks = await this.readinessCheckRepo.findAllLatest()
    const allCriteriaPassed = latestChecks.length > 0 && latestChecks.every((c) => c.passed)

    const missingCriteria: { criterionId: string; reason: string }[] = []

    if (latestChecks.length === 0) {
      missingCriteria.push({
        criterionId: '*',
        reason: 'no readiness checks have been run yet',
      })
    } else {
      for (const check of latestChecks) {
        if (!check.passed) {
          missingCriteria.push({
            criterionId: check.criterionId,
            reason: `criterion failed: observed ${check.observedValue}, threshold ${check.threshold}`,
          })
        }
      }
    }

    // b. Compute consecutiveWindowsMet with 30-day temporal guard
    const previousState = await this.gaReadinessStateRepo.get()

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    let consecutiveWindowsMet: number
    let windowStartedPassingAt: Date | null

    if (!allCriteriaPassed) {
      // Any failure resets everything
      consecutiveWindowsMet = 0
      windowStartedPassingAt = null
    } else if (previousState === null || previousState.consecutiveWindowsMet === 0) {
      // First passing result — start the 30-day clock
      consecutiveWindowsMet = 1
      windowStartedPassingAt = new Date()
    } else if (previousState.consecutiveWindowsMet === 1) {
      const elapsed = Date.now() - (previousState.windowStartedPassingAt?.getTime() ?? Date.now())
      if (elapsed >= THIRTY_DAYS_MS) {
        consecutiveWindowsMet = 2
        windowStartedPassingAt = previousState.windowStartedPassingAt // preserve the original start
      } else {
        // Still within the same window — hold at 1, keep original start
        consecutiveWindowsMet = 1
        windowStartedPassingAt = previousState.windowStartedPassingAt
      }
    } else {
      // Already at 2 — stay there as long as criteria pass
      consecutiveWindowsMet = 2
      windowStartedPassingAt = previousState.windowStartedPassingAt
    }

    if (consecutiveWindowsMet < 2) {
      missingCriteria.push({
        criterionId: 'consecutiveWindowsMet',
        reason: `need 2 consecutive 30-day windows with all criteria passing; currently ${consecutiveWindowsMet}`,
      })
    }

    // c. Count P1 security incidents last 90 days
    const p1SecurityIncidentsLast90d = await this.p1IncidentRepo.countOpenSecurityLast90Days()

    if (p1SecurityIncidentsLast90d > 0) {
      missingCriteria.push({
        criterionId: 'p1SecurityIncidents',
        reason: `${p1SecurityIncidentsLast90d} P1 security incident(s) in last 90 days`,
      })
    }

    // d. Runbook coverage — all 8 runbooks must have passCount >= 1
    const coverage = await this.runbookRepo.getCoverage({ lookbackDays: 180 })
    const allRunbooksCovered = ALL_RUNBOOK_IDS.every((id) => (coverage[id]?.passCount ?? 0) >= 1)

    if (!allRunbooksCovered) {
      for (const id of ALL_RUNBOOK_IDS) {
        if ((coverage[id]?.passCount ?? 0) === 0) {
          missingCriteria.push({
            criterionId: `runbook.${id}`,
            reason: `runbook '${id}' has no passing dry-run in the last 180 days`,
          })
        }
      }
    }

    // e. Tenant count and interactive turns/day from GaMetricsPort (stub-safe)
    let tenantCount = 0
    let interactiveTurnsPerDay = 0

    if (this.gaMetrics !== null && this.gaMetrics.isEnabled()) {
      tenantCount = await this.gaMetrics.getTenantCount()
      interactiveTurnsPerDay = await this.gaMetrics.getInteractiveTurnsPerDay()
    }

    if (tenantCount < 3) {
      missingCriteria.push({
        criterionId: 'tenantCount',
        reason: `only ${tenantCount} tenant(s); need >= 3`,
      })
    }

    if (interactiveTurnsPerDay < 1000) {
      missingCriteria.push({
        criterionId: 'interactiveTurnsPerDay',
        reason: `only ${interactiveTurnsPerDay} interactive turns/day; need >= 1000`,
      })
    }

    // f. Compute isGaReady
    const isGaReady =
      allCriteriaPassed &&
      consecutiveWindowsMet >= 2 &&
      p1SecurityIncidentsLast90d === 0 &&
      allRunbooksCovered &&
      tenantCount >= 3 &&
      interactiveTurnsPerDay >= 1000

    // Filter out duplicate reason entries when already failing allCriteria
    // Keep missingCriteria deduplicated from items already added above
    const state: GaReadinessStateEntity = {
      id: GA_READINESS_SINGLETON_ID,
      isGaReady,
      computedAt: new Date(),
      missingCriteria,
      consecutiveWindowsMet,
      windowStartedPassingAt,
      tenantCount,
      interactiveTurnsPerDay,
      p1SecurityIncidentsLast90d,
    }

    // h. Upsert state
    await this.gaReadinessStateRepo.upsert(state)

    // i. Return state
    return state
  }
}
