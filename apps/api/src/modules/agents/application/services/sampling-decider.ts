/**
 * SamplingDecider — evaluates a SamplingConfig once at the trace root.
 *
 * R-07.10: The decision is made ONCE at the trace root and inherited via NoOpSpan.
 * Deterministic for given inputs (no side effects beyond the optional random() call).
 *
 * Application layer — imports from domain/observability only.
 */

import type {
  SamplingConfig,
  TriggerPredicateContext,
} from '../../domain/observability/sampling-config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SamplingDecisionReason =
  | 'always'
  | 'never'
  | 'ratio_sampled_in'
  | 'ratio_sampled_out'
  | 'trigger_matched'
  | 'baseline_sampled_in'
  | 'baseline_sampled_out'
  | 'composite'

export interface SamplingDecision {
  capture: boolean
  reason: SamplingDecisionReason
  /** Names of matched trigger predicates — for diagnostics / logging */
  triggersMatched: string[]
}

// ─── SamplingDecider ─────────────────────────────────────────────────────────

export class SamplingDecider {
  decide(opts: {
    config: SamplingConfig
    ctx: TriggerPredicateContext
    /** Injectable for deterministic testing; defaults to Math.random() */
    random?: () => number
  }): SamplingDecision {
    const { config, ctx, random = Math.random } = opts

    switch (config.type) {
      case 'always':
        return { capture: true, reason: 'always', triggersMatched: [] }

      case 'never':
        return { capture: false, reason: 'never', triggersMatched: [] }

      case 'ratio': {
        const sampled = random() < config.probability
        return {
          capture: sampled,
          reason: sampled ? 'ratio_sampled_in' : 'ratio_sampled_out',
          triggersMatched: [],
        }
      }

      case 'triggered': {
        const matched = config.triggers
          .filter((trigger) => trigger(ctx))
          .map((trigger) => trigger.name)

        if (matched.length > 0) {
          return { capture: true, reason: 'trigger_matched', triggersMatched: matched }
        }

        const sampled = random() < config.baselineProbability
        return {
          capture: sampled,
          reason: sampled ? 'baseline_sampled_in' : 'baseline_sampled_out',
          triggersMatched: [],
        }
      }

      case 'composite': {
        const childDecisions = config.configs.map((child) =>
          this.decide({ config: child, ctx, random }),
        )
        const allTriggersMatched = childDecisions.flatMap((d) => d.triggersMatched)

        const capture =
          config.strategy === 'any'
            ? childDecisions.some((d) => d.capture)
            : childDecisions.every((d) => d.capture)

        return { capture, reason: 'composite', triggersMatched: allTriggersMatched }
      }
    }
  }
}
