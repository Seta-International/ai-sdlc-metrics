import { SpanStatusCode } from '@opentelemetry/api'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { tenantContext } from '@seta/tenant'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startLlmSpan } from './span'

const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

beforeAll(() => {
  provider.register()
})

afterAll(async () => {
  await provider.shutdown()
})

beforeEach(() => {
  exporter.reset()
})

describe('startLlmSpan', () => {
  it('opens a span with the expected name and baseline attrs', () => {
    const handle = startLlmSpan('anthropic', 'claude-4-7-sonnet', 'run-1')
    handle.end('ok')
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    const span = spans[0]
    expect(span?.name).toBe('llm.anthropic.stream')
    expect(span?.attributes['llm.provider']).toBe('anthropic')
    expect(span?.attributes['llm.model']).toBe('claude-4-7-sonnet')
    expect(span?.attributes['run.id']).toBe('run-1')
    expect(span?.status.code).toBe(SpanStatusCode.OK)
  })

  it('omits tenant.id attribute when no ALS frame is active', () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-2')
    handle.end('ok')
    const span = exporter.getFinishedSpans()[0]
    expect(span?.attributes['tenant.id']).toBeUndefined()
  })

  it('records tenant.id when an ALS frame is active', async () => {
    await tenantContext.run({ tenantId: 'tenant-a' }, async () => {
      const handle = startLlmSpan('openai', 'gpt-4o', 'run-3')
      handle.end('ok')
    })
    const span = exporter.getFinishedSpans()[0]
    expect(span?.attributes['tenant.id']).toBe('tenant-a')
  })

  it('record() merges attrs that appear on the closed span', () => {
    const handle = startLlmSpan('anthropic', 'claude-4-7-sonnet', 'run-4')
    handle.record({ estimatedInputTokens: 100 })
    handle.record({ inputTokens: 120, outputTokens: 50, finishReason: 'stop' })
    handle.end('ok')
    const a = exporter.getFinishedSpans()[0]?.attributes ?? {}
    expect(a['llm.estimated_input_tokens']).toBe(100)
    expect(a['llm.input_tokens']).toBe(120)
    expect(a['llm.output_tokens']).toBe(50)
    expect(a['llm.finish_reason']).toBe('stop')
  })

  it("end('error', cause) sets ERROR status and records exception", () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-5')
    handle.record({ errorCode: 'LLM_BAD_REQUEST' })
    handle.end('error', new Error('boom'))
    const span = exporter.getFinishedSpans()[0]
    expect(span?.status.code).toBe(SpanStatusCode.ERROR)
    expect(span?.attributes['llm.error_code']).toBe('LLM_BAD_REQUEST')
    expect(span?.events.some((e) => e.name === 'exception')).toBe(true)
  })

  it("end('aborted') sets OK status and aborted: true attribute", () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-6')
    handle.end('aborted')
    const span = exporter.getFinishedSpans()[0]
    expect(span?.status.code).toBe(SpanStatusCode.OK)
    expect(span?.attributes['llm.aborted']).toBe(true)
  })

  it('calling end twice is a no-op', () => {
    const handle = startLlmSpan('openai', 'gpt-4o', 'run-7')
    handle.end('ok')
    handle.end('error', new Error('late'))
    const spans = exporter.getFinishedSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0]?.status.code).toBe(SpanStatusCode.OK)
  })
})
