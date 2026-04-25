/**
 * readiness-check.repository.ts — Plan 13 Task 2
 *
 * Domain repository interface for persisted GA-readiness criterion evaluations.
 * Each row records the pass/fail result of one criterion over one evaluation window.
 */

export interface ReadinessCheckEntity {
  id: string
  criterionId: string
  windowStart: Date
  windowEnd: Date
  observedValue: string
  threshold: string
  passed: boolean
  notes: string | null
  computedAt: Date
}

export interface ReadinessCheckRepository {
  insert(check: Omit<ReadinessCheckEntity, 'id'>): Promise<ReadinessCheckEntity>
  findLatestByCriterion(criterionId: string): Promise<ReadinessCheckEntity | null>
  findByCriterionSince(criterionId: string, since: Date): Promise<ReadinessCheckEntity[]>
  /** One row per criterion — the most recent window_end for each distinct criterion_id. */
  findAllLatest(): Promise<ReadinessCheckEntity[]>
}

export const READINESS_CHECK_REPOSITORY = Symbol('READINESS_CHECK_REPOSITORY')
