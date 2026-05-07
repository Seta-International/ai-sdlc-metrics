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

import { describe, it, expect, vi, beforeEach } from 'vitest'
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
import { FlowPolicyResolver } from './flow-policy-resolver'
import type { DraftProposer } from './draft-proposer'
import type { DraftProposalResult } from './draft-types'
import type { IntentSlug } from './flow-id-propagation'
import type { SemanticResultCache } from '../../infrastructure/cache/semantic-result-cache'
import type { IWriteDedupRepository } from '../../domain/repositories/write-dedup.repository'
import type { AgentWriteDedupRow } from '../../infrastructure/schema/agents.schema'

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

const CACHEABLE_META: AgentToolMeta = {
  ...BASE_META,
  cacheable: { ttlSeconds: 300, distanceThreshold: 0.97 },
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
    taintSources: [],
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

function makeFlowPolicyResolver(): FlowPolicyResolver {
  const resolver = new FlowPolicyResolver()
  return resolver
}

function makeDraftProposer(result?: Partial<DraftProposalResult>): {
  draftProposer: DraftProposer
  proposeFn: ReturnType<typeof vi.fn>
} {
  const defaultResult: DraftProposalResult = {
    draftId: 'draft-1',
    actionId: 'draft-1',
    tier: 'low_risk_auto',
    requiresApproval: false,
    summary: 'Draft action: planner.createTask',
    provenance: {
      triggered_by: 'user:user-1',
      user_utterance: '',
      drafted_at: new Date(),
      derived_from_tainted_sources: [],
    },
    approvalFreshness: 'accept-stale',
    approvalTtlHours: 72,
    delegationId: 'del-1',
    ...result,
  }
  const proposeFn = vi.fn().mockResolvedValue(defaultResult)
  const draftProposer = { propose: proposeFn } as unknown as DraftProposer
  return { draftProposer, proposeFn }
}

function makeSemanticCache(hitResult?: {
  result: unknown
  hitKind: 'exact' | 'semantic'
  storedAt: Date
}): {
  semanticCache: SemanticResultCache
  getFn: ReturnType<typeof vi.fn>
  putFn: ReturnType<typeof vi.fn>
  invalidateDomainFn: ReturnType<typeof vi.fn>
} {
  const getFn = vi.fn().mockResolvedValue(hitResult ?? undefined)
  const putFn = vi.fn().mockResolvedValue(undefined)
  const invalidateDomainFn = vi.fn().mockResolvedValue({ purgedCount: 0 })
  const semanticCache = {
    get: getFn,
    put: putFn,
    invalidateDomain: invalidateDomainFn,
  } as unknown as SemanticResultCache
  return { semanticCache, getFn, putFn, invalidateDomainFn }
}

function makeWriteDedupRepo(hitRow?: AgentWriteDedupRow): {
  writeDedupRepo: IWriteDedupRepository
  findByKeyFn: ReturnType<typeof vi.fn>
  insertFn: ReturnType<typeof vi.fn>
} {
  const findByKeyFn = vi.fn().mockResolvedValue(hitRow ?? null)
  const insertFn = vi.fn().mockResolvedValue(undefined)
  const deleteExpiredFn = vi.fn().mockResolvedValue({ deletedCount: 0 })
  const writeDedupRepo = {
    findByKey: findByKeyFn,
    insert: insertFn,
    deleteExpired: deleteExpiredFn,
  } as unknown as IWriteDedupRepository
  return { writeDedupRepo, findByKeyFn, insertFn }
}

function makeGateway(
  registry: ToolRegistry,
  caller: TrpcCaller,
  facade: KernelAuditFacade,
  flowPolicyResolver?: FlowPolicyResolver,
  draftProposer?: DraftProposer,
  semanticCache?: SemanticResultCache,
  writeDedupRepo?: IWriteDedupRepository,
): ToolGateway {
  return new ToolGateway(
    registry,
    caller,
    facade,
    flowPolicyResolver ?? makeFlowPolicyResolver(),
    draftProposer ?? makeDraftProposer().draftProposer,
    semanticCache ?? makeSemanticCache().semanticCache,
    writeDedupRepo ?? makeWriteDedupRepo().writeDedupRepo,
  )
}

// Policy that allows people.* mutations — used for tests that are NOT testing
// the R-08.36 people_writes allowlist check (L1 cache, flow-policy, DraftProposer, etc.)
const INTERACTIVE_POLICY_PEOPLE_ENABLED = Object.freeze({
  readOnly: false,
  agentPeopleWritesEnabled: true,
})

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
    // Default policy allows people.* mutations so existing tests using people.updateEmployee
    // as a test fixture continue to work. R-08.36 allowlist tests set agentPeopleWritesEnabled
    // explicitly to false to test the refusal behavior.
    policy: INTERACTIVE_POLICY_PEOPLE_ENABLED,
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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)
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
      const gw = makeGateway(registry, caller, facade)
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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)
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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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

  describe('transient infra error (no gateway retry — provider retry lives in LLM clients)', () => {
    it('caller fails with ECONNRESET — surfaces transient_infra_error immediately, caller invoked once', async () => {
      const descriptor = makeDescriptor()
      const registry = makeRegistry(descriptor)
      const { facade, recordEvent } = makeAuditFacade()

      const callFn = vi.fn().mockRejectedValue(new Error('read ECONNRESET'))
      const caller = { call: callFn } as unknown as TrpcCaller
      const gw = makeGateway(registry, caller, facade)

      const result = await gw.invoke(makeInput())

      // No retry — exactly one invocation
      expect(callFn).toHaveBeenCalledTimes(1)
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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)
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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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
      const gw = makeGateway(registry, caller, facade)

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

  // ─── R-04.3a: module-scoped L1 cache invalidation on mutation success ────────

  describe('R-04.3a — module-scoped L1 cache invalidation', () => {
    it('mutation success: same-module cached reads are invalidated', async () => {
      // Arrange: a people.getEmployee query is cached, then people.updateEmployee mutation fires.
      const writeDescriptor = makeDescriptor({
        name: 'people.updateEmployee',
        procedure: 'mutation',
        permission: 'people:employee:write',
        meta: MUTATION_META,
      })

      const turnState = makeTurnState()

      // Seed the L1 cache with a completed people.getEmployee entry
      const handle = turnState.l1Cache.registerInFlight('people.getEmployee', 'h-read')
      handle.complete({ id: 'emp-1', name: 'Alice' })
      expect(turnState.l1Cache.lookup('people.getEmployee', 'h-read')?.kind).toBe('completed')

      // Invoke the mutation
      const { caller } = makeCaller({ updated: true })
      const { facade } = makeAuditFacade()
      const registry = makeRegistry(writeDescriptor)
      const gw = makeGateway(registry, caller, facade)

      const result = await gw.invoke(
        makeInput({
          toolName: 'people.updateEmployee',
          args: { employeeId: 'emp-1', name: 'Alice Updated' },
          subAgentKey: 'people-agent',
          subAgentScope: ['people:employee'],
          turnState,
        }),
      )

      expect(result.kind).toBe('ok')

      // Same-module read must have been evicted
      expect(turnState.l1Cache.lookup('people.getEmployee', 'h-read')).toBeUndefined()
    })

    it('mutation success: cross-module reads are NOT invalidated', async () => {
      // A time.getLeaveBalance entry must survive when people.updateEmployee fires.
      const writeDescriptor = makeDescriptor({
        name: 'people.updateEmployee',
        procedure: 'mutation',
        permission: 'people:employee:write',
        meta: MUTATION_META,
      })

      const turnState = makeTurnState()

      // Seed the L1 cache with a completed time.getLeaveBalance entry
      const handle = turnState.l1Cache.registerInFlight('time.getLeaveBalance', 'h-time')
      handle.complete({ balance: 10 })

      const { caller } = makeCaller({ updated: true })
      const { facade } = makeAuditFacade()
      const registry = makeRegistry(writeDescriptor)
      const gw = makeGateway(registry, caller, facade)

      await gw.invoke(
        makeInput({
          toolName: 'people.updateEmployee',
          args: { employeeId: 'emp-1' },
          subAgentKey: 'people-agent',
          subAgentScope: ['people:employee'],
          turnState,
        }),
      )

      // Cross-module read must be untouched
      expect(turnState.l1Cache.lookup('time.getLeaveBalance', 'h-time')?.kind).toBe('completed')
    })

    it('mutation success: agent_l1_invalidation_total metric fires with correct labels', async () => {
      const writeDescriptor = makeDescriptor({
        name: 'people.updateEmployee',
        procedure: 'mutation',
        permission: 'people:employee:write',
        meta: MUTATION_META,
      })

      const { caller } = makeCaller({ updated: true })
      const { facade } = makeAuditFacade()
      const registry = makeRegistry(writeDescriptor)
      const gw = makeGateway(registry, caller, facade)

      const recordL1Spy = vi.spyOn(gatewayMetrics, 'recordL1Invalidation')

      await gw.invoke(
        makeInput({
          toolName: 'people.updateEmployee',
          args: { employeeId: 'emp-1' },
          subAgentKey: 'people-agent',
          subAgentScope: ['people:employee'],
        }),
      )

      expect(recordL1Spy).toHaveBeenCalledTimes(1)
      expect(recordL1Spy).toHaveBeenCalledWith('people-agent', 'people')

      recordL1Spy.mockRestore()
    })

    it('query success: does NOT invalidate same-module reads or emit invalidation metric', async () => {
      const readDescriptor = makeDescriptor({
        name: 'people.getEmployee',
        procedure: 'query',
        permission: 'people:employee:read',
      })

      const turnState = makeTurnState()
      const handle = turnState.l1Cache.registerInFlight('people.listEmployees', 'h-list')
      handle.complete([{ id: 'emp-1' }])

      const { caller } = makeCaller({ id: 'emp-1', name: 'Alice' })
      const { facade } = makeAuditFacade()
      const registry = makeRegistry(readDescriptor)
      const gw = makeGateway(registry, caller, facade)

      const recordL1Spy = vi.spyOn(gatewayMetrics, 'recordL1Invalidation')

      await gw.invoke(
        makeInput({
          toolName: 'people.getEmployee',
          args: { employeeId: 'emp-1' },
          subAgentKey: 'people-agent',
          subAgentScope: ['people:employee'],
          turnState,
        }),
      )

      // Cache entry from the same module is still present
      expect(turnState.l1Cache.lookup('people.listEmployees', 'h-list')?.kind).toBe('completed')
      // Metric must NOT have fired
      expect(recordL1Spy).not.toHaveBeenCalled()

      recordL1Spy.mockRestore()
    })
  })
})

// ─── Plan 08 T6: FlowPolicyResolver integration ───────────────────────────────

describe('FlowPolicyResolver integration (Plan 08 T6)', () => {
  it('resolver.resolve() is called during a mutation tool invocation with the intentSlug from input', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: { ...BASE_META, approvalFreshness: 'revalidate' },
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ updated: true })

    const flowPolicyResolver = makeFlowPolicyResolver()
    const resolveSpy = vi.spyOn(flowPolicyResolver, 'resolve')

    const { draftProposer } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, flowPolicyResolver, draftProposer)

    await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee'],
        intentSlug: 'update-employee' as IntentSlug,
      }),
    )

    expect(resolveSpy).toHaveBeenCalledTimes(1)
    expect(resolveSpy).toHaveBeenCalledWith('update-employee', descriptor.meta)
  })

  it('resolver.resolve() is called even with no intentSlug (empty string fallback)', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: { ...BASE_META, approvalFreshness: 'revalidate' },
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ updated: true })

    const flowPolicyResolver = makeFlowPolicyResolver()
    const resolveSpy = vi.spyOn(flowPolicyResolver, 'resolve')

    const { draftProposer } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, flowPolicyResolver, draftProposer)

    await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee'],
        // no intentSlug — must still call resolve with ''
      }),
    )

    expect(resolveSpy).toHaveBeenCalledTimes(1)
    expect(resolveSpy).toHaveBeenCalledWith('', descriptor.meta)
  })

  it('resolver.resolve() is NOT called for query tools (only mutations)', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })

    const flowPolicyResolver = makeFlowPolicyResolver()
    const resolveSpy = vi.spyOn(flowPolicyResolver, 'resolve')

    const { draftProposer } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, flowPolicyResolver, draftProposer)

    await gw.invoke(makeInput())

    expect(resolveSpy).not.toHaveBeenCalled()
  })
})

