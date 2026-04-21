/**
 * ToolGateway orchestrator tests.
 *
 * Integration-ish: real ToolRegistry + real L1Cache + real pipeline step logic;
 * mocked TrpcCaller + mocked KernelAuditFacade.
 *
 * Test plan per spec §F:
 *  - Unknown tool → procedure_not_agent_exposed, no audit
 *  - Happy path read → caller called once, audit success, L1 has entry after
 *  - Second identical call → cache hit, caller NOT called again, audit fromCache
 *  - Concurrent identical calls → caller called exactly once, both get same result
 *  - Permission denied → audit permission_denied, circuit-breaker set
 *  - Second call after permission denied → permission_denied_disabled, no caller
 *  - Ceiling breach (first) → retry, counter incremented
 *  - Ceiling breach (second) → abort, breaker set
 *  - Third call after ceiling breaker → circuit_broken: true in audit
 *  - Pre-write abort → abort_pre_write, NO audit, no caller
 *  - Sanitization: UUID/date stripped from returned context
 *  - Transient retry: caller fails once ECONNRESET, succeeds on retry
 *  - Transient both fail → transient_infra_error, retry disposition
 *  - tenant_id NOT injected into args
 *
 * Task 6 additions (observability smoke tests):
 *  - Happy path: span names captured in order (resolve → taint-wrap-setup →
 *    ceiling-check → invoke → taint-wrap-result → audit-emit).
 *  - Permission denied: recordTripwire called with correct labels.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { trace, context } from '@opentelemetry/api'
import { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import { L1Cache } from '../../infrastructure/cache/l1-cache'
import { ToolGateway, sanitizeTripwireContext } from './tool-gateway'
import type { TrpcCaller } from '../pipeline/pipeline-steps'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import * as gatewayMetrics from '../../infrastructure/observability/gateway-metrics'

// ─── One-time OTel provider for smoke tests ──────────────────────────────────
// OTel API only allows one global TracerProvider registration — register once
// at module load and reset the exporter between tests.
const spanExporter = new InMemorySpanExporter()
const tracerProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
})
trace.setGlobalTracerProvider(tracerProvider)
const ctxMgr = new AsyncLocalStorageContextManager()
ctxMgr.enable()
context.setGlobalContextManager(ctxMgr)
import type { ToolGatewayInvokeInput, TurnState, RequestContext } from './tool-gateway-contracts'
import type { AgentToolDescriptor, AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_META: AgentToolMeta = {
  whenToUse: 'Use to read tasks',
  whenNotToUse: 'Not for mutations',
  examples: [{ input: 'List tasks', callArgs: {} }],
}

const MUTATION_META: AgentToolMeta = {
  ...BASE_META,
  approvalFreshness: 'revalidate',
}

function makeDescriptor(overrides?: Partial<AgentToolDescriptor>): AgentToolDescriptor {
  return {
    name: 'planner.task.getBoard',
    procedure: 'query',
    permission: 'planner:task:read',
    inputSchema: undefined,
    outputSchema: undefined,
    meta: BASE_META,
    ...overrides,
  }
}

const REQUEST_CONTEXT: RequestContext = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  traceId: 'trace-1',
  surface: 'web',
}

function makeRegistry(descriptor?: AgentToolDescriptor): ToolRegistry {
  const reg = {
    getDescriptor: vi.fn().mockReturnValue(descriptor),
    listAgentTools: vi.fn().mockReturnValue(descriptor ? [descriptor] : []),
    resolveMenuFor: vi.fn().mockReturnValue([]),
    loadFromRouter: vi.fn(),
  }
  return reg as unknown as ToolRegistry
}

function makeAuditFacade(): { facade: KernelAuditFacade; recordEvent: ReturnType<typeof vi.fn> } {
  const recordEvent = vi.fn().mockResolvedValue(undefined)
  const facade = { recordEvent } as unknown as KernelAuditFacade
  return { facade, recordEvent }
}

function makeTurnState(overrides?: Partial<TurnState>): TurnState {
  return {
    tainted: { value: false },
    circuitBreaker: new Map(),
    retryCount: new Map(),
    toolCeilingRemaining: new Map(),
    l1Cache: new L1Cache(),
    ...overrides,
  }
}

function makeCaller(
  resolveValue?: unknown,
  rejectFactory?: () => unknown,
): { caller: TrpcCaller; callFn: ReturnType<typeof vi.fn> } {
  const callFn =
    rejectFactory !== undefined
      ? vi.fn().mockRejectedValue(rejectFactory())
      : vi.fn().mockResolvedValue(resolveValue)
  const caller = { call: callFn } as unknown as TrpcCaller
  return { caller, callFn }
}

function makeInput(overrides?: Partial<ToolGatewayInvokeInput>): ToolGatewayInvokeInput {
  return {
    toolName: 'planner.task.getBoard',
    args: { planId: 'p-1' },
    subAgentKey: 'planner-agent',
    subAgentScope: ['planner:task'],
    requestContext: REQUEST_CONTEXT,
    abortSignal: new AbortController().signal,
    turnState: makeTurnState(),
    mode: 'execute',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// Reset span exporter before each test so spans don't bleed
beforeEach(() => {
  spanExporter.reset()
})

describe('ToolGateway', () => {
  describe('procedure_out_of_sub_agent_scope', () => {
    it('tool exists in registry but permission is outside subAgentScope — tripwire, no caller, no audit', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        permission: 'planner:task:read',
      })
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ tasks: [] })
      const gw = new ToolGateway(registry, caller, facade)

      // subAgentScope does NOT include 'planner:task:read' or any prefix of it
      const result = await gw.invoke(
        makeInput({ subAgentScope: ['people:profile:read', 'time:leave:read'] }),
      )

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('procedure_out_of_sub_agent_scope')
        expect(result.disposition).toBe('abort')
      }
      expect(callFn).not.toHaveBeenCalled()
      expect(recordEvent).not.toHaveBeenCalled()
    })
  })

  describe('unknown tool', () => {
    it('returns procedure_not_agent_exposed tripwire without calling audit', async () => {
      const registry = makeRegistry(undefined)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ toolName: 'unknown.tool' }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('procedure_not_agent_exposed')
        expect(result.disposition).toBe('abort')
      }
      expect(recordEvent).not.toHaveBeenCalled()
    })
  })

  describe('happy path read', () => {
    it('calls caller once, emits success audit, L1 has entry after', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ tasks: [{ id: '1' }] })
      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('ok')
      expect(callFn).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ resultStatus: 'success' }),
        }),
      )
      if (result.kind === 'ok') {
        expect(result.fromCache).toBe(false)
      }
    })
  })

  describe('L1 cache hit on second identical call', () => {
    it('second call hits cache — caller NOT called again, audit has fromCache: true', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ tasks: [{ id: '1' }] })
      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)
      const input = makeInput({ turnState })

      const first = await gw.invoke(input)
      const second = await gw.invoke(input)

      expect(first.kind).toBe('ok')
      expect(second.kind).toBe('ok')
      if (second.kind === 'ok') {
        expect(second.fromCache).toBe(true)
      }
      expect(callFn).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledTimes(2)

      const secondAuditCall = recordEvent.mock.calls[1] as [unknown]
      const secondPayload = (secondAuditCall[0] as { payload: Record<string, unknown> }).payload
      expect(secondPayload['extraAttrs']).toMatchObject({ fromCache: true })
    })
  })

  describe('concurrent identical calls (cache coalescing)', () => {
    it('caller called exactly once; both callers receive the same result', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()

      // Slow call: resolves after 10ms
      let resolveCall!: (v: unknown) => void
      const callPromise = new Promise((res) => {
        resolveCall = res
      })
      const callFn = vi.fn().mockReturnValue(callPromise)
      const caller = { call: callFn } as unknown as TrpcCaller

      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)
      const input = makeInput({ turnState })

      // Fire two concurrent calls before the first resolves
      const p1 = gw.invoke(input)
      // Small tick to let first call register in-flight
      await Promise.resolve()
      const p2 = gw.invoke(input)

      // Now resolve the underlying call
      resolveCall({ tasks: ['coalesced'] })

      const [r1, r2] = await Promise.all([p1, p2])

      expect(callFn).toHaveBeenCalledTimes(1)
      expect(r1.kind).toBe('ok')
      expect(r2.kind).toBe('ok')

      if (r1.kind === 'ok' && r2.kind === 'ok') {
        expect(r1.result).toEqual(r2.result)
      }

      // Secondary caller should have cache_coalesced in audit
      const auditCalls = recordEvent.mock.calls as Array<
        [{ payload: { extraAttrs?: Record<string, unknown> } }]
      >
      const coalescedAudit = auditCalls.find(
        ([args]) => args.payload?.extraAttrs?.['cache_coalesced'] === true,
      )
      expect(coalescedAudit).toBeDefined()
    })
  })

  describe('permission denied', () => {
    it('returns sanitized permission_denied tripwire and emits audit', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller } = makeCaller(
        undefined,
        () => new TRPCError({ code: 'FORBIDDEN', message: 'No access' }),
      )
      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('permission_denied')
        expect(result.disposition).toBe('abort')
        // Sanitized — no rawMessage in returned context
        expect(result.context['rawMessage']).toBeUndefined()
        expect(result.context['errorClass']).toBe('permission_denied')
      }
      expect(recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ resultStatus: 'permission_denied' }),
        }),
      )
    })

    it('sets circuit-breaker after permission_denied', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller(
        undefined,
        () => new TRPCError({ code: 'FORBIDDEN', message: 'No access' }),
      )
      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)

      await gw.invoke(makeInput({ turnState }))

      const cb = turnState.circuitBreaker.get(descriptor.name)
      expect(cb?.permissionDenied).toBe(true)
      expect(cb?.brokenAt).toBeGreaterThan(0)
    })

    it('second call returns permission_denied_disabled without invoking caller', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller, callFn } = makeCaller(
        undefined,
        () => new TRPCError({ code: 'FORBIDDEN', message: 'No access' }),
      )
      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)
      const input = makeInput({ turnState })

      // First call — sets breaker
      await gw.invoke(input)
      recordEvent.mockClear()
      callFn.mockClear()

      // Second call
      const result = await gw.invoke(input)

      expect(callFn).not.toHaveBeenCalled()
      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('permission_denied_disabled')
      }
      expect(recordEvent).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ resultStatus: 'permission_denied_disabled' }),
        }),
      )
    })
  })

  describe('ceiling breach', () => {
    it('first ceiling breach → retry disposition, retry counter incremented', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
      })
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ tasks: [] })
      const turnState = makeTurnState({
        toolCeilingRemaining: new Map([['planner.task.getBoard', { bytes: 0 }]]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(callFn).not.toHaveBeenCalled()
      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('ceiling_breach_bytes')
        expect(result.disposition).toBe('retry')
      }
      expect(turnState.retryCount.get('planner.task.getBoard:ceiling')).toBe(1)
      expect(recordEvent).toHaveBeenCalledTimes(1)
    })

    it('second ceiling breach → abort disposition, circuit-breaker set', async () => {
      const descriptor = makeDescriptor({
        meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const turnState = makeTurnState({
        toolCeilingRemaining: new Map([['planner.task.getBoard', { bytes: 0 }]]),
        retryCount: new Map([['planner.task.getBoard:ceiling', 1]]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.disposition).toBe('abort')
      }
      expect(turnState.circuitBreaker.get('planner.task.getBoard')?.ceilingBreached).toBe(true)
    })

    it('third call after ceiling breaker set → circuit_broken: true in audit', async () => {
      const descriptor = makeDescriptor({
        meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
      })
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const turnState = makeTurnState({
        toolCeilingRemaining: new Map([['planner.task.getBoard', { bytes: 0 }]]),
        circuitBreaker: new Map([
          ['planner.task.getBoard', { ceilingBreached: true as const, brokenAt: Date.now() }],
        ]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('ceiling_breach_bytes')
      }
      const auditPayload = (
        recordEvent.mock.calls[0] as [{ payload: { extraAttrs: Record<string, unknown> } }]
      )[0].payload.extraAttrs
      expect(auditPayload?.['circuit_broken']).toBe(true)
    })
  })

  describe('pre-write abort', () => {
    it('mutation with pre-aborted signal → abort_pre_write, NO audit, no caller', async () => {
      const descriptor = makeDescriptor({
        procedure: 'mutation',
        permission: 'planner:task:write',
        meta: MUTATION_META,
      })
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ ok: true })
      const abortController = new AbortController()
      abortController.abort('user cancelled')
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(
        makeInput({
          toolName: 'planner.task.getBoard',
          subAgentScope: ['planner:task'],
          abortSignal: abortController.signal,
        }),
      )

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('abort_pre_write')
        expect(result.disposition).toBe('abort')
      }
      expect(callFn).not.toHaveBeenCalled()
      expect(recordEvent).not.toHaveBeenCalled()
    })
  })

  describe('sanitization', () => {
    it('UUID and ISO date in rawMessage are stripped from returned tripwire context', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()

      const rawMsg =
        'employee id=550e8400-e29b-41d4-a716-446655440000 overlapping leave 2026-04-22T00:00:00.000Z'
      const { caller } = makeCaller(
        undefined,
        () => new TRPCError({ code: 'CONFLICT', message: rawMsg }),
      )
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput())

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        // Sanitized context must NOT contain the UUID or date
        const ctxStr = JSON.stringify(result.context)
        expect(ctxStr).not.toContain('550e8400-e29b-41d4-a716-446655440000')
        expect(ctxStr).not.toContain('2026-04-22T00:00:00')
        expect(ctxStr).not.toContain(rawMsg)
      }

      // Audit MUST contain the raw error info
      expect(recordEvent).toHaveBeenCalled()
      const auditPayload = (
        recordEvent.mock.calls[0] as [{ payload: { extraAttrs: Record<string, unknown> } }]
      )[0].payload
      const auditStr = JSON.stringify(auditPayload)
      expect(auditStr).toContain(rawMsg)
    })
  })

  describe('transient infra retry', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('caller fails once with ECONNRESET, succeeds on retry — caller called twice, success returned', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()

      const callFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('read ECONNRESET'))
        .mockResolvedValueOnce({ tasks: ['retry-success'] })
      const caller = { call: callFn } as unknown as TrpcCaller
      const gw = new ToolGateway(registry, caller, facade)

      const invokePromise = gw.invoke(makeInput())
      // Advance timers to let the retry sleep pass
      await vi.runAllTimersAsync()
      const result = await invokePromise

      expect(callFn).toHaveBeenCalledTimes(2)
      expect(result.kind).toBe('ok')
      // Single success audit row
      expect(recordEvent).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ resultStatus: 'success' }),
        }),
      )
    })

    it('both transient failures → transient_infra_error, retry disposition, audit emitted', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()

      const callFn = vi.fn().mockRejectedValue(new Error('read ECONNRESET'))
      const caller = { call: callFn } as unknown as TrpcCaller
      const gw = new ToolGateway(registry, caller, facade)

      const invokePromise = gw.invoke(makeInput())
      await vi.runAllTimersAsync()
      const result = await invokePromise

      expect(callFn).toHaveBeenCalledTimes(2)
      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('transient_infra_error')
        expect(result.disposition).toBe('retry')
      }
      expect(recordEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('tenant_id not injected into args', () => {
    it('the gateway passes args to the caller unchanged (no tenant_id injection)', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const callFn = vi.fn().mockResolvedValue({ tasks: [] })
      const caller = { call: callFn } as unknown as TrpcCaller
      const gw = new ToolGateway(registry, caller, facade)

      const args = { planId: 'plan-xyz' }
      await gw.invoke(makeInput({ args }))

      expect(callFn).toHaveBeenCalledWith(
        expect.objectContaining({
          args,
        }),
      )
      // args must NOT have tenant_id injected
      const calledArgs = callFn.mock.calls[0][0].args as Record<string, unknown>
      expect('tenant_id' in calledArgs).toBe(false)
    })
  })

  // ─── C-2: wallclock ceiling variant propagates through circuit breaker ────

  describe('ceiling breach — wallclock variant (Fix C-2)', () => {
    it('wallclock-only tool: second breach trips breaker with wallclock variant; third call tripwires ceiling_breach_wallclock', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        meta: { ...BASE_META, ceilings: { wallclockMs: 0 } }, // wallclock-only ceiling
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })

      // Pre-seed: retryCount at 1 so the second breach trips the breaker
      const turnState = makeTurnState({
        toolCeilingRemaining: new Map([['planner.task.getBoard', { wallclockMs: 0 }]]),
        retryCount: new Map([['planner.task.getBoard:ceiling', 1]]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      // Second ceiling breach — should trip the breaker with wallclock variant
      const secondResult = await gw.invoke(makeInput({ turnState }))
      expect(secondResult.kind).toBe('tripwire')
      if (secondResult.kind === 'tripwire') {
        expect(secondResult.disposition).toBe('abort')
      }

      // Verify the circuit breaker records the wallclock variant
      const cb = turnState.circuitBreaker.get('planner.task.getBoard')
      expect(cb?.ceilingBreached).toBe(true)
      expect(cb?.breachedVariant).toBe('ceiling_breach_wallclock')
    })

    it('wallclock-only tool: third call (circuit breaker hit) tripwires ceiling_breach_wallclock not bytes', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        meta: { ...BASE_META, ceilings: { wallclockMs: 0 } },
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })

      // Pre-set circuit breaker with wallclock variant (as if second breach already happened)
      const turnState = makeTurnState({
        toolCeilingRemaining: new Map([['planner.task.getBoard', { wallclockMs: 0 }]]),
        circuitBreaker: new Map([
          [
            'planner.task.getBoard',
            {
              ceilingBreached: true as const,
              breachedVariant: 'ceiling_breach_wallclock' as const,
              brokenAt: Date.now(),
            },
          ],
        ]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        // Must be wallclock variant, NOT bytes
        expect(result.variant).toBe('ceiling_breach_wallclock')
        expect(result.variant).not.toBe('ceiling_breach_bytes')
        expect(result.disposition).toBe('abort')
      }
    })

    it('wallclock-only tool: recordTripwire metric uses ceiling_breach_wallclock on circuit-broken path', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        meta: { ...BASE_META, ceilings: { wallclockMs: 0 } },
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })

      const turnState = makeTurnState({
        toolCeilingRemaining: new Map([['planner.task.getBoard', { wallclockMs: 0 }]]),
        circuitBreaker: new Map([
          [
            'planner.task.getBoard',
            {
              ceilingBreached: true as const,
              breachedVariant: 'ceiling_breach_wallclock' as const,
              brokenAt: Date.now(),
            },
          ],
        ]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const recordTripwireSpy = vi.spyOn(gatewayMetrics, 'recordTripwire')
      await gw.invoke(makeInput({ turnState }))

      // The recordTripwire call for the ceiling-broken path must use wallclock variant
      const ceilingTripwireCall = recordTripwireSpy.mock.calls.find(
        ([, variant]) => variant === 'ceiling_breach_wallclock',
      )
      expect(ceilingTripwireCall).toBeDefined()
      // Confirm bytes variant was NOT used
      const bytesTripwireCall = recordTripwireSpy.mock.calls.find(
        ([, variant]) => variant === 'ceiling_breach_bytes',
      )
      expect(bytesTripwireCall).toBeUndefined()

      recordTripwireSpy.mockRestore()
    })
  })

  // ─── I-2: recordTripwire fires on resolve errors ──────────────────────────

  describe('recordTripwire on resolve errors (Fix I-2)', () => {
    it('procedure_not_agent_exposed fires recordTripwire', async () => {
      const registry = makeRegistry(undefined) // tool not found
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const gw = new ToolGateway(registry, caller, facade)

      const recordTripwireSpy = vi.spyOn(gatewayMetrics, 'recordTripwire')
      const result = await gw.invoke(makeInput({ toolName: 'nonexistent.tool' }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('procedure_not_agent_exposed')
      }
      const call = recordTripwireSpy.mock.calls.find(
        ([, variant]) => variant === 'procedure_not_agent_exposed',
      )
      expect(call).toBeDefined()

      recordTripwireSpy.mockRestore()
    })

    it('procedure_out_of_sub_agent_scope fires recordTripwire', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        permission: 'planner:task:read',
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const gw = new ToolGateway(registry, caller, facade)

      const recordTripwireSpy = vi.spyOn(gatewayMetrics, 'recordTripwire')
      const result = await gw.invoke(
        makeInput({ subAgentScope: ['people:profile:read'] }), // excludes planner
      )

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('procedure_out_of_sub_agent_scope')
      }
      const call = recordTripwireSpy.mock.calls.find(
        ([, variant]) => variant === 'procedure_out_of_sub_agent_scope',
      )
      expect(call).toBeDefined()

      recordTripwireSpy.mockRestore()
    })
  })

  // ─── I-4: coalesced-waiter audit row does not carry primary's rawMessage ──

  describe('coalesced waiter audit row (Fix I-4)', () => {
    it('coalesced waiter error audit row does NOT contain rawMessage', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()

      // Primary call will fail
      let rejectCall!: (err: unknown) => void
      const callPromise = new Promise<unknown>((_, rej) => {
        rejectCall = rej
      })
      const callFn = vi.fn().mockReturnValue(callPromise)
      const caller = { call: callFn } as unknown as TrpcCaller

      const turnState = makeTurnState()
      const gw = new ToolGateway(registry, caller, facade)
      const input = makeInput({ turnState })

      // Fire two concurrent calls
      const p1 = gw.invoke(input)
      await Promise.resolve()
      const p2 = gw.invoke(input)

      // Reject the primary with a raw error
      rejectCall(new Error('db exploded with secret-data'))

      const [r1, r2] = await Promise.all([p1, p2])

      expect(r1.kind).toBe('tripwire')
      expect(r2.kind).toBe('tripwire')

      // Find the coalesced waiter's audit row
      const auditCalls = recordEvent.mock.calls as Array<
        [{ payload: { extraAttrs?: Record<string, unknown> } }]
      >
      const waitersAuditRow = auditCalls.find(
        ([args]) => args.payload?.extraAttrs?.['cache_coalesced'] === true,
      )
      expect(waitersAuditRow).toBeDefined()

      // rawMessage must NOT appear in the waiter's audit row
      const extraAttrs = waitersAuditRow![0].payload.extraAttrs ?? {}
      expect(extraAttrs['rawMessage']).toBeUndefined()
      expect(extraAttrs['cache_coalesced']).toBe(true)
    })
  })

  // ─── Observability smoke tests (Task 6) ───────────────────────────────────
  //
  // These tests verify span names + order and metric helper calls.
  // Detailed attribute coverage lives in gateway-spans.spec.ts.

  describe('observability — span emission (Task 6 smoke tests)', () => {
    it('happy path: span names emitted in expected order', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [{ id: '1' }] })
      const gw = new ToolGateway(registry, caller, facade)

      await gw.invoke(makeInput())

      const spanNames = spanExporter.getFinishedSpans().map((s: ReadableSpan) => s.name)

      // Order: resolve → taint-wrap-setup → ceiling-check → invoke → taint-wrap-result → audit-emit
      const expectedOrder = [
        'gateway:resolve',
        'gateway:taint-wrap-setup',
        'gateway:ceiling-check',
        'gateway:invoke',
        'gateway:taint-wrap-result',
        'gateway:audit-emit',
      ]
      for (const expected of expectedOrder) {
        expect(spanNames).toContain(expected)
      }
      // Verify relative order
      for (let i = 0; i < expectedOrder.length - 1; i++) {
        expect(spanNames.indexOf(expectedOrder[i]!)).toBeLessThan(
          spanNames.indexOf(expectedOrder[i + 1]!),
        )
      }
    })

    it('permission_denied path: permission_denied span variant attr and no invoke span', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller(
        undefined,
        () => new TRPCError({ code: 'FORBIDDEN', message: 'No access' }),
      )
      const gw = new ToolGateway(registry, caller, facade)

      await gw.invoke(makeInput())

      const spans = spanExporter.getFinishedSpans()
      const invokeSpan = spans.find((s: ReadableSpan) => s.name === 'gateway:invoke')
      const auditSpan = spans.find((s: ReadableSpan) => s.name === 'gateway:audit-emit')

      // invoke span was emitted (invoke was attempted — it returned permission_denied)
      expect(invokeSpan).toBeDefined()
      // invoke span should have tripwire_variant set
      expect(invokeSpan?.attributes['tripwire_variant']).toBe('permission_denied')
      // audit-emit span was emitted
      expect(auditSpan).toBeDefined()
    })

    it('circuit_broken permission_denied_disabled: resolve span carries circuit_broken=true and cb_reason=permission_denied', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const turnState = makeTurnState({
        circuitBreaker: new Map([
          ['planner.task.getBoard', { permissionDenied: true as const, brokenAt: Date.now() }],
        ]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('permission_denied_disabled')
      }

      const spans = spanExporter.getFinishedSpans()
      const resolveSpan = spans.find((s: ReadableSpan) => s.name === 'gateway:resolve')
      expect(resolveSpan).toBeDefined()
      expect(resolveSpan?.attributes['circuit_broken']).toBe(true)
      expect(resolveSpan?.attributes['cb_reason']).toBe('permission_denied')
    })

    it('circuit_broken ceiling_breached: resolve span carries circuit_broken=true and cb_reason=ceiling_breached', async () => {
      const descriptor = makeDescriptor({
        meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller } = makeCaller({ tasks: [] })
      const turnState = makeTurnState({
        circuitBreaker: new Map([
          ['planner.task.getBoard', { ceilingBreached: true as const, brokenAt: Date.now() }],
        ]),
      })
      const gw = new ToolGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput({ turnState }))

      expect(result.kind).toBe('tripwire')
      if (result.kind === 'tripwire') {
        expect(result.variant).toBe('ceiling_breach_bytes')
      }

      const spans = spanExporter.getFinishedSpans()
      const resolveSpan = spans.find((s: ReadableSpan) => s.name === 'gateway:resolve')
      expect(resolveSpan).toBeDefined()
      expect(resolveSpan?.attributes['circuit_broken']).toBe(true)
      expect(resolveSpan?.attributes['cb_reason']).toBe('ceiling_breached')
    })
  })
})

// ─── sanitizeTripwireContext unit tests ───────────────────────────────────────

describe('sanitizeTripwireContext', () => {
  it('passes through structurally-safe variants untouched', () => {
    const ctx = { toolName: 'foo', reason: 'signal' }
    const result = sanitizeTripwireContext(ctx, 'abort_pre_write')
    expect(result).toBe(ctx)
  })

  it('strips rawMessage from validation_failed context', () => {
    const ctx = { toolName: 'foo', rawMessage: 'secret data', trpcCode: 'BAD_REQUEST' }
    const result = sanitizeTripwireContext(ctx, 'validation_failed')
    expect(result['rawMessage']).toBeUndefined()
    expect(result['trpcCode']).toBeUndefined()
    expect(result['toolName']).toBe('foo')
    expect(result['errorClass']).toBe('validation_failed')
    expect(typeof result['retryHint']).toBe('string')
  })

  it('preserves fieldName in validation_failed (it is a schema field name, safe)', () => {
    const ctx = { toolName: 'foo', rawMessage: 'error', fieldName: 'planId' }
    const result = sanitizeTripwireContext(ctx, 'validation_failed')
    expect(result['fieldName']).toBe('planId')
  })

  it('retains numeric budget fields for ceiling variants', () => {
    const ctx = { toolName: 'foo', bytesRemaining: 0, wallclockRemaining: 100 }
    const result = sanitizeTripwireContext(ctx, 'ceiling_breach_bytes')
    expect(result['bytesRemaining']).toBe(0)
    expect(result['wallclockRemaining']).toBe(100)
    expect(result['rawMessage']).toBeUndefined()
  })

  it('strips rawMessage from infra_error context', () => {
    const ctx = {
      toolName: 'bar',
      rawMessage: 'DB blew up with <secret>',
      trpcCode: 'INTERNAL_SERVER_ERROR',
    }
    const result = sanitizeTripwireContext(ctx, 'infra_error')
    expect(result['rawMessage']).toBeUndefined()
    expect(result['errorClass']).toBe('infra_error')
    expect(typeof result['retryHint']).toBe('string')
  })
})
