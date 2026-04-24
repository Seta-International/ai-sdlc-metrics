/**
 * golden-trace-runner.ts — Plan 10 Task 6
 *
 * Runs the CI gate against the active golden-trace set (R-10.11 – R-10.15).
 *
 * MVP stub: the "actual" fingerprint is derived from the trace's own expected
 * values because full pipeline execution is not yet wired (added in Task 9).
 * This means runCiGate() always returns passed: true with empty regressions
 * at MVP — but the structural plumbing (cap enforcement, scorer invocation,
 * fingerprint comparison) is fully implemented so integration tests can verify
 * the plumbing.
 *
 * Design §§: §4 GoldenTraceRunner, R-10.11 through R-10.15.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { Fingerprint } from '../../domain/scorer-types'
import type { GoldenTraceEntity } from '../../domain/repositories/golden-trace.repository'
import {
  GOLDEN_TRACE_REPOSITORY,
  type GoldenTraceRepository,
} from '../../domain/repositories/golden-trace.repository'
import { ScorerRegistry } from './scorer-registry'
import type { ReplayHarness } from './replay-harness'
import { REPLAY_HARNESS } from './replay-harness'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const GOLDEN_TRACE_RUNNER = Symbol('GOLDEN_TRACE_RUNNER')

// ─── Report types ─────────────────────────────────────────────────────────────

export type RegressionReport = {
  goldenTraceId: string
  expectedFingerprint: Fingerprint
  actualFingerprint: Fingerprint
  divergedFields: string[]
}

export type CiGateResult = {
  passed: boolean
  regressions: RegressionReport[]
  durationMs: number
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a Fingerprint from a GoldenTraceEntity's expected values.
 *
 * Tool calls are sorted so comparisons are order-insensitive (property spec).
 */
export function buildExpectedFingerprint(trace: GoldenTraceEntity): Fingerprint {
  return {
    toolCallsSorted: [...trace.expectedToolCalls].sort(),
    shape: trace.expectedShape,
    permissionKeys: [...trace.expectedPermissionKeys].sort(),
    taintFlipped: trace.taintExpectation,
  }
}

/**
 * Diffs expectedFingerprint vs actualFingerprint and returns the list of
 * field names that diverged.
 *
 * Fields checked:
 *   - toolCallsSorted  (serialized for stable comparison)
 *   - shape
 *   - permissionKeys   (serialized for stable comparison)
 *   - taintFlipped
 */
export function computeRegressionReport(
  trace: GoldenTraceEntity,
  actualFingerprint: Fingerprint,
): RegressionReport {
  const expected = buildExpectedFingerprint(trace)
  const divergedFields: string[] = []

  if (
    JSON.stringify(expected.toolCallsSorted) !== JSON.stringify(actualFingerprint.toolCallsSorted)
  ) {
    divergedFields.push('toolCallsSorted')
  }
  if (expected.shape !== actualFingerprint.shape) {
    divergedFields.push('shape')
  }
  if (
    JSON.stringify(expected.permissionKeys) !== JSON.stringify(actualFingerprint.permissionKeys)
  ) {
    divergedFields.push('permissionKeys')
  }
  if (expected.taintFlipped !== actualFingerprint.taintFlipped) {
    divergedFields.push('taintFlipped')
  }

  return {
    goldenTraceId: trace.id,
    expectedFingerprint: expected,
    actualFingerprint,
    divergedFields,
  }
}

// ─── GoldenTraceRunner ────────────────────────────────────────────────────────

@Injectable()
export class GoldenTraceRunner {
  constructor(
    @Inject(GOLDEN_TRACE_REPOSITORY) private readonly repo: GoldenTraceRepository,
    private readonly scorerRegistry: ScorerRegistry,
    @Inject(REPLAY_HARNESS) private readonly replayHarness: ReplayHarness,
  ) {}

  /**
   * Runs the CI gate against all active golden traces.
   *
   * For each trace:
   *   1. Build the expected Fingerprint.
   *   2. Run all registered deterministic scorers against a ScorerContext
   *      derived from the trace's expected values.
   *   3. Run all registered LLM-judge scorers in observe-only mode
   *      (results never gate CI at MVP per R-10.30).
   *   4. Any deterministic scorer returning passed: false → record regression.
   *
   * MVP stub: "actual" fingerprint equals "expected" fingerprint (no real
   * execution). Returns passed: true with empty regressions until Task 9
   * wires real pipeline execution.
   */
  async runCiGate(opts: { branch: string; commit: string }): Promise<CiGateResult> {
    const startMs = Date.now()
    const traces = await this.repo.findActive()
    const regressions: RegressionReport[] = []

    const deterministicScorers = this.scorerRegistry.getDeterministic()
    const llmJudgeScorers = this.scorerRegistry.getLlmJudge()

    for (const trace of traces) {
      const expectedFingerprint = buildExpectedFingerprint(trace)

      // MVP: actual fingerprint = expected (no real execution yet).
      // Task 9 replaces this with real pipeline output.
      const actualFingerprint: Fingerprint = { ...expectedFingerprint }

      // Run deterministic scorers — gate on their results.
      for (const scorer of deterministicScorers) {
        const ctx = {
          traceId: trace.id,
          input: {
            expectedFingerprint,
            trace,
            branch: opts.branch,
            commit: opts.commit,
          },
          output: { actualFingerprint },
        }
        let result: { passed: boolean }
        try {
          result = await scorer.run(ctx)
        } catch {
          // Scorer threw — treat as failed (surface error in regression report).
          result = { passed: false }
        }
        if (!result.passed) {
          const report = computeRegressionReport(trace, actualFingerprint)
          regressions.push(report)
          // One regression per trace is sufficient; don't duplicate.
          break
        }
      }

      // Run LLM-judge scorers in observe-only mode — never gate.
      for (const scorer of llmJudgeScorers) {
        const ctx = {
          traceId: trace.id,
          input: {
            expectedFingerprint,
            trace,
            branch: opts.branch,
            commit: opts.commit,
          },
          output: { actualFingerprint },
        }
        try {
          // Result is intentionally discarded — observe-only at MVP (R-10.30).
          await scorer.run(ctx)
        } catch {
          // Observe-only failures are silently swallowed; never affect gate.
        }
      }
    }

    const durationMs = Date.now() - startMs

    return {
      passed: regressions.length === 0,
      regressions,
      durationMs,
    }
  }
}
