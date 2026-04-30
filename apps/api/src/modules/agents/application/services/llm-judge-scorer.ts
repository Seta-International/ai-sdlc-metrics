/**
 * LlmJudgeScorer — observe-only stub at MVP.
 *
 * The registration path, typed prompts, and stub implementation exist at MVP
 * but are observe-only — never gates CI, merge, or routing until Beta promotion
 * criteria are met. Activation to gating role requires SetaGoldenCorpus ≥ 100
 * hand-labeled rows AND meta_eval_agreement ≥ 0.95.
 *
 * Iterative-topology exit-gate registration is rejected at the ScorerRegistry
 * level — LlmJudgeScorer itself doesn't need to enforce this.
 */

import type {
  SetaScorer,
  ScorerResult,
  ScorerContext,
  ScorerScope,
  ReplayedTrace,
} from '../../domain/scorer-types'

export const LLM_JUDGE_SCORER = Symbol('LLM_JUDGE_SCORER')

/**
 * Typed wrapper for LLM judge prompts.
 * Handlebars-style placeholders: {{traceId}}, {{input}}, etc.
 */
export type TypedPromptTemplate = {
  system: string
  /** Handlebars-style template: {{traceId}}, {{input}}, {{output}}, etc. */
  userTemplate: string
  outputSchema: 'score-0-1-with-reason'
}

/**
 * What the judge produces (or would produce when activated at Beta).
 */
export type JudgeResult = {
  score: 0 | 1
  passed: boolean
  reason: string
}

/**
 * Observe-only LLM judge scorer stub.
 *
 * Multiple instances are created manually (one per use case) and registered
 * with ScorerRegistry. This class is NOT @Injectable() — it is constructed
 * via an options object so instances can be created without NestJS DI.
 *
 * At MVP: run() always returns { score: 0, passed: true, reason: 'observe-only' }.
 * When Beta activation criteria are met (≥100 labeled rows + agreement ≥0.95),
 * this stub is replaced with a real LLM judge call.
 */
export class LlmJudgeScorer implements SetaScorer<ReplayedTrace, JudgeResult> {
  readonly id: string
  readonly name: string
  readonly kind = 'llm-judge' as const
  readonly scope: ScorerScope
  readonly definitionSource = 'code' as const
  readonly promptTemplate: TypedPromptTemplate
  metaEvalAgreement?: number

  constructor(opts: {
    id: string
    name: string
    scope: ScorerScope
    promptTemplate: TypedPromptTemplate
    metaEvalAgreement?: number
  }) {
    this.id = opts.id
    this.name = opts.name
    this.scope = opts.scope
    this.promptTemplate = opts.promptTemplate
    this.metaEvalAgreement = opts.metaEvalAgreement
  }

  /**
   * Observe-only stub — never returns a real score at MVP.
   *
   * Returns { score: 0, passed: true, reason: 'observe-only' } always.
   * passed: true is required — a false here would falsely gate CI.
   *
   * When Beta activation criteria are met (≥100 labeled rows + agreement ≥0.95),
   * this stub is replaced with a real LLM judge call.
   */
  async run(_ctx: ScorerContext<ReplayedTrace, JudgeResult>): Promise<ScorerResult> {
    return { score: 0, passed: true, reason: 'observe-only' }
  }
}
