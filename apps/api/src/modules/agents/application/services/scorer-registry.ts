/**
 * scorer-registry.ts — Plan 10 Task 4
 *
 * Manages SetaScorer instances with registration-time enforcement.
 *
 * Registration rules (R-10.7, R-10.8, R-10.32):
 *   1. kind: 'llm-judge' + role 'iterative-topology-exit-gate' → always rejected
 *   2. kind: 'llm-judge' + scope != 'test' + metaEvalAgreement < 0.95 → rejected
 *   3. Duplicate id → rejected
 *
 * Audit event (R-10.9) is deferred to a later decorator/wrapper phase (MVP skip).
 */

import { Injectable } from '@nestjs/common'
import type { SetaScorer, ScorerKind } from '../../domain/scorer-types'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const SCORER_REGISTRY = Symbol('SCORER_REGISTRY')

// ─── Error ─────────────────────────────────────────────────────────────────────

export class ScorerRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScorerRegistrationError'
  }
}

// ─── Registration options ─────────────────────────────────────────────────────

export interface ScorerRegistrationOpts {
  /**
   * Optional target role. If set to 'iterative-topology-exit-gate', any
   * `kind: 'llm-judge'` scorer is rejected at registration time per
   * §3.1 invariant 4 (plan 12, R-10.32).
   */
  role?: string
  /**
   * Required for `kind: 'llm-judge'` scorers with scope other than 'test'.
   * Must be >= 0.95 (R-10.8).
   */
  metaEvalAgreement?: number
}

// ─── ScorerRegistry ───────────────────────────────────────────────────────────

@Injectable()
export class ScorerRegistry {
  private readonly scorers = new Map<string, SetaScorer>()

  /**
   * Register a scorer with optional role/metaEvalAgreement opts.
   *
   * @throws {ScorerRegistrationError} on any registration rule violation.
   */
  register(scorer: SetaScorer, opts?: ScorerRegistrationOpts): void {
    this.enforceRegistrationRules(scorer, opts)
    this.scorers.set(scorer.id, scorer)
  }

  /** All registered scorers, keyed by id. */
  getAll(): ReadonlyMap<string, SetaScorer> {
    return this.scorers
  }

  /** All scorers with kind === 'deterministic'. */
  getDeterministic(): SetaScorer[] {
    return Array.from(this.scorers.values()).filter(
      (s): s is SetaScorer & { kind: Extract<ScorerKind, 'deterministic'> } =>
        s.kind === 'deterministic',
    )
  }

  /** All scorers with kind === 'llm-judge'. */
  getLlmJudge(): SetaScorer[] {
    return Array.from(this.scorers.values()).filter(
      (s): s is SetaScorer & { kind: Extract<ScorerKind, 'llm-judge'> } => s.kind === 'llm-judge',
    )
  }

  /** Look up a scorer by id, or undefined if not found. */
  findById(id: string): SetaScorer | undefined {
    return this.scorers.get(id)
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private enforceRegistrationRules(scorer: SetaScorer, opts?: ScorerRegistrationOpts): void {
    // Rule 1: duplicate id
    if (this.scorers.has(scorer.id)) {
      throw new ScorerRegistrationError(`Scorer with id ${scorer.id} is already registered`)
    }

    if (scorer.kind === 'llm-judge') {
      // Rule 2: llm-judge + iterative-topology-exit-gate → always rejected (R-10.32)
      if (opts?.role === 'iterative-topology-exit-gate') {
        throw new ScorerRegistrationError(
          'LLM-judge scorers cannot be registered as iterative-topology exit gates (§3.1 invariant 4, plan 12)',
        )
      }

      // Rule 3: llm-judge + scope != 'test' requires metaEvalAgreement >= 0.95 (R-10.8)
      if (scorer.scope !== 'test') {
        if (opts?.metaEvalAgreement === undefined || opts.metaEvalAgreement < 0.95) {
          throw new ScorerRegistrationError(
            'LLM-judge scorers with scope other than test require metaEvalAgreement >= 0.95',
          )
        }
      }
    }
  }
}
