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
} from '../../infrastructure/observability/synthesizer-metrics'
import { SynthesizerStreamFailureError } from './synthesizer-errors'

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
    const allOutputs = opts.outputs
    const expectedShape = extractExpectedShape(
      opts.directive as { expectedOutputShape?: SynthesizerLlmOutput['shape'] | null },
    )
    const surface = opts.turnState.surface

    const hasContradiction = detectContradiction(asMutableMap(allOutputs))
    const citations = buildCitations(asMutableMap(allOutputs))
    const disclosures = buildDisclosureStatements(asMutableMap(allOutputs))

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
            }
          } else if (declaredShape === 'list') {
            const items = (partial as { items?: ReadonlyArray<string> }).items ?? []
            for (let i = lastEmittedItemCount; i < items.length; i++) {
              opts.streamEmitter.emit({
                type: 'answer.token',
                payload: { token: `- ${items[i]}\n` },
              })
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
        recordSynthesizerFallback({ cause: 'pre_shape_failure' })
        throw new SynthesizerStreamFailureError('pre_shape_failure', {
          cause: err instanceof Error ? err.message : String(err),
        })
      }
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
        recordSynthesizerFallback({ cause: 'pre_shape_failure' })
        throw new SynthesizerStreamFailureError('pre_shape_failure', {
          cause: err instanceof Error ? err.message : String(err),
        })
      }
      // Schema validation failed AFTER partials emitted: distinguish from raw
      // stream errors so observability can attribute to "model produced
      // schema-invalid object" vs "transport blew up".
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
    }
    opts.streamEmitter.emit({ type: 'answer.complete', payload: {} })

    recordSynthesizerCall({ shape: finalObject.shape, surface, outcome: 'completed' })

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

    const clarityProse = renderContradictionClarity(asMutableMap(args.outputs))
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

/**
 * `synthesizer.ts` helpers were written before the `ReadonlyMap` migration and
 * accept `Map<...>`. They never mutate, so a structural cast is safe; this
 * shim documents that intent rather than burying the cast inline.
 */
function asMutableMap(
  m: ReadonlyMap<SubAgentKey, SubAgentOutput>,
): Map<SubAgentKey, SubAgentOutput> {
  return m as Map<SubAgentKey, SubAgentOutput>
}

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
