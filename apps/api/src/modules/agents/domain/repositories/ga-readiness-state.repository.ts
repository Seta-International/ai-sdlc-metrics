/**
 * ga-readiness-state.repository.ts — Plan 13 Task 2
 *
 * Domain repository interface for the singleton GA readiness state row.
 * The harness upserts a fixed well-known UUID so there is effectively
 * one row in this table at all times.
 */

export interface GaReadinessStateEntity {
  id: string
  isGaReady: boolean
  computedAt: Date
  missingCriteria: { criterionId: string; reason: string }[]
  consecutiveWindowsMet: number
  tenantCount: number
  interactiveTurnsPerDay: number
  p1SecurityIncidentsLast90d: number
}

export interface GaReadinessStateRepository {
  /** Always upserts the fixed GA_READINESS_SINGLETON_ID row. */
  upsert(state: GaReadinessStateEntity): Promise<void>
  get(): Promise<GaReadinessStateEntity | null>
}

export const GA_READINESS_STATE_REPOSITORY = Symbol('GA_READINESS_STATE_REPOSITORY')

/** The singleton row uses this fixed well-known UUID. */
export const GA_READINESS_SINGLETON_ID = '00000000-0000-0000-0000-000000000013'
