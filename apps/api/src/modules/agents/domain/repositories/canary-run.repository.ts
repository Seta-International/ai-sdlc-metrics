import type { ModelTier } from '../scorer-types'

export type CanaryOutcome = 'passed' | 'failed' | 'error'

export interface CanaryRunEntity {
  id: string
  runAt: Date
  tier: ModelTier
  canaryQueryId: string
  tenantId: string
  traceId: string
  outcome: CanaryOutcome
  score: number
  durationMs: number
}

export interface CanaryRunRepository {
  insert(run: Omit<CanaryRunEntity, 'id'>): Promise<CanaryRunEntity>
  findRecent(opts: { tier: ModelTier; sinceMs: number }): Promise<CanaryRunEntity[]>
  findRecentByTier(opts: { tier: ModelTier; limit: number }): Promise<CanaryRunEntity[]>
}

export const CANARY_RUN_REPOSITORY = Symbol('CANARY_RUN_REPOSITORY')
