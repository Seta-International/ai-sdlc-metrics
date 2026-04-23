/**
 * Core Span abstraction for the agents observability layer.
 *
 * All agent code uses this interface — never the raw OTel span — so that:
 *  1. The identity-key denylist is enforced at every setAttribute call.
 *  2. Sampling (NoOpSpan) is transparent to callers.
 *  3. recordUsage semantics (leaf-only) are encapsulated here.
 *
 * Domain layer — zero NestJS/Drizzle imports.
 */

import {
  SpanStatusCode,
  trace,
  context,
  type Span as OtelApiSpan,
  type Context as OtelContext,
} from '@opentelemetry/api'

// ─── Identity-key denylist ────────────────────────────────────────────────────

/**
 * Keys that are auto-stamped by middleware and must never be overridden by
 * caller code. setAttribute/setAttributes enforce this.
 */
export const IDENTITY_KEY_DENYLIST = [
  'tenant_id',
  'user_id',
  'trace_id',
  'surface',
  'delegation_id',
  'schedule_id',
  'flow_id',
  'intent_slug',
  'span_type',
  'entity_type',
] as const

function assertNotDenylistKey(key: string): void {
  if ((IDENTITY_KEY_DENYLIST as readonly string[]).includes(key)) {
    throw new Error(
      `[ObservabilitySpan] setAttribute called with reserved identity key "${key}". ` +
        `Identity keys are auto-stamped by middleware and must not be set by callers.`,
    )
  }
}

// ─── UsageSnapshot ────────────────────────────────────────────────────────────

export interface UsageSnapshot {
  inputUncached: number
  inputCachedRead: number
  inputCachedWrite: number
  output: number
  outputReasoning: number
}

// ─── Span interface ───────────────────────────────────────────────────────────

export interface Span {
  readonly spanId: string
  readonly traceId: string
  setAttribute(key: string, value: unknown): void
  setAttributes(attrs: Record<string, unknown>): void
  /** Leaf-only: records token usage as span attributes. Warns and skips if span has children. */
  recordUsage(usage: UsageSnapshot): void
  end(opts?: { status?: 'ok' | 'error'; error?: Error }): void
}

// ─── NoOpSpan ─────────────────────────────────────────────────────────────────

export class NoOpSpan implements Span {
  readonly spanId: string
  readonly traceId: string

  constructor(traceId: string) {
    this.traceId = traceId
    this.spanId = `noop-${crypto.randomUUID()}`
  }

  setAttribute(_key: string, _value: unknown): void {
    // no-op
  }

  setAttributes(_attrs: Record<string, unknown>): void {
    // no-op
  }

  recordUsage(_usage: UsageSnapshot): void {
    // no-op
  }

  end(_opts?: { status?: 'ok' | 'error'; error?: Error }): void {
    // no-op
  }
}

// ─── OtelSpan ─────────────────────────────────────────────────────────────────

/**
 * Wraps a raw OTel span to enforce the identity-key denylist and
 * leaf-only recordUsage semantics.
 *
 * `hasChildren` is set to `true` by `ObservabilityContext.createChildSpan`
 * on the parent span when a child is created, marking it as non-leaf.
 */
export class OtelSpan implements Span {
  readonly spanId: string
  readonly traceId: string

  /**
   * Mutable flag: set to true when a child span is created from this span.
   * Used to enforce leaf-only recordUsage semantics.
   */
  private _hasChildren: boolean

  constructor(
    private readonly _otel: OtelApiSpan,
    traceId: string,
    hasChildren = false,
  ) {
    this.traceId = traceId
    this._hasChildren = hasChildren
    this.spanId = _otel.spanContext().spanId
  }

  /** Marks this span as a non-leaf (has children). Called by ObservabilityContext.createChildSpan. */
  markHasChildren(): void {
    this._hasChildren = true
  }

  /** Returns an OTel Context with this span set as the active span. */
  asOtelContext(): OtelContext {
    return trace.setSpan(context.active(), this._otel)
  }

  setAttribute(key: string, value: unknown): void {
    assertNotDenylistKey(key)
    this._otel.setAttribute(key, value as Parameters<OtelApiSpan['setAttribute']>[1])
  }

  setAttributes(attrs: Record<string, unknown>): void {
    for (const key of Object.keys(attrs)) {
      assertNotDenylistKey(key)
    }
    this._otel.setAttributes(attrs as Parameters<OtelApiSpan['setAttributes']>[0])
  }

  recordUsage(usage: UsageSnapshot): void {
    if (this._hasChildren) {
      console.warn(
        '[ObservabilitySpan] recordUsage called on non-leaf span — skipping. ' +
          'Only leaf spans (spans with no children) should record token usage.',
      )
      return
    }
    this._otel.setAttributes({
      'usage.input_uncached': usage.inputUncached,
      'usage.input_cached_read': usage.inputCachedRead,
      'usage.input_cached_write': usage.inputCachedWrite,
      'usage.output': usage.output,
      'usage.output_reasoning': usage.outputReasoning,
    })
  }

  end(opts?: { status?: 'ok' | 'error'; error?: Error }): void {
    if (opts?.status === 'ok') {
      this._otel.setStatus({ code: SpanStatusCode.OK })
    } else if (opts?.status === 'error') {
      if (opts.error) {
        this._otel.recordException(opts.error)
      }
      this._otel.setStatus({
        code: SpanStatusCode.ERROR,
        message: opts.error?.message,
      })
    }
    this._otel.end()
  }
}
