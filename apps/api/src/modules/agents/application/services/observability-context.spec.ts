/**
 * Tests for ObservabilityContextFactory and ObservabilityContext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Minimal OTel mock — must be hoisted before module imports ────────────────

const { mockOtelSpan, mockTracer } = vi.hoisted(() => {
  const mockOtelSpan = {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    spanContext: vi.fn(() => ({ traceId: 'otel-trace-id', spanId: 'otel-span-id' })),
  }
  const mockTracer = {
    startSpan: vi.fn(() => mockOtelSpan),
  }
  return { mockOtelSpan, mockTracer }
})

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => mockTracer),
    setSpan: vi.fn((_ctx: unknown, _span: unknown) => ({})),
  },
  context: {
    active: vi.fn(() => ({})),
    with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  },
  SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
}))

import { ObservabilityContextFactory } from './observability-context'
import { NoOpSpan } from '../../domain/observability/span'
import { SpanType, EntityType } from '../../domain/observability/span-types'
import type { RequestContext } from './tool-gateway-contracts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const REQUEST_CONTEXT: RequestContext = {
  tenantId: 'tenant-abc',
  userId: 'user-xyz',
  traceId: 'trace-000',
  surface: 'web',
}

function makeFactory() {
  return new ObservabilityContextFactory()
}

// ─── NoOp path ────────────────────────────────────────────────────────────────

describe('ObservabilityContextFactory — NoOp path (capture=false)', () => {
  let factory: ObservabilityContextFactory

  beforeEach(() => {
    factory = makeFactory()
    vi.clearAllMocks()
  })

  it('returns a context with a NoOpSpan as currentSpan', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-1',
      intentSlug: 'leave-request',
      capture: false,
    })
    expect(ctx.currentSpan).toBeInstanceOf(NoOpSpan)
  })

  it('createChildSpan returns a NoOpSpan', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-1',
      intentSlug: 'leave-request',
      capture: false,
    })
    const child = ctx.createChildSpan({
      type: SpanType.ROUTER_PLAN,
      entity: EntityType.ROUTER,
      name: 'router:plan',
    })
    expect(child).toBeInstanceOf(NoOpSpan)
  })

  it('exposes flowId and intentSlug', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-noop',
      intentSlug: 'slug-noop',
      capture: false,
    })
    expect(ctx.flowId).toBe('flow-noop')
    expect(ctx.intentSlug).toBe('slug-noop')
  })
})

// ─── Real OTel path ───────────────────────────────────────────────────────────

describe('ObservabilityContextFactory — real OTel path (capture=true)', () => {
  let factory: ObservabilityContextFactory

  beforeEach(() => {
    factory = makeFactory()
    vi.clearAllMocks()
    // Reset setAttributes mock to track calls
    mockOtelSpan.setAttributes.mockClear()
    mockOtelSpan.setAttribute.mockClear()
    mockTracer.startSpan.mockClear()
  })

  it('createChildSpan auto-stamps identity keys on the span', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-real',
      intentSlug: 'leave-apply',
      capture: true,
    })

    ctx.createChildSpan({
      type: SpanType.ROUTER_PLAN,
      entity: EntityType.ROUTER,
      name: 'router:plan',
    })

    // setAttributes should have been called with identity keys stamped
    expect(mockOtelSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-abc',
        user_id: 'user-xyz',
        trace_id: 'trace-000',
        surface: 'web',
        flow_id: 'flow-real',
        intent_slug: 'leave-apply',
        span_type: SpanType.ROUTER_PLAN,
        entity_type: EntityType.ROUTER,
      }),
    )
  })

  it('createChildSpan merges extra attrs', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-real',
      intentSlug: 'leave-apply',
      capture: true,
    })

    ctx.createChildSpan({
      type: SpanType.SUB_AGENT_PLAN,
      entity: EntityType.SUB_AGENT,
      name: 'sub-agent:plan',
      attrs: { sub_agent_key: 'leave-bot' },
    })

    expect(mockOtelSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        sub_agent_key: 'leave-bot',
        span_type: SpanType.SUB_AGENT_PLAN,
      }),
    )
  })

  it('identity-key setAttribute is blocked on child spans', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-real',
      intentSlug: 'leave-apply',
      capture: true,
    })

    const child = ctx.createChildSpan({
      type: SpanType.TURN,
      entity: EntityType.ROUTER,
      name: 'turn',
    })

    // Trying to set a denylist key on the returned span must throw
    expect(() => child.setAttribute('tenant_id', 'evil')).toThrow()
    expect(() => child.setAttribute('flow_id', 'evil')).toThrow()
    expect(() => child.setAttribute('user_id', 'evil')).toThrow()
  })

  it('identity-key setAttributes is blocked on child spans', () => {
    const ctx = factory.create({
      requestContext: REQUEST_CONTEXT,
      flowId: 'flow-real',
      intentSlug: 'leave-apply',
      capture: true,
    })

    const child = ctx.createChildSpan({
      type: SpanType.TURN,
      entity: EntityType.ROUTER,
      name: 'turn',
    })

    expect(() => child.setAttributes({ tenant_id: 'evil', other: 'ok' })).toThrow()
  })
})
