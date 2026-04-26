/**
 * synthesizer-adapter.spec.ts — Plan 17 PR 3 Task 11 (Plan 18 §1).
 *
 * Tests the streaming SynthesizerAdapter:
 *   1. Happy narrative — streams incremental tokens, returns 'completed' + usage
 *   2. Streaming list — emits one token per item as items grow
 *   3. Atomic table — no tokens until finalObject; one JSON token + complete
 *   4. Pre-shape failure — partialStream throws before shape; rethrows
 *   5. Post-shape failure — partialStream throws after shape; falls back to errored
 *   6. finalObject rejection (schema) — partials emitted then finalObject throws → fallback
 *   7. Inline-copilot pinning — directive.expectedOutputShape='table', surface='inline':
 *      LLM called with narrowed schema + nano model
 *   8. Confidence aggregation — mixed high+low confidences → final 'low'
 *   9. Contradiction caps confidence — different semantics → forced 'low'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../infrastructure/observability/synthesizer-metrics', () => ({
  recordSynthesizerCall: vi.fn(),
  recordSynthesizerFallback: vi.fn(),
  recordSynthesizerLatency: vi.fn(),
}))

import { SynthesizerAdapter } from './synthesizer-adapter'
import { SynthesizerStreamFailureError } from './pipeline-errors'
import type {
  PhaseExecutorTurnState,
  SubAgentOutput,
  SubAgentUsage,
  SynthesizerOpts,
} from './phase-executor-contracts'
import type { StreamEmitter } from './stream-gateway'
import type {
  SynthesizerLlmClient,
  SynthesizerLlmClientOpts,
  SynthesizerStreamResult,
} from '../../infrastructure/llm/synthesizer-llm-client'
import type { SynthesizerLlmOutput } from '../../domain/value-objects/synthesizer-output-schema'
import { SynthesizerOutputSchema } from '../../domain/value-objects/synthesizer-output-schema'
import {
  recordSynthesizerCall,
  recordSynthesizerFallback,
  recordSynthesizerLatency,
} from '../../infrastructure/observability/synthesizer-metrics'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ZERO_USAGE: SubAgentUsage = {
  inputTokens: 0,
  outputTokens: 0,
  inputCachedRead: 0,
  inputCachedWrite: 0,
  outputReasoning: 0,
  costUsd: 0,
}

const SAMPLE_USAGE: SubAgentUsage = {
  inputTokens: 250,
  outputTokens: 80,
  inputCachedRead: 0,
  inputCachedWrite: 0,
  outputReasoning: 0,
  costUsd: 0.0042,
}

function makeTurnState(
  surface: PhaseExecutorTurnState['surface'] = 'global-chat',
): PhaseExecutorTurnState {
  return {
    traceId: 'trace-synth-spec',
    tenantId: 'tenant-001',
    userId: 'user-001',
    conversationId: 'conv-001',
    sessionId: 'sess-001',
    surface,
    tainted: { value: false },
    routerReplanCount: 0,
  }
}

function makeCompletedOutput(
  semantics: string,
  summary: string,
  confidence: SubAgentOutput['confidence'] = 'high',
): SubAgentOutput {
  return {
    kind: 'completed',
    summary,
    semantics,
    confidence,
    sourceToolProvenance: [],
    structured: {},
    drafts: [],
    circuitBreakerState: {},
    usageTotals: ZERO_USAGE,
  }
}

function makeStreamEmitter(): StreamEmitter {
  return {
    emit: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
  }
}

interface FakeStream {
  partials: Array<Partial<SynthesizerLlmOutput>>
  finalObject: SynthesizerLlmOutput | Promise<SynthesizerLlmOutput>
  usage?: SubAgentUsage | Promise<SubAgentUsage>
  partialError?: Error
  errorAfterIndex?: number
}

function makeLlmClient(fake: FakeStream): {
  client: SynthesizerLlmClient
  synthesize: ReturnType<typeof vi.fn>
} {
  const synthesize = vi.fn((_opts: SynthesizerLlmClientOpts): SynthesizerStreamResult => {
    const { partials, finalObject, usage, partialError, errorAfterIndex } = fake
    const partialObjectStream = (async function* () {
      for (let i = 0; i < partials.length; i++) {
        if (errorAfterIndex !== undefined && i === errorAfterIndex && partialError) {
          throw partialError
        }
        yield partials[i]!
      }
      if (partialError && (errorAfterIndex === undefined || errorAfterIndex >= partials.length)) {
        throw partialError
      }
    })()

    return {
      partialObjectStream,
      finalObject: Promise.resolve(finalObject),
      usage: Promise.resolve(usage ?? SAMPLE_USAGE),
    }
  })

  return { client: { synthesize }, synthesize }
}

interface MakeOptsArgs {
  outputs?: Map<string, SubAgentOutput>
  surface?: PhaseExecutorTurnState['surface']
  expectedOutputShape?: SynthesizerLlmOutput['shape']
  streamEmitter?: StreamEmitter
}

function makeOpts(args: MakeOptsArgs = {}): SynthesizerOpts {
  const outputs =
    args.outputs ??
    new Map([['iter-1-goals.analyst', makeCompletedOutput('kpi-regression', 'Revenue down 12%')]])

  const directive: SynthesizerOpts['directive'] & {
    expectedOutputShape?: SynthesizerLlmOutput['shape']
  } = {
    topology: 'bounded',
    intent_slug: 'goals.kpi',
    flow_id: '00000000-0000-0000-0000-000000000001',
    phase1: [],
    phase2: [],
  }
  if (args.expectedOutputShape) {
    directive.expectedOutputShape = args.expectedOutputShape
  }

  return {
    directive,
    outputs,
    userUtterance: 'Why did my KPI drop?',
    abortSignal: new AbortController().signal,
    turnState: makeTurnState(args.surface),
    streamEmitter: args.streamEmitter ?? makeStreamEmitter(),
  }
}

beforeEach(() => {
  vi.mocked(recordSynthesizerCall).mockClear()
  vi.mocked(recordSynthesizerFallback).mockClear()
  vi.mocked(recordSynthesizerLatency).mockClear()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SynthesizerAdapter', () => {
  it('1. happy narrative — streams incremental tokens, returns completed + usage', async () => {
    const { client } = makeLlmClient({
      partials: [
        { shape: 'narrative' },
        { shape: 'narrative', content: 'h' },
        { shape: 'narrative', content: 'hello' },
      ],
      finalObject: { shape: 'narrative', content: 'hello' },
      usage: SAMPLE_USAGE,
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ streamEmitter: emitter }))

    expect(out).toMatchObject({
      shape: 'narrative',
      content: 'hello',
      turnEndedReason: 'completed',
    })
    expect(out.usage?.inputTokens).toBeGreaterThan(0)

    const calls = vi.mocked(emitter.emit).mock.calls.map((c) => c[0])
    expect(calls[0]).toMatchObject({
      type: 'answer.shape_declared',
      payload: { shape: 'narrative', format: 'markdown' },
    })
    expect(calls[1]).toMatchObject({ type: 'answer.token', payload: { token: 'h' } })
    expect(calls[2]).toMatchObject({ type: 'answer.token', payload: { token: 'ello' } })
    expect(calls[calls.length - 1]).toMatchObject({ type: 'answer.complete' })

    expect(recordSynthesizerCall).toHaveBeenCalledWith({
      shape: 'narrative',
      surface: 'global-chat',
      outcome: 'completed',
    })
    expect(recordSynthesizerFallback).not.toHaveBeenCalled()
  })

  it('2. streaming list — emits one token per item as items grow', async () => {
    const { client } = makeLlmClient({
      partials: [
        { shape: 'list' },
        { shape: 'list', items: ['alpha'] },
        { shape: 'list', items: ['alpha', 'beta'] },
        { shape: 'list', items: ['alpha', 'beta', 'gamma'] },
      ],
      finalObject: { shape: 'list', items: ['alpha', 'beta', 'gamma'] },
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ streamEmitter: emitter }))

    expect(out.shape).toBe('list')
    expect(out.content).toEqual(['alpha', 'beta', 'gamma'])

    const tokenCalls = vi
      .mocked(emitter.emit)
      .mock.calls.map((c) => c[0])
      .filter((e) => e.type === 'answer.token')
    expect(tokenCalls).toEqual([
      { type: 'answer.token', payload: { token: '- alpha\n' } },
      { type: 'answer.token', payload: { token: '- beta\n' } },
      { type: 'answer.token', payload: { token: '- gamma\n' } },
    ])
  })

  it('3. atomic table — no tokens until finalObject; one JSON token + complete', async () => {
    const finalTable: SynthesizerLlmOutput = {
      shape: 'table',
      columns: ['Project', 'Hours'],
      rows: [
        ['A', '12'],
        ['B', '8'],
      ],
    }
    const { client } = makeLlmClient({
      partials: [
        { shape: 'table' },
        { shape: 'table', columns: ['Project'] },
        { shape: 'table', columns: ['Project', 'Hours'], rows: [['A', '12']] },
      ],
      finalObject: finalTable,
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ streamEmitter: emitter }))

    const events = vi.mocked(emitter.emit).mock.calls.map((c) => c[0])
    // No answer.token events should have been emitted while partials were streaming.
    const tokenEvents = events.filter((e) => e.type === 'answer.token')
    expect(tokenEvents).toHaveLength(1)
    expect(tokenEvents[0]).toMatchObject({
      type: 'answer.token',
      payload: { token: JSON.stringify(finalTable), format: 'json' },
    })
    const completeIdx = events.findIndex((e) => e.type === 'answer.complete')
    expect(completeIdx).toBeGreaterThan(events.findIndex((e) => e.type === 'answer.token'))

    expect(out.shape).toBe('table')
    expect(out.content).toEqual({ columns: finalTable.columns, rows: finalTable.rows })
    expect(out.turnEndedReason).toBe('completed')
  })

  it('4. pre-shape failure — rethrows SynthesizerStreamFailureError(pre_shape_failure)', async () => {
    const { client } = makeLlmClient({
      partials: [],
      finalObject: { shape: 'narrative', content: 'unused' },
      partialError: new Error('boom-before-shape'),
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    await expect(adapter.synthesize(makeOpts({ streamEmitter: emitter }))).rejects.toBeInstanceOf(
      SynthesizerStreamFailureError,
    )
    try {
      await adapter.synthesize(makeOpts({ streamEmitter: emitter }))
    } catch (err) {
      expect(err).toBeInstanceOf(SynthesizerStreamFailureError)
      expect((err as SynthesizerStreamFailureError).failureCause).toBe('pre_shape_failure')
    }

    expect(recordSynthesizerFallback).toHaveBeenCalledWith({ cause: 'pre_shape_failure' })
  })

  it('5. post-shape failure — falls back to errored prose', async () => {
    const { client } = makeLlmClient({
      partials: [{ shape: 'narrative' }, { shape: 'narrative', content: 'partial...' }],
      finalObject: { shape: 'narrative', content: 'unused' },
      partialError: new Error('mid-stream-blow-up'),
      errorAfterIndex: 2, // throw after consuming both partials
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ streamEmitter: emitter }))

    expect(out.turnEndedReason).toBe('errored')
    expect(out.shape).toBe('narrative')
    expect(out.confidence).toBe('low')
    expect(typeof out.content).toBe('string')
    expect(out.usage).toBeUndefined()

    expect(recordSynthesizerFallback).toHaveBeenCalledWith({ cause: 'stream_error' })
    expect(recordSynthesizerCall).not.toHaveBeenCalled()

    const events = vi.mocked(emitter.emit).mock.calls.map((c) => c[0])
    expect(events.some((e) => e.type === 'answer.complete')).toBe(true)
  })

  it('6. finalObject rejection (schema) — falls back to errored', async () => {
    const synthesize = vi.fn(
      (_opts: SynthesizerLlmClientOpts): SynthesizerStreamResult => ({
        partialObjectStream: (async function* () {
          yield { shape: 'narrative' as const }
          yield { shape: 'narrative' as const, content: 'half' }
        })(),
        finalObject: Promise.reject(new Error('schema-validation-failed')),
        usage: Promise.resolve(SAMPLE_USAGE),
      }),
    )
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter({ synthesize })

    const out = await adapter.synthesize(makeOpts({ streamEmitter: emitter }))

    expect(out.turnEndedReason).toBe('errored')
    expect(recordSynthesizerFallback).toHaveBeenCalledWith({ cause: 'schema_validation' })
  })

  it('7. inline-copilot shape pinning — narrowed schema + nano model', async () => {
    const finalTable: SynthesizerLlmOutput = {
      shape: 'table',
      columns: ['x'],
      rows: [['1']],
    }
    const { client, synthesize } = makeLlmClient({
      partials: [{ shape: 'table' }],
      finalObject: finalTable,
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    await adapter.synthesize(
      makeOpts({
        surface: 'inline',
        expectedOutputShape: 'table',
        streamEmitter: emitter,
      }),
    )

    expect(synthesize).toHaveBeenCalledTimes(1)
    const callArg = synthesize.mock.calls[0]![0] as SynthesizerLlmClientOpts
    // Narrowed schema differs from the union root schema.
    expect(callArg.schema).not.toBe(SynthesizerOutputSchema)
    // Nano model on inline copilot.
    expect(callArg.model).toEqual({ provider: 'openai', model: 'gpt-5.4-nano' })
  })

  it('8. confidence aggregation — high + low → final low', async () => {
    const outputs = new Map([
      ['iter-1', makeCompletedOutput('kpi-regression', 'A', 'high')],
      ['iter-2', makeCompletedOutput('kpi-regression', 'B', 'low')],
    ])
    const { client } = makeLlmClient({
      partials: [{ shape: 'narrative' }, { shape: 'narrative', content: 'merged' }],
      finalObject: { shape: 'narrative', content: 'merged' },
    })
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ outputs }))

    expect(out.confidence).toBe('low')
    expect(out.turnEndedReason).toBe('completed')
  })

  it('10. emits a synthetic answer.token when streaming-shape final has content but partials never grew', async () => {
    // Partials declare narrative but never grow `content`. The final object
    // resolves with full content. State machine requires shape-declared →
    // tokens-streaming → answer-complete, so the adapter must synthesize one
    // token from the final or `answer.complete` would throw Invalid transition.
    const { client } = makeLlmClient({
      partials: [{ shape: 'narrative' }],
      finalObject: { shape: 'narrative', content: 'final text' },
    })
    const emitter = makeStreamEmitter()
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ streamEmitter: emitter }))

    expect(out.turnEndedReason).toBe('completed')

    const events = vi.mocked(emitter.emit).mock.calls.map((c) => c[0])
    const types = events.map((e) => e.type)
    expect(types).toEqual(['answer.shape_declared', 'answer.token', 'answer.complete'])

    const tokenEvent = events.find((e) => e.type === 'answer.token')
    expect(tokenEvent).toMatchObject({
      type: 'answer.token',
      payload: { token: 'final text' },
    })
  })

  it('11. contradiction caps confidence to low even with high inputs', async () => {
    const outputs = new Map([
      ['iter-1-analyst', makeCompletedOutput('kpi-regression', 'A', 'high')],
      ['iter-2-benchmarker', makeCompletedOutput('benchmark-comparison', 'B', 'high')],
    ])
    const { client } = makeLlmClient({
      partials: [{ shape: 'narrative' }, { shape: 'narrative', content: 'merged' }],
      finalObject: { shape: 'narrative', content: 'merged' },
    })
    const adapter = new SynthesizerAdapter(client)

    const out = await adapter.synthesize(makeOpts({ outputs }))

    expect(out.confidence).toBe('low')
  })

  it('12. records synthesizer latency on the happy narrative path', async () => {
    const { client } = makeLlmClient({
      partials: [{ shape: 'narrative' }, { shape: 'narrative', content: 'hi' }],
      finalObject: { shape: 'narrative', content: 'hi' },
    })
    const adapter = new SynthesizerAdapter(client)

    await adapter.synthesize(makeOpts())

    expect(recordSynthesizerLatency).toHaveBeenCalledTimes(1)
    expect(recordSynthesizerLatency).toHaveBeenCalledWith({
      shape: 'narrative',
      surface: 'global-chat',
      outcome: 'completed',
      durationMs: expect.any(Number),
    })
  })

  it('13. records synthesizer latency on the post-shape fallback path with outcome=errored', async () => {
    const { client } = makeLlmClient({
      partials: [{ shape: 'narrative' }, { shape: 'narrative', content: 'partial' }],
      finalObject: { shape: 'narrative', content: 'unused' },
      partialError: new Error('mid-stream-blow-up'),
      errorAfterIndex: 2,
    })
    const adapter = new SynthesizerAdapter(client)

    await adapter.synthesize(makeOpts())

    expect(recordSynthesizerLatency).toHaveBeenCalledTimes(1)
    expect(recordSynthesizerLatency).toHaveBeenCalledWith({
      shape: 'narrative',
      surface: 'global-chat',
      outcome: 'errored',
      durationMs: expect.any(Number),
    })
  })

  it('14. records synthesizer latency on pre-shape throw with outcome=errored', async () => {
    const { client } = makeLlmClient({
      partials: [],
      finalObject: { shape: 'narrative', content: 'unused' },
      partialError: new Error('boom-before-shape'),
    })
    const adapter = new SynthesizerAdapter(client)

    await expect(adapter.synthesize(makeOpts())).rejects.toBeInstanceOf(
      SynthesizerStreamFailureError,
    )

    expect(recordSynthesizerLatency).toHaveBeenCalledTimes(1)
    expect(recordSynthesizerLatency).toHaveBeenCalledWith({
      shape: 'unknown',
      surface: 'global-chat',
      outcome: 'errored',
      durationMs: expect.any(Number),
    })
  })
})
