/**
 * Tests for Span, NoOpSpan, and OtelSpan implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpanStatusCode } from '@opentelemetry/api'
import { NoOpSpan, OtelSpan, IDENTITY_KEY_DENYLIST } from './span'
import type { UsageSnapshot } from './span'

// ─── NoOpSpan ─────────────────────────────────────────────────────────────────

describe('NoOpSpan', () => {
  let span: NoOpSpan

  beforeEach(() => {
    span = new NoOpSpan('trace-1')
  })

  it('has a spanId and traceId', () => {
    expect(span.spanId).toBeTruthy()
    expect(span.traceId).toBe('trace-1')
  })

  it('setAttribute does nothing', () => {
    expect(() => span.setAttribute('foo', 'bar')).not.toThrow()
  })

  it('setAttributes does nothing', () => {
    expect(() => span.setAttributes({ foo: 'bar', baz: 42 })).not.toThrow()
  })

  it('recordUsage does nothing', () => {
    const usage: UsageSnapshot = {
      inputUncached: 100,
      inputCachedRead: 50,
      inputCachedWrite: 10,
      output: 200,
      outputReasoning: 30,
    }
    expect(() => span.recordUsage(usage)).not.toThrow()
  })

  it('end does nothing', () => {
    expect(() => span.end()).not.toThrow()
    expect(() => span.end({ status: 'ok' })).not.toThrow()
    expect(() => span.end({ status: 'error', error: new Error('oops') })).not.toThrow()
  })
})

// ─── Identity-key denylist ─────────────────────────────────────────────────────

describe('OtelSpan — identity-key denylist', () => {
  function makeOtelSpan(hasChildren = false) {
    const otelSpan = {
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
      spanContext: vi.fn(() => ({ traceId: 'trace-1', spanId: 'span-abc' })),
    }
    return { otelSpan, span: new OtelSpan(otelSpan as never, 'trace-1', hasChildren) }
  }

  it('throws when setAttribute is called with a denylist key', () => {
    const { span } = makeOtelSpan()
    for (const key of IDENTITY_KEY_DENYLIST) {
      expect(() => span.setAttribute(key, 'some-value'), `key: ${key}`).toThrow()
    }
  })

  it('passes through setAttribute for non-denylist keys', () => {
    const { otelSpan, span } = makeOtelSpan()
    span.setAttribute('custom_key', 'value')
    expect(otelSpan.setAttribute).toHaveBeenCalledWith('custom_key', 'value')
  })

  it('throws when setAttributes contains a denylist key', () => {
    const { span } = makeOtelSpan()
    expect(() => span.setAttributes({ tenant_id: 'x', other: 'y' })).toThrow()
  })

  it('passes through setAttributes with no denylist keys', () => {
    const { otelSpan, span } = makeOtelSpan()
    span.setAttributes({ custom_key: 'value', other_key: 42 })
    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      custom_key: 'value',
      other_key: 42,
    })
  })
})

// ─── OtelSpan recordUsage ─────────────────────────────────────────────────────

describe('OtelSpan — recordUsage', () => {
  const usage: UsageSnapshot = {
    inputUncached: 100,
    inputCachedRead: 50,
    inputCachedWrite: 10,
    output: 200,
    outputReasoning: 30,
  }

  function makeOtelSpan(hasChildren: boolean) {
    const otelSpan = {
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
      spanContext: vi.fn(() => ({ traceId: 'trace-1', spanId: 'span-abc' })),
    }
    return { otelSpan, span: new OtelSpan(otelSpan as never, 'trace-1', hasChildren) }
  }

  it('records usage on a leaf span', () => {
    const { otelSpan, span } = makeOtelSpan(false)
    span.recordUsage(usage)
    expect(otelSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'usage.input_uncached': 100,
        'usage.input_cached_read': 50,
        'usage.input_cached_write': 10,
        'usage.output': 200,
        'usage.output_reasoning': 30,
      }),
    )
  })

  it('warns and skips recordUsage on a non-leaf span', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { otelSpan, span } = makeOtelSpan(true)
    span.recordUsage(usage)
    expect(otelSpan.setAttributes).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('non-leaf'))
    warnSpy.mockRestore()
  })
})

// ─── OtelSpan end ─────────────────────────────────────────────────────────────

describe('OtelSpan — end', () => {
  function makeOtelSpan() {
    const otelSpan = {
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
      spanContext: vi.fn(() => ({ traceId: 'trace-1', spanId: 'span-abc' })),
    }
    return { otelSpan, span: new OtelSpan(otelSpan as never, 'trace-1', false) }
  }

  it('ends span with ok status', () => {
    const { otelSpan, span } = makeOtelSpan()
    span.end({ status: 'ok' })
    expect(otelSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK })
    expect(otelSpan.end).toHaveBeenCalled()
  })

  it('ends span with error status and records exception', () => {
    const { otelSpan, span } = makeOtelSpan()
    const err = new Error('fail')
    span.end({ status: 'error', error: err })
    expect(otelSpan.recordException).toHaveBeenCalledWith(err)
    expect(otelSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'fail' })
    expect(otelSpan.end).toHaveBeenCalled()
  })

  it('ends span with no opts', () => {
    const { otelSpan, span } = makeOtelSpan()
    span.end()
    expect(otelSpan.end).toHaveBeenCalled()
  })
})
