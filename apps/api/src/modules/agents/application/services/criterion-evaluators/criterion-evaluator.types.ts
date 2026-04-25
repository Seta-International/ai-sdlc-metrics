export type CriterionSection = '18.1' | '18.2' | '18.3' | '18.4' | '18.5'

export type CriterionResult = {
  observedValue: string // numeric serialised as string
  threshold: string
  passed: boolean
  unableToEvaluate?: boolean // true when data source unavailable
  details?: Record<string, unknown>
}

export type EvalWindow = { start: Date; end: Date }

export interface CriterionEvaluator {
  readonly id: string
  readonly section: CriterionSection
  readonly description: string
  evaluate(window: EvalWindow): Promise<CriterionResult>
}
