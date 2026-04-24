import type { AnswerShape, AdversarialCategory } from '../scorer-types'

export interface GoldenTraceEntity {
  id: string
  title: string
  tenantId: string
  seedUserId: string
  userUtterance: string
  expectedToolCalls: string[]
  expectedShape: AnswerShape
  expectedPermissionKeys: string[]
  taintExpectation: boolean
  answerShapeContract: Record<string, unknown>
  adversarialCategory: AdversarialCategory | null
  createdBy: string
  createdAt: Date
  removedAt: Date | null
  removalReason: string | null
}

export interface GoldenTraceRepository {
  findActive(): Promise<GoldenTraceEntity[]>
  countActive(): Promise<number>
  insert(trace: Omit<GoldenTraceEntity, 'id' | 'createdAt'>): Promise<GoldenTraceEntity>
  retire(opts: { id: string; removalReason: string; at: Date }): Promise<void>
  findById(id: string): Promise<GoldenTraceEntity | null>
}

export const GOLDEN_TRACE_REPOSITORY = Symbol('GOLDEN_TRACE_REPOSITORY')
