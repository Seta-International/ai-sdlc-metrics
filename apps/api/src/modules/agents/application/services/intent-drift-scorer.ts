/**
 * Deterministic scorer: for each (tool_name, invocation_context) pair in a
 * ReplayedTrace, checks whether the context matches the tool's `whenNotToUse`
 * declaration.
 *
 * Runs on every CI build against the golden-trace replay set.
 * Any violation → passed: false, which blocks merge.
 *
 * Matching is intentionally simple (substring, no LLM) — catches obvious
 * violations without false positives from fuzzy heuristics.
 */

import { Inject, Injectable } from '@nestjs/common'
import type {
  SetaScorer,
  ScorerContext,
  ScorerResult,
  ReplayedTrace,
} from '../../domain/scorer-types'
import { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'

export const TOOL_REGISTRY_TOKEN = Symbol('TOOL_REGISTRY_TOKEN')

export const INTENT_DRIFT_SCORER = Symbol('INTENT_DRIFT_SCORER')

export type IntentDriftResult = {
  violatingPairs: Array<{
    toolName: string
    invocationContext: string
    matchedClause: string
  }>
}

/**
 * Standalone drift checker — no NestJS injection required.
 * Can be used directly in CI runners without the DI container.
 *
 * @param toolCallsObserved - tool calls from the replayed trace
 * @param toolRegistry - the ToolRegistry instance to look up whenNotToUse
 * @returns ScorerResult with violating pairs in reason (if any)
 */
export function checkIntentDrift(
  toolCallsObserved: ReplayedTrace['toolCallsObserved'],
  toolRegistry: ToolRegistry,
): ScorerResult {
  const violatingPairs: IntentDriftResult['violatingPairs'] = []

  for (const toolCall of toolCallsObserved) {
    const descriptor = toolRegistry.getDescriptor(toolCall.toolName)

    // Tool not found in registry → no agent meta to check — skip. Unknown
    // tools are not scored; they may not have agent declarations.
    if (!descriptor) {
      continue
    }

    const whenNotToUse = descriptor.meta.whenNotToUse
    if (!whenNotToUse || whenNotToUse.trim() === '') {
      continue
    }

    if (contextMatchesWhenNotToUse(toolCall.invocationContext, whenNotToUse)) {
      violatingPairs.push({
        toolName: toolCall.toolName,
        invocationContext: toolCall.invocationContext,
        matchedClause: whenNotToUse,
      })
    }
  }

  if (violatingPairs.length === 0) {
    return { score: 1, passed: true }
  }

  // violatingPairs.length > 0 guaranteed by the check above
  const first = violatingPairs[0]!
  return {
    score: 0,
    passed: false,
    reason: `tool ${first.toolName} invoked in whenNotToUse context ${first.invocationContext}`,
  }
}

/**
 * Deterministic substring matching for whenNotToUse clauses.
 *
 * Logic (MVP — intentionally simple, no LLM):
 *   1. If invocationContext (lowercased) appears as a substring of whenNotToUse
 *      (lowercased) → match.
 *   2. If whenNotToUse contains a comma-separated list that includes the context
 *      (after lowercasing and trimming each token) → match.
 *
 * Pure function — no side effects.
 */
export function contextMatchesWhenNotToUse(
  invocationContext: string,
  whenNotToUse: string,
): boolean {
  const ctxLower = invocationContext.toLowerCase().trim()
  const clauseLower = whenNotToUse.toLowerCase()

  // Rule 1: direct substring match
  if (clauseLower.includes(ctxLower)) {
    return true
  }

  // Rule 2: comma-separated token match
  const tokens = clauseLower.split(',').map((t) => t.trim())
  if (tokens.includes(ctxLower)) {
    return true
  }

  return false
}

@Injectable()
export class IntentDriftScorer implements SetaScorer<ReplayedTrace, IntentDriftResult> {
  readonly id = 'intent-drift-v1'
  readonly name = 'Declared Intent Drift Scorer'
  readonly kind = 'deterministic' as const
  readonly scope = 'trace' as const
  readonly definitionSource = 'code' as const

  constructor(@Inject(TOOL_REGISTRY_TOKEN) private readonly toolRegistry: ToolRegistry) {}

  async run(ctx: ScorerContext<ReplayedTrace, IntentDriftResult>): Promise<ScorerResult> {
    return checkIntentDrift(ctx.input.toolCallsObserved, this.toolRegistry)
  }
}
