/**
 * Deterministic rule-based service that compares a baseline turn output against
 * a candidate (shadow) turn output and produces a diff score and category.
 *
 * MVP only — LLM-judge diff is GA-activation-gated.
 * No DB access, no external calls, no NestJS injection required.
 */

import { Injectable } from '@nestjs/common'

export interface TurnResult {
  /** Ordered list of tool names called during the turn */
  toolCallNames: string[]
  /** Permission keys that were checked / used during the turn */
  permissionKeys: string[]
  /** High-level shape of the agent's answer */
  answerShape: 'short-answer' | 'list' | 'table' | 'narrative' | 'chart' | 'refusal'
  // textSummary: optional text for future LLM judge (not used in MVP)
}

export interface DiffResult {
  /** 0–1 (0 = identical, 1 = maximally different) */
  score: number
  /** Categorical classification of how much the outputs diverged */
  category: 'identical' | 'minor_difference' | 'major_difference' | 'shadow_errored'
  componentDiffs: {
    /** Jaccard similarity of tool-call sets (1 = fully overlapping) */
    toolCallOverlap: number
    /** 0 if same shape, 1 if different */
    shapeDiff: number
    /** Jaccard similarity of permission-key sets (1 = fully overlapping) */
    permissionKeyOverlap: number
  }
}

/** Returned when shadow turn errored and there is no candidate output to compare */
export interface ShadowErroredResult {
  score: 1
  category: 'shadow_errored'
  componentDiffs: { toolCallOverlap: 0; shapeDiff: 0; permissionKeyOverlap: 0 }
}

const SHADOW_ERRORED_RESULT: ShadowErroredResult = Object.freeze({
  score: 1,
  category: 'shadow_errored' as const,
  componentDiffs: Object.freeze({ toolCallOverlap: 0, shapeDiff: 0, permissionKeyOverlap: 0 }),
})

/**
 * Jaccard similarity of two arrays treated as sets.
 * If both are empty → 1.0 (treat as identical empty sets).
 */
function jaccardOverlap(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)

  if (setA.size === 0 && setB.size === 0) {
    return 1
  }

  let intersectionSize = 0
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++
    }
  }

  // union = |A| + |B| - |A ∩ B|
  const unionSize = setA.size + setB.size - intersectionSize

  return intersectionSize / unionSize
}

/**
 * Classify a composite score into a diff category.
 *   score === 0 → 'identical'
 *   0 < score < 0.4 → 'minor_difference'
 *   score >= 0.4 → 'major_difference'
 */
function classifyScore(score: number): 'identical' | 'minor_difference' | 'major_difference' {
  if (score === 0) return 'identical'
  if (score < 0.4) return 'minor_difference'
  return 'major_difference'
}

@Injectable()
export class ShadowDiffScorer {
  /**
   * Compare baseline turn output against a candidate (shadow) output.
   *
   * @param opts.baselineOutput - The production/baseline turn result.
   * @param opts.candidateOutput - The shadow turn result, or null if the shadow errored.
   * @returns A DiffResult describing the divergence, or a ShadowErroredResult.
   */
  score(opts: { baselineOutput: TurnResult; candidateOutput: TurnResult | null }): DiffResult {
    if (opts.candidateOutput === null) {
      return SHADOW_ERRORED_RESULT
    }

    const { baselineOutput, candidateOutput } = opts

    const toolCallOverlap = jaccardOverlap(
      baselineOutput.toolCallNames,
      candidateOutput.toolCallNames,
    )

    const shapeDiff = baselineOutput.answerShape === candidateOutput.answerShape ? 0 : 1

    const permissionKeyOverlap = jaccardOverlap(
      baselineOutput.permissionKeys,
      candidateOutput.permissionKeys,
    )

    // Weighted composite score (lower = more similar):
    // score = (1 - toolCallOverlap) * 0.5
    //       + shapeDiff * 0.3
    //       + (1 - permissionKeyOverlap) * 0.2
    const rawScore =
      (1 - toolCallOverlap) * 0.5 + shapeDiff * 0.3 + (1 - permissionKeyOverlap) * 0.2

    // Clamp to [0, 1] to guard against floating-point edge cases
    const score = Math.min(1, Math.max(0, rawScore))

    return {
      score,
      category: classifyScore(score),
      componentDiffs: {
        toolCallOverlap,
        shapeDiff,
        permissionKeyOverlap,
      },
    }
  }
}
