/**
 * SubAgentRetriever — Plan 02 Task 8 (R-02.26, §4, §5 step 5, §16 Activation Gate)
 *
 * Ships enabled but structurally dormant for the 3-module MVP case:
 *   - At ≤3 sub-agents the rendered prompt is far below the 120 K token ceiling,
 *     so the orchestrator (T10) will NOT call retrieve() — it inlines the full
 *     candidate list directly.
 *   - At EI-1..EI-10 scale (12+ sub-agents) the orchestrator detects the ceiling
 *     breach via estimateTokens() and calls retrieve() to narrow the set.
 *
 * The gate decision lives in T10 (the orchestrator). T8 owns only:
 *   1. retrieve() — ranking + alwaysInclude append.
 *   2. estimateTokens() — deterministic character-based approximation helper.
 *
 * Ranking algorithm (R-02.26):
 *   Deterministic, string-overlap based. No embeddings, no LLM calls.
 *   Score = count of shared non-stopword lowercased terms between the combined
 *   query bag (utterance + recentSummary) and the candidate's description +
 *   whenToUse bag, divided by sqrt(|candidate bag size|) for length
 *   normalisation. Ties broken by key lexicographic order (ascending) for
 *   determinism.
 *
 * Token estimation (deterministic approximation):
 *   ceil(totalChars / 4) — industry standard rough approximation.
 *   Does NOT call an LLM tokenizer (too heavy, environment-dependent).
 *   Schema chars are computed once per ValidatedSubAgentConfig object and cached
 *   in a WeakMap to avoid re-running z.toJSONSchema() on every call.
 */

import { Injectable } from '@nestjs/common'
import { trace } from '@opentelemetry/api'
import { z } from 'zod'
import type { ValidatedSubAgentConfig, SubAgentKey } from '../../domain/services/sub-agent-types'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const SUB_AGENT_RETRIEVER = Symbol('SUB_AGENT_RETRIEVER')

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimal English stopword list.
 * Kept inline — no library dependency. Extend only when profiling shows false
 * positives that skew retrieval results.
 */
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'for',
  'and',
  'or',
  'is',
  'are',
  'my',
  'your',
])

const ROUTER_TRACER = trace.getTracer('agents.router')

// ─── Schema char cache ─────────────────────────────────────────────────────────

/**
 * WeakMap cache: ValidatedSubAgentConfig object → char count of its serialised
 * input schema JSON. Keyed by object identity so GC can reclaim entries when
 * configs are no longer referenced. Thread-safe in Node's single-threaded model.
 */
const schemaCharCache = new WeakMap<ValidatedSubAgentConfig, number>()

/**
 * Compute (or return cached) character count of the JSON Schema serialisation
 * of a sub-agent's inputSchema.
 *
 * Uses Zod v4's native `z.toJSONSchema()` with `reused: 'inline'` to avoid
 * $ref indirection. The result is cached per-config-object to avoid re-running
 * the schema conversion on every estimateTokens() call.
 */
function getSchemaCharCount(config: ValidatedSubAgentConfig): number {
  const cached = schemaCharCache.get(config)
  if (cached !== undefined) return cached

  let charCount: number
  try {
    const raw = z.toJSONSchema(config.inputSchema, { reused: 'inline' })
    charCount = JSON.stringify(raw).length
  } catch {
    // If schema conversion fails (e.g. unsupported Zod type), fall back to
    // description length as a rough proxy. This is intentionally conservative.
    charCount = config.description.length
  }

  schemaCharCache.set(config, charCount)
  return charCount
}

// ─── Ranker ───────────────────────────────────────────────────────────────────

/**
 * Tokenise a string into a bag-of-words: lowercase, split on non-word chars,
 * drop stopwords and empty tokens.
 *
 * Exported so that Task 02.5 (tool retrieval) can reuse the same pattern.
 */
export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