// ─── Plan 08 T6: DraftProposer integration ────────────────────────────────────

describe('DraftProposer integration (Plan 08 T6)', () => {
  it('DraftProposer.propose() is called when a mutation tool succeeds', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: { ...BASE_META, approvalFreshness: 'revalidate' },
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ updated: true })

    const { draftProposer, proposeFn } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, undefined, draftProposer)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee'],
        requestContext: { ...REQUEST_CONTEXT, userId: 'user-42' },
      }),
    )

    expect(proposeFn).toHaveBeenCalledTimes(1)
    expect(proposeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'people.updateEmployee',
        tenantId: 'tenant-1',
        initiatorUserId: 'user-42',
      }),
    )
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.draft).toBeDefined()
      expect(result.draft?.draftId).toBe('draft-1')
    }
  })

  it('DraftProposer.propose() is NOT called for query tools', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })

    const { draftProposer, proposeFn } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, undefined, draftProposer)

    const result = await gw.invoke(makeInput())

    expect(proposeFn).not.toHaveBeenCalled()
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.draft).toBeUndefined()
    }
  })

  it('DraftProposer.propose() is NOT called when mutation tool fails (invoke tripwire)', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: { ...BASE_META, approvalFreshness: 'revalidate' },
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller(
      undefined,
      () => new TRPCError({ code: 'FORBIDDEN', message: 'No access' }),
    )

    const { draftProposer, proposeFn } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, undefined, draftProposer)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee'],
      }),
    )

    expect(proposeFn).not.toHaveBeenCalled()
    expect(result.kind).toBe('tripwire')
  })

  it('DraftProposer.propose() is NOT called on query cache-hit path (fromCache=true)', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: BASE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })

    const { draftProposer, proposeFn } = makeDraftProposer()
    const turnState = makeTurnState()
    const gw = makeGateway(registry, caller, facade, undefined, draftProposer)
    const input = makeInput({
      toolName: 'planner.getBoard',
      subAgentScope: ['planner:task'],
      turnState,
    })

    // First call — no draft (it's a query)
    await gw.invoke(input)
    expect(proposeFn).not.toHaveBeenCalled()

    // Second call hits cache — still no draft
    const second = await gw.invoke(input)
    expect(proposeFn).not.toHaveBeenCalled()
    expect(second.kind).toBe('ok')
    if (second.kind === 'ok') {
      expect(second.fromCache).toBe(true)
      expect(second.draft).toBeUndefined()
    }
  })

  it('DraftProposer failure does not break the gateway — result still ok', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: { ...BASE_META, approvalFreshness: 'revalidate' },
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ updated: true })

    const { draftProposer } = makeDraftProposer()
    vi.spyOn(draftProposer, 'propose').mockRejectedValue(new Error('DraftSink unavailable'))

    const gw = makeGateway(registry, caller, facade, undefined, draftProposer)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee'],
      }),
    )

    // Gateway must still return ok even if DraftProposer throws
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      // draft may be undefined on error path — resilient behaviour
      expect(result.draft).toBeUndefined()
    }
  })

  it('FlowPolicyResolver effective approvalTtlHours is passed through to DraftProposer', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: { ...BASE_META, approvalFreshness: 'revalidate', approvalTtl: '48h' },
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ updated: true })

    // Register a flow policy that overrides TTL to 24h (stricter than tool's 48h)
    const flowPolicyResolver = makeFlowPolicyResolver()
    flowPolicyResolver.registerPolicy({
      intent_slug: 'update-employee',
      approvalTtlHours: 24,
    })

    const { draftProposer, proposeFn } = makeDraftProposer()
    const gw = makeGateway(registry, caller, facade, flowPolicyResolver, draftProposer)

    await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee'],
        intentSlug: 'update-employee' as IntentSlug,
      }),
    )

    expect(proposeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalTtlHours: 24, // min(24h flow, 48h tool) = 24h
      }),
    )
  })
})

