/**
 * gateway-spans.spec.ts
 *
 * Uses the OTel SDK's InMemorySpanExporter + SimpleSpanProcessor to capture
 * spans synchronously (no batching delay). Tests verify:
 *  - Span names, attributes, and status codes.
 *  - Exception recording on throws.
 *  - Tripwire annotation.
 *  - Parent-child relationships.
 *
 * OTel SDK v2 notes:
 *  - `NodeTracerProvider` is now `BasicTracerProvider` in sdk-trace-base.
 *  - `trace.setGlobalTracerProvider(provider)` can only be called ONCE — OTel
 *    API intentionally prevents re-registration to preserve stability. We
 *    therefore set the provider once at module load time for the entire spec
 *    file, and reset the exporter between tests using `exporter.reset()`.
 *  - `context.setGlobalContextManager(new AsyncLocalStorageContextManager())`
 *    is required for `context.with(...)` to propagate spans across async
 *    boundaries (withGatewayStep relies on this for parent-child).
 *  - Parent-child relationship is stored in `span.parentSpanContext` (not
 *    `span.parentSpanId` which was removed in v2).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { tripwire } from '../guards/tripwire'
import { withGatewayStep, recordStepAttrs } from './gateway-spans'

// ─── One-time OTel provider setup ────────────────────────────────────────────
//
// OTel API intentionally prevents re-registration of the global TracerProvider
// (setGlobalTracerProvider returns false and is a no-op on the second call).
// We register once for the entire spec file and reset the exporter between tests.

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})
trace.setGlobalTracerProvider(provider)

// Register AsyncLocalStorage context manager so context.with() propagates
// span context across async boundaries — required for parent-child tests.
const ctxMgr = new AsyncLocalStorageContextManager()
ctxMgr.enable()
context.setGlobalContextManager(ctxMgr)

// Reset the exporter before each test so spans don't bleed across tests
beforeEach(() => {
  exporter.reset()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans()
}

function findSpan(name: string): ReadableSpan | undefined {
  return getSpans().find((s) => s.name === name)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('withGatewayStep', () => {
  describe('happy path', () => {
    it('returns the fn result and emits one span with correct name and attrs', async () => {
      const result = await withGatewayStep(
        'resolve',
        { tool_name: 'planner.task.list', sub_agent_key: 'planner' },
        () => 'ok-result',
      )

      expect(result).toBe('ok-result')

      const spans = getSpans()
      expect(spans).toHaveLength(1)
      const span = spans[0]!
      expect(span.name).toBe('gateway:resolve')
      expect(span.attributes['tool_name']).toBe('planner.task.list')
      expect(span.attributes['sub_agent_key']).toBe('planner')
      // Happy path — status should remain UNSET (not set to OK)
      expect(span.status.code).toBe(SpanStatusCode.UNSET)
    })

    it('span is ended (has end time) after fn returns', async () => {
      await withGatewayStep('invoke', { tool_name: 'foo' }, () => 42)
      const span = findSpan('gateway:invoke')!
      expect(span).toBeDefined()
      // endTime is a HrTime tuple; both components being 0 means the span was never ended
      expect(span.endTime[0] + span.endTime[1]).toBeGreaterThan(0)
    })
  })

  describe('throw path', () => {
    it('re-throws, records exception, sets status ERROR', async () => {
      const boom = new Error('boom')

      await expect(
        withGatewayStep('invoke', {}, () => {
          throw boom
        }),
      ).rejects.toThrow('boom')

      const spans = getSpans()
      expect(spans).toHaveLength(1)
      const span = spans[0]!
      expect(span.name).toBe('gateway:invoke')
      expect(span.status.code).toBe(SpanStatusCode.ERROR)
      expect(span.status.message).toBe('boom')

      // OTel records exceptions as events named 'exception'
      const exceptionEvent = span.events.find((e) => e.name === 'exception')
      expect(exceptionEvent).toBeDefined()
      expect(exceptionEvent?.attributes?.['exception.message']).toBe('boom')
    })

    it('span is still ended after a throw', async () => {
      await expect(
        withGatewayStep('invoke', {}, () => {
          throw new Error('x')
        }),
      ).rejects.toThrow()
      const span = findSpan('gateway:invoke')!
      expect(span).toBeDefined()
      expect(span.endTime[0] + span.endTime[1]).toBeGreaterThan(0)
    })
  })

  describe('tripwire path', () => {
    it('returns the tripwire, annotates span with variant + disposition, sets status ERROR', async () => {
      const tw = tripwire('ceiling_breach_bytes', 'retry', {
        toolName: 'planner.task.list',
        bytesRemaining: 0,
        wallclockRemaining: null,
      })

      const result = await withGatewayStep('ceiling-check', { bytes_remaining: 0 }, () => tw)

      // Returns tripwire unchanged
      expect(result).toBe(tw)

      const span = findSpan('gateway:ceiling-check')!
      expect(span).toBeDefined()
      expect(span.status.code).toBe(SpanStatusCode.ERROR)
      expect(span.status.message).toBe('ceiling_breach_bytes')
      expect(span.attributes['tripwire_variant']).toBe('ceiling_breach_bytes')
      expect(span.attributes['disposition']).toBe('retry')
    })

    it('permission_denied tripwire sets status ERROR and correct attrs', async () => {
      const tw = tripwire('permission_denied', 'abort', { toolName: 'foo.bar' })
      const result = await withGatewayStep('invoke', { tool_name: 'foo.bar' }, () => tw)

      expect(result).toBe(tw)
      const span = findSpan('gateway:invoke')!
      expect(span.attributes['tripwire_variant']).toBe('permission_denied')
      expect(span.attributes['disposition']).toBe('abort')
      expect(span.status.code).toBe(SpanStatusCode.ERROR)
    })
  })

  describe('parent-child relationship', () => {
    it('nested steps produce parent-child spans via parentSpanContext', async () => {
      await withGatewayStep('resolve', { tool_name: 'outer' }, async () => {
        return withGatewayStep('invoke', { tool_name: 'inner' }, () => 'done')
      })

      const spans = getSpans()
      expect(spans).toHaveLength(2)

      const parent = spans.find((s) => s.name === 'gateway:resolve')!
      const child = spans.find((s) => s.name === 'gateway:invoke')!

      expect(parent).toBeDefined()
      expect(child).toBeDefined()

      // In OTel SDK v2, parent-child is stored via parentSpanContext (not parentSpanId)
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    })

    it('sibling spans at root level have no parent span context', async () => {
      await withGatewayStep('resolve', {}, () => 'r')
      await withGatewayStep('ceiling-check', {}, () => 'c')

      const spans = getSpans()
      expect(spans).toHaveLength(2)

      // Top-level spans (no nesting) have no parent
      for (const span of spans) {
        expect(span.parentSpanContext).toBeUndefined()
      }
    })
  })

  describe('async fn support', () => {
    it('awaits async fn and returns resolved value', async () => {
      const result = await withGatewayStep('audit-emit', {}, async () => {
        await Promise.resolve()
        return 'async-ok'
      })
      expect(result).toBe('async-ok')
    })
  })
})

describe('recordStepAttrs', () => {
  it('adds attributes to the active span inside a withGatewayStep', async () => {
    await withGatewayStep('invoke', {}, () => {
      recordStepAttrs({ retry_count: 1, cached_args_hash: 'abc123' })
      return 'done'
    })

    const span = findSpan('gateway:invoke')!
    expect(span.attributes['retry_count']).toBe(1)
    expect(span.attributes['cached_args_hash']).toBe('abc123')
  })

  it('is a no-op when there is no active span (outside gateway step)', () => {
    // Should not throw even with no active span
    expect(() => recordStepAttrs({ foo: 'bar' })).not.toThrow()
  })
})
