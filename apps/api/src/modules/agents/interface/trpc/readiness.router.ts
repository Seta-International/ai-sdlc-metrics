/**
 * readiness.router.ts — Plan 13 Task 9
 *
 * tRPC router for production-readiness validation harness queries. Read-only;
 * all procedures require AGENT_READINESS_READ. Uses the module-level handler
 * slot pattern so the AgentsModule can wire concrete repositories at boot.
 */

import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { GaReadinessStateRepository } from '../../domain/repositories/ga-readiness-state.repository'
import type { ReadinessCheckRepository } from '../../domain/repositories/readiness-check.repository'
import type { RunbookDryRunScheduler } from '../../application/services/runbook-dry-run-scheduler'

// ─── Handler types ────────────────────────────────────────────────────────────

export interface ReadinessHandlers {
  gaReadinessStateRepo: Pick<GaReadinessStateRepository, 'get'>
  readinessCheckRepo: Pick<ReadinessCheckRepository, 'findAllLatest'>
  runbookScheduler: Pick<RunbookDryRunScheduler, 'getCoverage'>
}

// ─── Module-level handler slot ────────────────────────────────────────────────

let handlers: ReadinessHandlers | undefined

export function setReadinessHandlers(h: ReadinessHandlers): void {
  handlers = h
}

function h(): ReadinessHandlers {
  if (!handlers) throw new Error('readinessHandlers not wired — boot failure')
  return handlers
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const readinessRouter = router({
  // ── getState — singleton GA readiness row (or null if not yet computed) ────

  getState: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_READINESS_READ })
    .query(async () => {
      return h().gaReadinessStateRepo.get()
    }),

  // ── getCriteria — latest readiness check row per criterion ────────────────

  getCriteria: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_READINESS_READ })
    .query(async () => {
      return h().readinessCheckRepo.findAllLatest()
    }),

  // ── getRunbookCoverage — 180-day default lookback runbook coverage ─────────

  getRunbookCoverage: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_READINESS_READ })
    .query(async () => {
      return h().runbookScheduler.getCoverage()
    }),
})