// ─── Plan 14: SemanticResultCache integration ─────────────────────────────────

describe('SemanticResultCache integration (Plan 14)', () => {
  it('non-cacheable tool: semanticCache.get() is NOT called', async () => {
    // BASE_META has no cacheable field
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: BASE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })
    const { semanticCache, getFn } = makeSemanticCache()
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    const result = await gw.invoke(makeInput())

    expect(result.kind).toBe('ok')
    expect(getFn).not.toHaveBeenCalled()
  })

  it('non-cacheable tool: semanticCache.put() is NOT called after invoke', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: BASE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })
    const { semanticCache, putFn } = makeSemanticCache()
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    await gw.invoke(makeInput())

    // Allow any fire-and-forget promises to settle
    await Promise.resolve()
    expect(putFn).not.toHaveBeenCalled()
  })

  it('cacheable tool — semantic cache hit: get() called, result returned, put() NOT called', async () => {
    const cachedResult = { tasks: [{ id: 'cached-1' }] }
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: CACHEABLE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade, recordEvent } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ tasks: [] })
    const { semanticCache, getFn, putFn } = makeSemanticCache({
      result: cachedResult,
      hitKind: 'semantic',
      storedAt: new Date(),
    })
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    const result = await gw.invoke(makeInput())

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      // fromCache is false on semantic cache hit (not L1)
      expect(result.fromCache).toBe(false)
    }
    expect(getFn).toHaveBeenCalledTimes(1)
    expect(getFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        toolName: 'planner.task.getBoard',
        embeddingModel: 'text-embedding-3-small',
      }),
    )
    // Underlying caller must NOT have been invoked (cache hit)
    expect(callFn).not.toHaveBeenCalled()
    // put() must NOT be called (we got a hit, no new result to store)
    await Promise.resolve()
    expect(putFn).not.toHaveBeenCalled()
    // Audit must have been emitted with fromSemanticCache=true
    expect(recordEvent).toHaveBeenCalledTimes(1)
    const auditPayload = (
      recordEvent.mock.calls[0] as [{ payload: { extraAttrs: Record<string, unknown> } }]
    )[0].payload.extraAttrs
    expect(auditPayload?.['fromSemanticCache']).toBe(true)
    expect(auditPayload?.['cacheHitKind']).toBe('semantic')
  })

  it('cacheable tool — exact semantic cache hit: hitKind=exact recorded in audit', async () => {
    const cachedResult = { tasks: [{ id: 'exact-1' }] }
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: CACHEABLE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade, recordEvent } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })
    const { semanticCache } = makeSemanticCache({
      result: cachedResult,
      hitKind: 'exact',
      storedAt: new Date(),
    })
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    await gw.invoke(makeInput())

    const auditPayload = (
      recordEvent.mock.calls[0] as [{ payload: { extraAttrs: Record<string, unknown> } }]
    )[0].payload.extraAttrs
    expect(auditPayload?.['cacheHitKind']).toBe('exact')
  })

  it('cacheable tool — semantic cache miss: get() called, invoke proceeds, put() called after', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: CACHEABLE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ tasks: [{ id: 'live-1' }] })
    // getFn returns undefined → cache miss
    const { semanticCache, getFn, putFn } = makeSemanticCache(undefined)
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    const result = await gw.invoke(makeInput())

    expect(result.kind).toBe('ok')
    expect(getFn).toHaveBeenCalledTimes(1)
    // Caller invoked on cache miss
    expect(callFn).toHaveBeenCalledTimes(1)
    // Allow fire-and-forget put to settle
    await Promise.resolve()
    await Promise.resolve()
    expect(putFn).toHaveBeenCalledTimes(1)
    expect(putFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        toolName: 'planner.task.getBoard',
        ttlSeconds: 300,
        embeddingModel: 'text-embedding-3-small',
      }),
    )
  })

  it('mutation success: invalidateDomain() called with correct domain', async () => {
    const descriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ updated: true })
    const { semanticCache, invalidateDomainFn } = makeSemanticCache()
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        args: { employeeId: 'emp-1' },
        subAgentScope: ['people:employee'],
      }),
    )

    expect(result.kind).toBe('ok')
    // Allow fire-and-forget invalidation to settle
    await Promise.resolve()
    await Promise.resolve()
    expect(invalidateDomainFn).toHaveBeenCalledTimes(1)
    expect(invalidateDomainFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        domain: 'people',
      }),
    )
  })

  it('query success: invalidateDomain() is NOT called', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: BASE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })
    const { semanticCache, invalidateDomainFn } = makeSemanticCache()
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    await gw.invoke(makeInput())

    await Promise.resolve()
    expect(invalidateDomainFn).not.toHaveBeenCalled()
  })

  it('recordSemanticCacheLookup metric fires with hit_kind=semantic on semantic hit', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: CACHEABLE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })
    const { semanticCache } = makeSemanticCache({
      result: { tasks: [] },
      hitKind: 'semantic',
      storedAt: new Date(),
    })
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    const recordSemanticSpy = vi.spyOn(gatewayMetrics, 'recordSemanticCacheLookup')
    await gw.invoke(makeInput())

    const call = recordSemanticSpy.mock.calls.find(([, , hitKind]) => hitKind === 'semantic')
    expect(call).toBeDefined()
    expect(call?.[0]).toBe('tenant-1')
    expect(call?.[1]).toBe('planner.task.getBoard')

    recordSemanticSpy.mockRestore()
  })

  it('recordSemanticCacheLookup metric fires with hit_kind=miss on semantic cache miss', async () => {
    const descriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: CACHEABLE_META,
    })
    const registry = makeRegistry(descriptor)
    const { facade } = makeAuditFacade()
    const { caller } = makeCaller({ tasks: [] })
    const { semanticCache } = makeSemanticCache(undefined)
    const gw = makeGateway(registry, caller, facade, undefined, undefined, semanticCache)

    const recordSemanticSpy = vi.spyOn(gatewayMetrics, 'recordSemanticCacheLookup')
    await gw.invoke(makeInput())

    const call = recordSemanticSpy.mock.calls.find(([, , hitKind]) => hitKind === 'miss')
    expect(call).toBeDefined()

    recordSemanticSpy.mockRestore()
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

