/**
 * RetrievalQualityScorer — CI scorer for tool retrieval recall (Plan 02.5 §4, R-02.5.8).
 *
 * Given a sub-agent key and a set of labeled golden traces, invokes ToolRetriever
 * for each trace and computes per-trace and aggregate recall:
 *
 *   recall_per_trace = |expected ∩ selected| / |expected|
 *   aggregate_recall = mean(per_trace_recalls)
 *
 * Edge cases:
 *   - Empty expectedToolNames → trace recall = 1.0 (vacuously true; the set is empty).
 *   - Empty goldenTraces → aggregate recall = 1.0, perTraceRecall = {}.
 *   - fallbackFired traces are scored normally — the scorer measures recall over the
 *     full toolScope path; fallback behaviour is tracked separately via the metric.
 *
 * DB queries inside retrieve() are sequential per CLAUDE.md rule — do NOT call
 * retrieve() via Promise.all. The scorer already loops sequentially.
 *
 * Consumed by:
 *   - Plan 10 CI harness: score() against the EI-5 golden-trace fixture; hard-fails
 *     when aggregate recall < target.
 *   - Future scheduled scorer: rolling golden-trace window over production traces.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import { TOOL_RETRIEVER, type ToolRetriever } from '../../infrastructure/retrieval/tool-retriever'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const RETRIEVAL_QUALITY_SCORER = Symbol('RETRIEVAL_QUALITY_SCORER')

// ─── GoldenTrace ──────────────────────────────────────────────────────────────

/**
 * A labeled test case for retrieval quality measurement.
 *
 * `expectedToolNames` is the ground-truth set — the subset of tools from
 * `toolScope` that a correctly-functioning retriever should return for this
 * directive. Recall is measured against this set (not equality against `selected`).
 */
export interface GoldenTrace {
  /** Stable identifier for this trace (e.g. `"ei5.planner.list-tasks-1"`). */
  readonly traceId: string
  /** Directive passed to ToolRetriever.retrieve. */
  readonly directive: {
    readonly goal: string
    readonly constraints: readonly string[]
  }
  /** Full tool scope presented to the retriever (role+module filtered). */
  readonly toolScope: ReadonlyArray<AgentToolDescriptor>
  /** Core tools always included regardless of ranking. */
  readonly coreTools: ReadonlyArray<string>
  /** Top-K to request from the retriever. */
  readonly topK: number
  /** Ground-truth tools that MUST appear in selected for full recall. */
  readonly expectedToolNames: ReadonlyArray<string>
}

// ─── ScoreResult ──────────────────────────────────────────────────────────────

export interface ScoreResult {
  /** Arithmetic mean of per-trace recalls across all golden traces. */
  readonly recall: number
  /** Per-trace recall keyed by traceId. */
  readonly perTraceRecall: Record<string, number>
}

// ─── Retriever interface (structural) ─────────────────────────────────────────

type RetrieverSurface = Pick<ToolRetriever, 'retrieve'>

// ─── RetrievalQualityScorer ───────────────────────────────────────────────────

@Injectable()
export class RetrievalQualityScorer {
  constructor(
    @Inject(TOOL_RETRIEVER)
    private readonly retriever: RetrieverSurface,
  ) {}

  /**
   * Score retrieval recall against a labeled golden-trace set.
   *
   * Calls ToolRetriever.retrieve sequentially (no Promise.all — retrieve uses
   * the request-scoped DB client; see CLAUDE.md rule on sequential DB queries).
   *
   * @param subAgentKey  - Branded key forwarded to ToolRetriever for tracing.
   * @param goldenTraces - Labeled test cases. Empty → returns 1.0 with no calls.
   */
  async score(
    subAgentKey: SubAgentKey,
    goldenTraces: ReadonlyArray<GoldenTrace>,
  ): Promise<ScoreResult> {
    if (goldenTraces.length === 0) {
      return { recall: 1.0, perTraceRecall: {} }
    }

    const perTraceRecall: Record<string, number> = {}

    for (const trace of goldenTraces) {
      const result = await this.retriever.retrieve({
        subAgentKey,
        directive: trace.directive,
        toolScope: trace.toolScope,
        coreTools: trace.coreTools,
        topK: trace.topK,
      })

      const selectedNames = new Set(result.selected.map((t) => t.name))

      let traceRecall: number
      if (trace.expectedToolNames.length === 0) {
        traceRecall = 1.0
      } else {
        const hits = trace.expectedToolNames.filter((name) => selectedNames.has(name)).length
        traceRecall = hits / trace.expectedToolNames.length
      }

      perTraceRecall[trace.traceId] = traceRecall
    }

    const recalls = Object.values(perTraceRecall)
    const recall = recalls.reduce((sum, r) => sum + r, 0) / recalls.length

    return { recall, perTraceRecall }
  }
}