/**
 * Score a single candidate against the query bag.
 *
 * Score = |shared distinct terms| / sqrt(|candidate bag size|)
 *
 * Using the unique term count (Set intersection) rather than raw token count
 * prevents artificial inflation from repeated terms. Dividing by
 * sqrt(candidate size) provides length normalisation without penalising
 * verbose-but-relevant descriptions as harshly as cosine normalisation would.
 *
 * Returns 0 if the candidate bag is empty (avoids division by zero).
 *
 * Exported for unit testing isolation.
 */
export function scoreCandidate(queryBag: ReadonlyArray<string>, candidateText: string): number {
  const candidateTokens = tokenise(candidateText)
  if (candidateTokens.length === 0) return 0

  const candidateSet = new Set(candidateTokens)
  const querySet = new Set(queryBag)

  let shared = 0
  for (const term of querySet) {
    if (candidateSet.has(term)) shared++
  }

  return shared / Math.sqrt(candidateSet.size)
}

// ─── estimateTokens ───────────────────────────────────────────────────────────

export interface EstimateTokensOpts {
  readonly subAgents: ReadonlyArray<ValidatedSubAgentConfig>
  readonly permissionNarrative: string
  readonly recentSummary: WindowedSummaries
}

/**
 * Estimate the token count of the rendered router prompt without calling an
 * LLM tokenizer.
 *
 * Strategy: ceil(totalChars / 4)
 *   This is the industry-standard rough approximation (1 token ≈ 4 chars for
 *   English prose). It is intentionally approximate — the purpose is to decide
 *   whether retrieval is needed, not to count tokens precisely.
 *
 * totalChars = Σ (description + whenToUse + inputSchema JSON)
 *            + permissionNarrative.length
 *            + (alpha?.length ?? 0)
 *            + Σ gamma[i].summary.length
 *
 * Schema char counts are cached per config object in a WeakMap to avoid
 * re-running z.toJSONSchema() on every call (see getSchemaCharCount).
 */
export function estimateTokens(opts: EstimateTokensOpts): number {
  const { subAgents, permissionNarrative, recentSummary } = opts

  let totalChars = 0

  for (const sa of subAgents) {
    totalChars += sa.description.length
    totalChars += sa.whenToUse.length
    totalChars += getSchemaCharCount(sa)
  }

  totalChars += permissionNarrative.length
  totalChars += recentSummary.alpha?.length ?? 0

  for (const g of recentSummary.gamma) {
    totalChars += g.summary.length
  }

  return Math.ceil(totalChars / 4)
}

// ─── retrieve opts ────────────────────────────────────────────────────────────

export interface RetrieveOpts {
  readonly tenantId: string
  readonly utterance: string
  readonly recentSummary: WindowedSummaries
  readonly candidates: ReadonlyArray<ValidatedSubAgentConfig>
  readonly topK: number
  readonly alwaysInclude: ReadonlySet<SubAgentKey>
}

// ─── SubAgentRetriever ────────────────────────────────────────────────────────

@Injectable()
export class SubAgentRetriever {
  /**
   * Retrieve the top-K most relevant sub-agents from `candidates` for the
   * given utterance and recent memory window.
   *
   * Algorithm:
   *   1. Build a combined query bag from (utterance + γ summaries + α).
   *   2. Score each candidate by string-overlap against (description + whenToUse).
   *   3. Sort by score descending; tiebreak by key ascending for determinism.
   *   4. Take top-K.
   *   5. Append alwaysInclude entries not already present (preserving pinned slots).
   *
   * If topK >= candidates.length, all candidates are returned (no narrowing).
   * If candidates is empty, returns an empty array.
   *
   * The method is async to allow future embedding-based rankers to swap in
   * without a signature break.
   *
   * Emits a `router.sub_agent_retrieval` child span with retrieval metrics.
   */
  async retrieve(opts: RetrieveOpts): Promise<ReadonlyArray<ValidatedSubAgentConfig>> {
    const { utterance, recentSummary, candidates, topK, alwaysInclude } = opts

    const span = ROUTER_TRACER.startSpan('router.sub_agent_retrieval')

    try {
      span.setAttribute('agent.router.retrieval_candidates_in', candidates.length)
      span.setAttribute('agent.router.retrieval_top_k', topK)

      // Fast path: no narrowing needed.
      if (candidates.length === 0 || topK >= candidates.length) {
        const result = appendAlwaysInclude(candidates, alwaysInclude, candidates)
        span.setAttribute('agent.router.retrieval_candidates_out', result.length)
        span.setAttribute(
          'agent.router.retrieval_always_included_count',
          countAlwaysIncluded(result, alwaysInclude, candidates),
        )
        return result
      }

      // Build query bag: utterance + gamma summaries + alpha.
      const queryText = buildQueryText(utterance, recentSummary)
      const queryBag = tokenise(queryText)

      // Score and sort.
      const scored = candidates.map((sa) => ({
        sa,
        score: scoreCandidate(queryBag, `${sa.description} ${sa.whenToUse}`),
      }))

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        // Tiebreak: lex ascending by key for determinism.
        const ak = a.sa.key as string
        const bk = b.sa.key as string
        return ak < bk ? -1 : ak > bk ? 1 : 0
      })

