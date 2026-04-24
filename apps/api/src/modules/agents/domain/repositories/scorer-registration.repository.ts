import type { ScorerKind, ScorerScope } from '../scorer-types'

export type ScorerStatus = 'provisional' | 'gating_eligible'

export interface ScorerRegistrationEntity {
  scorerId: string
  name: string
  kind: ScorerKind
  scope: ScorerScope
  registeredAt: Date
  metaEvalAgreement: number | null
  status: ScorerStatus
}

export interface ScorerRegistrationRepository {
  upsert(reg: Omit<ScorerRegistrationEntity, 'registeredAt'>): Promise<ScorerRegistrationEntity>
  findById(scorerId: string): Promise<ScorerRegistrationEntity | null>
  findAll(): Promise<ScorerRegistrationEntity[]>
  promote(scorerId: string, metaEvalAgreement: number): Promise<void>
  demote(scorerId: string): Promise<void>
}

export const SCORER_REGISTRATION_REPOSITORY = Symbol('SCORER_REGISTRATION_REPOSITORY')
