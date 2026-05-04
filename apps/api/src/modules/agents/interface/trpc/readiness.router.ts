/**
 * readiness.router.ts
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

export interface ReadinessHandlers {
  gaReadinessStateRepo: Pick<GaReadinessStateRepository, 'get'>
  readinessCheckRepo: Pick<ReadinessCheckRepository, 'findAllLatest'>
  runbookScheduler: Pick<RunbookDryRunScheduler, 'getCoverage'>
}

let handlers: ReadinessHandlers | undefined

export function setReadinessHandlers(h: ReadinessHandlers): void {
  handlers = h
}

function h(): ReadinessHandlers {
  if (!handlers) throw new Error('readinessHandlers not wired — boot failure')
  return handlers
}

export const readinessRouter = router({
  getState: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_READINESS_READ })
    .query(async () => {
      return h().gaReadinessStateRepo.get()
    }),

  getCriteria: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_READINESS_READ })
    .query(async () => {
      return h().readinessCheckRepo.findAllLatest()
    }),

  getRunbookCoverage: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_READINESS_READ })
    .query(async () => {
      return h().runbookScheduler.getCoverage()
    }),
})
