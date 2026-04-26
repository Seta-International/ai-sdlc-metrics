/**
 * usage.ts — shared mapping from Vercel AI SDK `LanguageModelUsage` to the
 * agents module's internal `SubAgentUsage` shape.
 *
 * Both `OpenAiSubAgentLlmClient` (Plan 17 PR 2 Task 3) and
 * `OpenAiSynthesizerLlmClient` (Plan 17 PR 3 Task 9 / Plan 18 §1) need to
 * project the SDK's nested `inputTokenDetails` / `outputTokenDetails` into the
 * flat `SubAgentUsage` six-field shape. Centralising avoids drift and prevents
 * the lossy "hard-code 0" footgun that earlier copies suffered from.
 *
 * SDK contract (ai@6.0.x — `LanguageModelUsage` in `node_modules/.../ai/dist/index.d.ts`):
 *   - `inputTokenDetails.cacheReadTokens`
 *   - `inputTokenDetails.cacheWriteTokens`
 *   - `outputTokenDetails.reasoningTokens`
 *
 * `costUsd` is intentionally always 0 here — pricing is applied downstream by
 * the cost-recorder once the model + token totals are known.
 */

import type { SubAgentUsage } from '../../application/services/phase-executor-contracts'

/**
 * Structural input shape — accepts any object whose keys match the relevant
 * SDK fields. Using a structural type (rather than importing `LanguageModelUsage`
 * directly) keeps this helper trivially testable with minimal fixtures and
 * avoids coupling unrelated callers to the SDK type surface.
 */
export interface LanguageModelUsageLike {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly inputTokenDetails?: {
    readonly cacheReadTokens?: number
    readonly cacheWriteTokens?: number
  }
  readonly outputTokenDetails?: {
    readonly reasoningTokens?: number
  }
}

export function mapLanguageModelUsage(u: LanguageModelUsageLike): SubAgentUsage {
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    inputCachedRead: u.inputTokenDetails?.cacheReadTokens ?? 0,
    inputCachedWrite: u.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputReasoning: u.outputTokenDetails?.reasoningTokens ?? 0,
    costUsd: 0, // populated downstream by cost-recorder
  }
}
