/**
 * SynthesizerAdapter — Plan 17 PR 3 Task 11 (Plan 18 §1 amendments).
 *
 * Streams a discriminated-union answer object via `SynthesizerLlmClient` and
 * bridges per-shape into `StreamEmitter` events:
 *
 *   - short-answer / narrative / list  → incremental `answer.token` deltas
 *   - table / chart                    → hold partials, emit one atomic JSON
 *                                        token after `finalObject` resolves
 *
 * Pre-shape failures (stream errors before any `shape` discriminator) are
 * rethrown as `SynthesizerStreamFailureError`. Post-shape failures (stream
 * errors after a shape was declared, or `finalObject` schema-validation) fall
 * back to deterministic prose with `turnEndedReason: 'errored'`.
 *
 * Confidence is rule-derived (R-03.22): MIN across contributing sub-agents,
 * one-step demotion to 'low' on contradiction. The LLM never self-assesses.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { ISynthesizer } from './iterative-orchestrator'
import type {
  PhaseExecutorTurnState,
  SubAgentKey,
  SubAgentOutput,
  SubAgentUsage,
  SynthesizerOpts,
  SynthesizerOutput,
} from './phase-executor-contracts'
import type { StreamEmitter } from './stream-gateway'
import {
  buildCitations,
  buildDisclosureStatements,
  detectContradiction,
  renderContradictionClarity,
} from './synthesizer'
import {
  buildSynthesizerPrompt,
  deriveAggregateConfidence,
  extractExpectedShape,
} from './synthesizer-prompt-builder'
import {
  SynthesizerOutputSchema,
  narrowToShape,
  type SynthesizerLlmOutput,
} from '../../domain/value-objects/synthesizer-output-schema'
import {
  SYNTHESIZER_LLM_CLIENT,
  type SynthesizerLlmClient,
} from '../../infrastructure/llm/synthesizer-llm-client'
import {
  recordSynthesizerCall,
  recordSynthesizerFallback,
  recordSynthesizerLatency,
} from '../../infrastructure/observability/synthesizer-metrics'
import { SynthesizerStreamFailureError } from './pipeline-errors'

// ─── Model choices ────────────────────────────────────────────────────────────

const NANO_MODEL = { provider: 'openai' as const, model: 'gpt-5.4-nano' as const }
const REASONING_MODEL = { provider: 'openai' as const, model: 'gpt-5.4' as const }

const SYNTHESIZER_SYSTEM_PROMPT = `You are a synthesizer for a business AaaS agent runtime.
Combine per-sub-agent structured outputs into a single response of the requested shape.
Use definitional clarity for any contradictions; never frame outputs as "disagreement".
Include any disclosures verbatim where they belong in your prose.
Output ONLY the requested shape — no commentary.`

const STREAMING_SHAPES = new Set<SynthesizerLlmOutput['shape']>([
  'short-answer',
  'list',
  'narrative',
])

// ─── Adapter ──────────────────────────────────────────────────────────────────

@Injectable()
export class SynthesizerAdapter implements ISynthesizer {
  constructor(@Inject(SYNTHESIZER_LLM_CLIENT) private readonly llm: SynthesizerLlmClient) {}

  async synthesize(opts: SynthesizerOpts): Promise<SynthesizerOutput> {
    const startMs = Date.now()
    const surface = opts.turnState.surface
    let latencyShape = 'unknown'
    let latencyOutcome: 'completed' | 'errored' = 'completed'

    try {
      return await this._synthesizeInner(opts, surface, (resolved) => {
        if (resolved.shape !== undefined) latencyShape = resolved.shape
        if (resolved.outcome !== undefined) latencyOutcome = resolved.outcome
      })
    } catch (err) {
      latencyOutcome = 'errored'
      throw err
    } finally {
      recordSynthesizerLatency({
        shape: latencyShape,
        surface,
        outcome: latencyOutcome,
        durationMs: Date.now() - startMs,
      })
    }
  }

  private async _synthesizeInner(
    opts: SynthesizerOpts,
    surface: PhaseExecutorTurnState['surface'],
    onResolved: (r: { shape?: string; outcome?: 'completed' | 'errored' }) => void,
  ): Promise<SynthesizerOutput> {
    const allOutputs = opts.outputs
    const expectedShape = extractExpectedShape(
      opts.directive as { expectedOutputShape?: SynthesizerLlmOutput['shape'] | null },
    )

    const hasContradiction = detectContradiction(allOutputs)
    const citations = buildCitations(allOutputs)
    const disclosures = buildDisclosureStatements(allOutputs)

    const userContext = buildSynthesizerPrompt({
      allOutputs,
      disclosures,
      hasContradiction,
      expectedShape,
      userUtterance: opts.userUtterance,
    })

    const schema = expectedShape
      ? narrowToShape(SynthesizerOutputSchema, expectedShape)
      : SynthesizerOutputSchema
    const model = surface === 'inline' ? NANO_MODEL : REASONING_MODEL

    const stream = this.llm.synthesize({
      model,
      system: SYNTHESIZER_SYSTEM_PROMPT,
      userContext,
      schema,
      abortSignal: opts.abortSignal,
    })

    let declaredShape: SynthesizerLlmOutput['shape'] | null = null
    let lastEmittedContentLen = 0
    let lastEmittedItemCount = 0
    let tokensEmitted = false

    // ── Phase A: drain partialObjectStream ────────────────────────────────────
    try {
      for await (const partial of stream.partialObjectStream) {
        if (declaredShape === null && partial.shape) {
          declaredShape = partial.shape
          opts.streamEmitter.emit({
            type: 'answer.shape_declared',
            payload: {
              shape: declaredShape,
              format: STREAMING_SHAPES.has(declaredShape) ? 'markdown' : 'json',
            },
          })
        }
        if (declaredShape && STREAMING_SHAPES.has(declaredShape)) {
          if (declaredShape === 'narrative' || declaredShape === 'short-answer') {
            const content = (partial as { content?: string }).content ?? ''
            if (content.length > lastEmittedContentLen) {
              const delta = content.slice(lastEmittedContentLen)
              opts.streamEmitter.emit({
                type: 'answer.token',
                payload: { token: delta },
              })
              lastEmittedContentLen = content.length
              tokensEmitted = true
            }
          } else if (declaredShape === 'list') {
            const items = (partial as { items?: ReadonlyArray<string> }).items ?? []
            for (let i = lastEmittedItemCount; i < items.length; i++) {
              opts.streamEmitter.emit({
                type: 'answer.token',
                payload: { token: `- ${items[i]}\n` },
              })
              tokensEmitted = true
            }
            lastEmittedItemCount = items.length
          }
        }
      }
    } catch (err) {
      // Stream errored mid-flight.
      // - declaredShape === null → no shape ever surfaced → pre-shape failure → rethrow
      // - declaredShape !== null → tokens already emitted → post-shape failure → fallback
      if (declaredShape === null) {
        // Suppress the orphaned `stream.usage` rejection: pre-shape failure
        // means usage is moot, but Node.js would otherwise see it as
        // unhandled and crash the process.
        void stream.usage.catch(() => {
          /* swallowed: pre-shape failure makes usage moot */
        })
        recordSynthesizerFallback({ cause: 'pre_shape_failure' })
        throw new SynthesizerStreamFailureError('pre_shape_failure', err)
      }
      onResolved({ shape: 'narrative', outcome: 'errored' })
      return this._fallback({
        outputs: allOutputs,
        citations,
        disclosures,
        streamEmitter: opts.streamEmitter,
        cause: 'stream_error',
      })
    }

    // ── Phase B: await finalObject + usage ────────────────────────────────────
    let finalObject: SynthesizerLlmOutput
    let usage: SubAgentUsage
    try {
      finalObject = await stream.finalObject
      usage = await stream.usage
    } catch (err) {
      if (declaredShape === null) {
        // Stream completed empty — no partials, no shape, finalObject failed.
        // Same as the partial-stream branch: suppress orphaned usage promise.
        void stream.usage.catch(() => {
          /* swallowed: pre-shape failure makes usage moot */
        })
        recordSynthesizerFallback({ cause: 'pre_shape_failure' })
        throw new SynthesizerStreamFailureError('pre_shape_failure', err)
      }
      // Schema validation failed AFTER partials emitted: distinguish from raw
      // stream errors so observability can attribute to "model produced
      // schema-invalid object" vs "transport blew up".
      onResolved({ shape: 'narrative', outcome: 'errored' })
      return this._fallback({
        outputs: allOutputs,
        citations,
        disclosures,
        streamEmitter: opts.streamEmitter,
        cause: 'schema_validation',
      })
    }

    // ── Atomic shapes: emit one JSON token now that finalObject resolved ──────
    if (!STREAMING_SHAPES.has(finalObject.shape)) {
      opts.streamEmitter.emit({
        type: 'answer.token',
        payload: { token: JSON.stringify(finalObject), format: 'json' },
      })
    } else if (!tokensEmitted) {
      // Degenerate stream: a streaming shape was declared but no partials ever
      // grew `content`/`items`. The state machine requires at least one
      // `answer.token` (transitioning shape-declared → tokens-streaming) before
      // `answer.complete` is valid. Synthesize one from the final object so we
      // don't trip an "Invalid transition" runtime throw at the gateway.
      const synthetic = synthesizeTerminalToken(finalObject)
      opts.streamEmitter.emit({
        type: 'answer.token',
        payload: { token: synthetic },
      })
    }
    opts.streamEmitter.emit({ type: 'answer.complete', payload: {} })

    recordSynthesizerCall({ shape: finalObject.shape, surface, outcome: 'completed' })
    onResolved({ shape: finalObject.shape, outcome: 'completed' })

    const finalConfidence = hasContradiction ? 'low' : deriveAggregateConfidence(allOutputs)

    return {
      shape: finalObject.shape,
      content: extractContent(finalObject),
      citations,
      confidence: finalConfidence,
      turnEndedReason: 'completed',
      usage,
    }
  }

  private _fallback(args: {
    outputs: ReadonlyMap<SubAgentKey, SubAgentOutput>
    citations: ReturnType<typeof buildCitations>
    disclosures: ReadonlyArray<string>
    streamEmitter: StreamEmitter
    cause: 'stream_error' | 'schema_validation'
  }): SynthesizerOutput {
    recordSynthesizerFallback({ cause: args.cause })

    const clarityProse = renderContradictionClarity(args.outputs)
    const tail = args.disclosures.length > 0 ? ' ' + args.disclosures.join(' ') : ''
    const content = (clarityProse + tail).trim() || 'No data retrieved.'

    args.streamEmitter.emit({ type: 'answer.token', payload: { token: content } })
    args.streamEmitter.emit({ type: 'answer.complete', payload: {} })

    return {
      shape: 'narrative',
      content,
      citations: args.citations,
      confidence: 'low',
      turnEndedReason: 'errored',
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractContent(out: SynthesizerLlmOutput): unknown {
  switch (out.shape) {
    case 'short-answer':
      return out.content
    case 'narrative':
      return out.content
    case 'list':
      return out.items
    case 'table':
      return { columns: out.columns, rows: out.rows }
    case 'chart':
      return { series: out.series, axes: out.axes }
  }
}

/**
 * Build a single token for a streaming-shape final whose partials never grew
 * incremental deltas. Used only on the degenerate `shape-declared → answer.complete`
 * path, where the state machine requires at least one `answer.token` first.
 */
function synthesizeTerminalToken(out: SynthesizerLlmOutput): string {
  switch (out.shape) {
    case 'narrative':
    case 'short-answer':
      return out.content && out.content.length > 0 ? out.content : '(no content)'
    case 'list':
      return out.items.length > 0 ? out.items.map((i) => `- ${i}\n`).join('') : '(no items)'
    // Atomic shapes are handled in the caller; synthesizeTerminalToken is only
    // invoked for streaming shapes.
    case 'table':
    case 'chart':
      return JSON.stringify(out)
  }
}
