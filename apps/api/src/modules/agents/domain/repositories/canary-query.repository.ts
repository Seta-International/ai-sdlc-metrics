import type { ModelTier } from '../scorer-types'

export type CanarySource = 'production_anonymized' | 'manually_authored'
export type CanaryQueryStatus = 'active' | 'retired'

export interface CanaryQueryEntity {
  id: string
  tier: ModelTier
  utterance: string
  tenantId: string
  expectedAnswerContract: Record<string, unknown>
  rotationQuarter: string
  source: CanarySource
  status: CanaryQueryStatus
}

export interface CanaryQueryRepository {
  findActive(tier: ModelTier): Promise<CanaryQueryEntity[]>
  findActiveByQuarter(quarter: string): Promise<CanaryQueryEntity[]>
  insertBatch(queries: Omit<CanaryQueryEntity, 'id'>[]): Promise<CanaryQueryEntity[]>
  retireByQuarter(quarter: string): Promise<number>
  findNextRoundRobin(tier: ModelTier, afterId?: string): Promise<CanaryQueryEntity | null>
}

export const CANARY_QUERY_REPOSITORY = Symbol('CANARY_QUERY_REPOSITORY')