// ─── Plan 09 R-09.6a — Read-only policy envelope tests ───────────────────────

describe('ToolGateway read-only policy envelope (Plan 09 R-09.6a)', () => {
  // ── Test: mutation tool refused under readOnly policy ──────────────────────

  it('refuses a mutation tool under readOnly policy — returns policy_violation tripwire', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade, recordEvent } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ success: true })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee:write'],
        policy: { readOnly: true, agentPeopleWritesEnabled: true },
      }),
    )

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('policy_violation')
      expect(result.disposition).toBe('abort')
      expect(result.context['toolName']).toBe('people.updateEmployee')
      expect(result.context['reason']).toBe('read_only_policy')
    }

    // The caller must NOT have been invoked — no domain side-effects
    expect(callFn).not.toHaveBeenCalled()

    // A kernel audit event must have been emitted for the violation
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.tool_called',
        payload: expect.objectContaining({
          resultStatus: 'policy_violation',
          extraAttrs: expect.objectContaining({ policy: 'read_only' }),
        }),
      }),
    )
  })

  // ── Test: read-only (query) tool allowed under readOnly policy ─────────────

  it('allows a query tool under readOnly policy — proceeds to invoke', async () => {
    const queryDescriptor = makeDescriptor({
      name: 'planner.task.getBoard',
      procedure: 'query',
      permission: 'planner:task:read',
      meta: BASE_META,
    })
    const registry = makeRegistry(queryDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ tasks: [] })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'planner.task.getBoard',
        subAgentScope: ['planner:task'],
        policy: { readOnly: true, agentPeopleWritesEnabled: false },
      }),
    )

    // Query tool should succeed — caller was invoked
    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })

  // ── Test: mutation tool allowed when policy.readOnly is false ──────────────

  it('allows a mutation tool when policy.readOnly is false (interactive path)', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ success: true })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee:write'],
        policy: { readOnly: false, agentPeopleWritesEnabled: true },
      }),
    )

    // Interactive path allows mutations
    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })

  // ── Test: mutation tool allowed when policy is INTERACTIVE_POLICY (readOnly: false) ──────────

  it('allows a mutation tool under INTERACTIVE_POLICY (readOnly: false)', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ success: true })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee:write'],
        // makeInput defaults to INTERACTIVE_POLICY_PEOPLE_ENABLED (readOnly: false, agentPeopleWritesEnabled: true)
      }),
    )

    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })
})

