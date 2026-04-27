/**
 * golden-trace-runner.ts — Plan 10 Task 6 + Plan 17 PR 4 Task 14.
 *
 * Runs the CI gate against the active golden-trace set (R-10.11 – R-10.15).
 *
 * Drives the full pipeline through ReplayHarness + TurnPipelineRunner +
 * ReplayModeToolGateway: for each active trace, replays its captured prompts
 * and tool outputs, executes the real pipeline against a replay-mode gateway,
 * and compares the produced Fingerprint against the trace's expected values.
 * Replay failures yield MARKER_REPLAY_FAILED so a missed lookup surfaces as
 * a regression rather than a silent pass.
 *
 * Design §§: §4 GoldenTraceRunner, R-10.11 through R-10.15.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { AnswerShape, Fingerprint } from '../../domain/scorer-types'
import { MARKER_REPLAY_FAILED } from '../../domain/scorer-types'
import type { GoldenTraceEntity } from '../../domain/repositories/golden-trace.repository'
import {
  GOLDEN_TRACE_REPOSITORY,
  type GoldenTraceRepository,
} from '../../domain/repositories/golden-trace.repository'
import { ScorerRegistry } from './scorer-registry'
import type { ReplayHarness } from './replay-harness'
import { REPLAY_HARNESS } from './replay-harness'
import { TURN_PIPELINE_RUNNER, type TurnPipelineRunner } from './turn-pipeline-runner'
import { ReplayModeToolGateway } from '../../infrastructure/tool-gateway/replay-mode-tool-gateway'
import { canonicalize } from '../../infrastructure/cache/canonical-args'

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
    @Inject(TURN_PIPELINE_RUNNER) private readonly turnPipelineRunner: TurnPipelineRunner,
  ) {}

  /**
   * Runs the CI gate against all active golden traces.
   *
   * For each trace:
   *   1. Replay the trace via ReplayHarness (mode=full) to recover the captured
   *      LLM messages, pinned versions, and tool outputs.
   *   2. Drive the pipeline through TurnPipelineRunner.runWithReplay() with a
   *      ReplayModeToolGateway backed by the captured tool outputs.
   *   3. Build the actual Fingerprint from the pipeline result.
   *   4. Run all registered deterministic scorers; passed:false → regression.
   *   5. Run all registered LLM-judge scorers in observe-only mode (R-10.30).
   *   6. Replay failures yield MARKER_REPLAY_FAILED + a regression report so
   *      missed lookups surface in the gate output.
   */
  async runCiGate(opts: { branch: string; commit: string }): Promise<CiGateResult> {
    const startMs = Date.now()
    const traces = await this.repo.findActive()
    const regressions: RegressionReport[] = []

    const deterministicScorers = this.scorerRegistry.getDeterministic()
    const llmJudgeScorers = this.scorerRegistry.getLlmJudge()

    for (const trace of traces) {
      const expectedFingerprint = buildExpectedFingerprint(trace)

      let actualFingerprint: Fingerprint
      let replayFailed = false
      try {
        const replay = await this.replayHarness.replay({ traceId: trace.id, mode: 'full' })
        if (!replay.toolOutputs) {
          throw new Error('replay returned no toolOutputs (mode=full required)')
        }
        const gateway = new ReplayModeToolGateway(
          replay.toolOutputs,
          (args) => canonicalize(args).hash,
        )
        // ReplayResult.messages is LlmMessageArray[] (role may include 'tool', content may be null);
        // TurnPipelineRunner.runWithReplay only consumes user/assistant/system text, so flatten +
        // narrow to the pipeline shape and drop tool / null-content rows.
        const replayMessages = replay.messages
          .flat()
          .filter(
            (m): m is { role: 'user' | 'assistant' | 'system'; content: string } =>
              m.role !== 'tool' && typeof m.content === 'string',
          )
          .map((m) => ({ role: m.role, content: m.content }))
        const result = await this.turnPipelineRunner.runWithReplay({
          messages: replayMessages,
          pinnedVersions: replay.pinnedVersions,
          toolGatewayOverride: gateway,
        })
        if (result.shape === 'aborted') {
          throw new Error(
            'replay pipeline returned aborted shape — should not happen in replay mode',
          )
        }
        actualFingerprint = {
          toolCallsSorted: [...result.toolCallNames].sort(),
          shape: result.shape as AnswerShape,
          permissionKeys: [...result.permissionKeys].sort(),
          taintFlipped: result.taintFlipped,
        }
      } catch {
        replayFailed = true
        actualFingerprint = MARKER_REPLAY_FAILED
      }

      let traceFailed = false
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
          result = { passed: false }
        }
        if (!result.passed) {
          regressions.push(computeRegressionReport(trace, actualFingerprint))
          traceFailed = true
          break
        }
      }

      // Replay failure itself is a regression even if no deterministic scorer flagged it.
      if (!traceFailed && replayFailed) {
        regressions.push(computeRegressionReport(trace, actualFingerprint))
      }

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
          await scorer.run(ctx)
        } catch {
          /* observe-only — never gate */
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