      const topKCandidates = scored.slice(0, topK).map((s) => s.sa)

      // Append alwaysInclude entries not already in top-K.
      const result = appendAlwaysInclude(topKCandidates, alwaysInclude, candidates)

      const alwaysIncludedCount = countAlwaysIncluded(result, alwaysInclude, topKCandidates)

      span.setAttribute('agent.router.retrieval_candidates_out', result.length)
      span.setAttribute('agent.router.retrieval_always_included_count', alwaysIncludedCount)

      return result
    } finally {
      span.end()
    }
  }

  /**
   * Delegate to the module-level estimateTokens function.
   * Provided as an instance method so callers injecting SubAgentRetriever can
   * call both retrieve() and estimateTokens() through the same injectable.
   */
  estimateTokens(opts: EstimateTokensOpts): number {
    return estimateTokens(opts)
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build the combined query text from utterance + γ summaries + α.
 */
function buildQueryText(utterance: string, recentSummary: WindowedSummaries): string {
  const parts: string[] = [utterance]

  for (const g of recentSummary.gamma) {
    parts.push(g.summary)
  }

  if (recentSummary.alpha !== null) {
    parts.push(recentSummary.alpha)
  }

  return parts.join(' ')
}

/**
 * Append any alwaysInclude entries from the full candidate pool that are not
 * already present in `ranked`.
 *
 * - `ranked`: the top-K result (or full list on fast path).
 * - `alwaysInclude`: the set of keys that must appear in the output.
 * - `allCandidates`: the full pool to look up alwaysInclude entries from.
 *
 * Returns a new array; does not mutate its inputs.
 */
function appendAlwaysInclude(
  ranked: ReadonlyArray<ValidatedSubAgentConfig>,
  alwaysInclude: ReadonlySet<SubAgentKey>,
  allCandidates: ReadonlyArray<ValidatedSubAgentConfig>,
): ReadonlyArray<ValidatedSubAgentConfig> {
  if (alwaysInclude.size === 0) return ranked

  const presentKeys = new Set(ranked.map((sa) => sa.key))
  const extras: ValidatedSubAgentConfig[] = []

  for (const key of alwaysInclude) {
    if (!presentKeys.has(key)) {
      const match = allCandidates.find((sa) => sa.key === key)
      if (match !== undefined) {
        extras.push(match)
      }
    }
  }

  if (extras.length === 0) return ranked
  return [...ranked, ...extras]
}

/**
 * Count how many entries in `result` are exclusively from alwaysInclude
 * (i.e., were NOT already in the pre-alwaysInclude set `preAlwaysInclude`).
 *
 * Used for the `retrieval_always_included_count` span attribute.
 */
function countAlwaysIncluded(
  result: ReadonlyArray<ValidatedSubAgentConfig>,
  alwaysInclude: ReadonlySet<SubAgentKey>,
  preAlwaysInclude: ReadonlyArray<ValidatedSubAgentConfig>,
): number {
  const preKeys = new Set(preAlwaysInclude.map((sa) => sa.key))
  let count = 0
  for (const sa of result) {
    if (alwaysInclude.has(sa.key) && !preKeys.has(sa.key)) {
      count++
    }
  }
  return count
}