// ─── Plan 08 R-08.36: domain allowlist — people.* write scope gate ─────────────

describe('R-08.36 — people.* domain allowlist', () => {
  // ── people.* mutation refused when agentPeopleWritesEnabled = false ──────────

  it('refuses people.* mutation with policy_violation when agentPeopleWritesEnabled = false', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade, recordEvent } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ success: true })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee:write'],
        policy: { readOnly: false, agentPeopleWritesEnabled: false },
      }),
    )

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('policy_violation')
      expect(result.disposition).toBe('abort')
      expect(result.context['toolName']).toBe('people.updateEmployee')
      expect(result.context['reason']).toBe('people_writes_disabled')
    }
    // The caller must NOT have been invoked
    expect(callFn).not.toHaveBeenCalled()
    // A kernel audit event must have been emitted for the violation
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          resultStatus: 'policy_violation',
          extraAttrs: expect.objectContaining({ policy: 'people_writes_disabled' }),
        }),
      }),
    )
  })

  // ── people.* mutation allowed when agentPeopleWritesEnabled = true ────────────

  it('allows people.* mutation when agentPeopleWritesEnabled = true', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'people.updateEmployee',
      procedure: 'mutation',
      permission: 'people:employee:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ success: true })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.updateEmployee',
        subAgentScope: ['people:employee:write'],
        policy: { readOnly: false, agentPeopleWritesEnabled: true },
      }),
    )

    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })

  // ── planner.* mutation always allowed (day-1 domain) ─────────────────────────

  it('always allows planner.* mutations regardless of agentPeopleWritesEnabled', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'planner.createTask',
      procedure: 'mutation',
      permission: 'planner:task:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ taskId: 'task-1' })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'planner.createTask',
        subAgentScope: ['planner:task:write'],
        policy: { readOnly: false, agentPeopleWritesEnabled: false },
      }),
    )

    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })

  // ── projects.* mutation always allowed (day-1 domain) ────────────────────────

  it('always allows projects.* mutations regardless of agentPeopleWritesEnabled', async () => {
    const mutationDescriptor = makeDescriptor({
      name: 'projects.updateAssignment',
      procedure: 'mutation',
      permission: 'projects:assignment:write',
      meta: MUTATION_META,
    })
    const registry = makeRegistry(mutationDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller({ assignmentId: 'a-1' })
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'projects.updateAssignment',
        subAgentScope: ['projects:assignment:write'],
        policy: { readOnly: false, agentPeopleWritesEnabled: false },
      }),
    )

    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })

  // ── people.* query always allowed (read-only, not a write) ───────────────────

  it('allows people.* query tools regardless of agentPeopleWritesEnabled', async () => {
    const queryDescriptor = makeDescriptor({
      name: 'people.listEmployees',
      procedure: 'query',
      permission: 'people:employee:read',
      meta: BASE_META,
    })
    const registry = makeRegistry(queryDescriptor)
    const { facade } = makeAuditFacade()
    const { caller, callFn } = makeCaller([{ id: 'emp-1' }])
    const gw = makeGateway(registry, caller, facade)

    const result = await gw.invoke(
      makeInput({
        toolName: 'people.listEmployees',
        subAgentScope: ['people:employee:read'],
        policy: { readOnly: false, agentPeopleWritesEnabled: false },
      }),
    )

    expect(result.kind).toBe('ok')
    expect(callFn).toHaveBeenCalledOnce()
  })

  // ── D-5: idempotency dedup ────────────────────────────────────────────────────

  describe('D-5 idempotency dedup', () => {
    it('returns cached result without calling the tool when findByKey returns a non-expired row', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.createTask',
        procedure: 'mutation',
        permission: 'planner:task:write',
        meta: MUTATION_META,
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ taskId: 't-1' })

      const cachedResult = { taskId: 'cached-t-1' }
      const hitRow: AgentWriteDedupRow = {
        idempotencyKey: 'some-key',
        tenantId: 'tenant-1',
        turnId: 'turn-abc',
        toolName: 'planner.createTask',
        resultJson: cachedResult,
        createdAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 3_600_000),
      }
      const { writeDedupRepo, findByKeyFn, insertFn } = makeWriteDedupRepo(hitRow)
      const gw = makeGateway(
        registry,
        caller,
        facade,
        undefined,
        undefined,
        undefined,
        writeDedupRepo,
      )

      const result = await gw.invoke(
        makeInput({
          toolName: 'planner.createTask',
          subAgentScope: ['planner:task'],
          turnId: 'turn-abc',
          toolCallId: 'call-xyz',
        }),
      )

      expect(result.kind).toBe('ok')
      if (result.kind === 'ok') {
        expect(result.result).toEqual(cachedResult)
      }
      // Tool caller must NOT be invoked — result came from dedup cache
      expect(callFn).not.toHaveBeenCalled()
      expect(findByKeyFn).toHaveBeenCalledOnce()
      // No insert when serving from cache
      expect(insertFn).not.toHaveBeenCalled()
    })

    it('executes the tool and inserts a dedup row when findByKey returns null', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.createTask',
        procedure: 'mutation',
        permission: 'planner:task:write',
        meta: MUTATION_META,
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const toolResult = { taskId: 'new-t-1' }
      const { caller, callFn } = makeCaller(toolResult)

      const { writeDedupRepo, findByKeyFn, insertFn } = makeWriteDedupRepo(undefined)
      const gw = makeGateway(
        registry,
        caller,
        facade,
        undefined,
        undefined,
        undefined,
        writeDedupRepo,
      )

      const result = await gw.invoke(
        makeInput({
          toolName: 'planner.createTask',
          subAgentScope: ['planner:task'],
          turnId: 'turn-abc',
          toolCallId: 'call-xyz',
        }),
      )

      expect(result.kind).toBe('ok')
      // Tool caller must be invoked — no dedup hit
      expect(callFn).toHaveBeenCalledOnce()
      expect(findByKeyFn).toHaveBeenCalledOnce()
      // Dedup row must be inserted after success
      expect(insertFn).toHaveBeenCalledOnce()
      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          turnId: 'turn-abc',
          toolName: 'planner.createTask',
          resultJson: toolResult,
        }),
      )
    })

    it('skips dedup check for query tools even when turnId and toolCallId are provided', async () => {
      const descriptor = makeDescriptor({
        name: 'planner.task.getBoard',
        procedure: 'query',
        permission: 'planner:task:read',
        meta: BASE_META,
      })
      const registry = makeRegistry(descriptor)
      const { facade } = makeAuditFacade()
      const { caller, callFn } = makeCaller({ tasks: [] })

      const { writeDedupRepo, findByKeyFn, insertFn } = makeWriteDedupRepo(undefined)
      const gw = makeGateway(
        registry,
        caller,
        facade,
        undefined,
        undefined,
        undefined,
        writeDedupRepo,
      )

      const result = await gw.invoke(
        makeInput({
          toolName: 'planner.task.getBoard',
          subAgentScope: ['planner:task'],
          turnId: 'turn-abc',
          toolCallId: 'call-xyz',
        }),
      )

      expect(result.kind).toBe('ok')
      expect(callFn).toHaveBeenCalledOnce()
      // findByKey must NOT be called for query tools
      expect(findByKeyFn).not.toHaveBeenCalled()
      expect(insertFn).not.toHaveBeenCalled()
    })
  })
})
