/**
 * Tool-gateway-bridge tests — Plan 17 PR 2 Task 4.
 *
 * Verifies that buildSubAgentTools wraps each tool in toolScope as a Vercel
 * AI SDK tool whose execute() bridges ToolGateway tripwires onto AI SDK
 * semantics: hard tripwires throw HardTripwireError; soft tripwires return
 * { error, message } so the LLM can recover.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as z from 'zod'
import { L1Cache } from '../cache/l1-cache'
import { tripwire, ok, type Tripwire, type ToolGatewayResult } from '../guards/tripwire'
import { INTERACTIVE_POLICY } from '../../domain/value-objects/turn-policy'
import type {
  RequestContext,
  TurnState,
  ToolGatewayInvokeInput,
  ToolGatewayPort,
} from '../../application/services/tool-gateway-contracts'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { ToolRegistry } from '../tool-registry/tool-registry'
import {
  buildSubAgentTools,
  HardTripwireError,
  isHardTripwire,
  newAccumulator,
} from './tool-gateway-bridge'
import * as subAgentMetrics from '../observability/sub-agent-metrics'

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeTurnState(): TurnState {
  return {
    tainted: { value: false },
    taintSources: [],
    circuitBreaker: new Map(),
    retryCount: new Map(),
    toolCeilingRemaining: new Map(),
    l1Cache: new L1Cache(),
  }
}

function makeRequestContext(): RequestContext {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    traceId: 'trace-1',
    surface: 'web',
  }
}

function makeInvokeContext(
  turnState: TurnState,
): Omit<ToolGatewayInvokeInput, 'toolName' | 'args'> {
  return {
    subAgentKey: 'sub-1',
    subAgentScope: ['planner:task'],
    requestContext: makeRequestContext(),
    abortSignal: new AbortController().signal,
    turnState,
    mode: 'execute',
    policy: INTERACTIVE_POLICY,
  }
}

function makeDescriptor(name: string): AgentToolDescriptor {
  return {
    name,
    procedure: 'query',
    permission: 'planner:task:read',
    inputSchema: z.object({ x: z.string() }),
    outputSchema: undefined,
    meta: {
      whenToUse: 'use it',
      whenNotToUse: 'never',
      examples: [{ input: 'hi', callArgs: { x: '1' } }],
    },
  }
}

function makeRegistry(
  descriptors: Record<string, AgentToolDescriptor>,
): Pick<ToolRegistry, 'getDescriptor'> {
  return {
    getDescriptor: (name: string) => descriptors[name],
  }
}

function makeGateway(
  impl: (input: ToolGatewayInvokeInput) => Promise<ToolGatewayResult>,
): ToolGatewayPort {
  return { invoke: vi.fn(impl) }
}

// ─── isHardTripwire ───────────────────────────────────────────────────────────

describe('isHardTripwire', () => {
  it('classifies abort-disposition tripwires as hard', () => {
    const cases: Tripwire[] = [
      tripwire('infra_error', 'abort', {}),
      tripwire('permission_denied', 'abort', {}),
      tripwire('policy_violation', 'abort', {}),
    ]
    for (const t of cases) {
      expect(isHardTripwire(t)).toBe(true)
    }
  })

  it('classifies retry-disposition tripwires as soft', () => {
    const cases: Tripwire[] = [
      tripwire('validation_failed', 'retry', {}),
      tripwire('transient_infra_error', 'retry', {}),
      tripwire('ceiling_breach_bytes', 'retry', {}),
    ]
    for (const t of cases) {
      expect(isHardTripwire(t)).toBe(false)
    }
  })

  it('classifies ok results as not hard', () => {
    expect(isHardTripwire(ok('value', false))).toBe(false)
  })
})

// ─── buildSubAgentTools.execute() ─────────────────────────────────────────────

describe('buildSubAgentTools.execute()', () => {
  let turnState: TurnState
  let invokeContext: Omit<ToolGatewayInvokeInput, 'toolName' | 'args'>

  beforeEach(() => {
    turnState = makeTurnState()
    invokeContext = makeInvokeContext(turnState)
  })

  it('returns gateway result.result to LLM and records ToolCall provenance (happy path)', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () => ok('hello', false))
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    const t1 = tools['t1']!
    expect(t1).toBeDefined()
    const result = await (t1 as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
      { x: '1' },
      {},
    )

    expect(result).toBe('hello')
    expect(accumulator.toolResultCount).toBe(1)
    expect(accumulator.callCount).toBe(1)
    expect(accumulator.sourceToolProvenance).toHaveLength(1)
    expect(accumulator.sourceToolProvenance[0]).toMatchObject({
      toolName: 't1',
      args: { x: '1' },
      result: 'hello',
      iteration: 1,
    })
    expect(accumulator.sourceToolProvenance[0]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('flips taintFlippedDuringRun when gateway transitions tainted false→true', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async (input) => {
      input.turnState.tainted.value = true
      return ok('ok', false)
    })
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    await (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
      { x: '1' },
      {},
    )
    expect(accumulator.taintFlippedDuringRun).toBe(true)
  })

  it('does not flip taintFlippedDuringRun when turn was already tainted', async () => {
    turnState.tainted.value = true
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () => ok('ok', false))
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    await (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
      { x: '1' },
      {},
    )
    expect(accumulator.taintFlippedDuringRun).toBe(false)
  })

  it('captures a draft when gateway returns one (mutation success)', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () =>
      ok('result-payload', false, {
        draftId: 'd1',
        actionId: 'a1',
        tier: 'low_risk_auto',
        requiresApproval: false,
        summary: 'create task',
        provenance: {
          triggered_by: 'user',
          user_utterance: 'create task',
          drafted_at: new Date(),
          derived_from_tainted_sources: [],
        },
        approvalFreshness: 'revalidate',
        approvalTtlHours: 72,
        delegationId: 'del-1',
      }),
    )
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    await (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
      { x: '1' },
      {},
    )
    expect(accumulator.drafts).toHaveLength(1)
    expect(accumulator.drafts[0]).toEqual({ id: 'd1', toolName: 't1', args: { x: '1' } })
  })

  it('returns {error, message} for soft (retry) tripwire and increments toolFailureCount only', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () =>
      tripwire('validation_failed', 'retry', { message: 'bad input' }),
    )
    const failureSpy = vi
      .spyOn(subAgentMetrics, 'recordSubAgentToolFailure')
      .mockImplementation(() => {})
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    const result = await (
      tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }
    ).execute({ x: '1' }, {})
    expect(result).toEqual({ error: 'validation_failed', message: 'bad input' })
    expect(accumulator.toolFailureCount).toBe(1)
    // I-1: soft tripwires must NOT increment toolResultCount (it counts ok results only).
    expect(accumulator.toolResultCount).toBe(0)
    expect(accumulator.ceilingHit).toBe(false)
    expect(failureSpy).toHaveBeenCalledWith({
      subAgentKey: 'sub-1',
      toolName: 't1',
      tripwireKind: 'validation_failed',
      severity: 'soft',
    })
    failureSpy.mockRestore()
  })

  it('counts toolResultCount strictly for ok results across an ok→soft→ok sequence (I-1)', async () => {
    const accumulator = newAccumulator()
    let call = 0
    const gateway = makeGateway(async () => {
      call += 1
      if (call === 2) return tripwire('validation_failed', 'retry', { message: 'oops' })
      return ok(`v${call}`, false)
    })
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })
    const exec = (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute
    await exec({ x: '1' }, {})
    await exec({ x: '2' }, {})
    await exec({ x: '3' }, {})

    expect(accumulator.toolResultCount).toBe(2)
    expect(accumulator.toolFailureCount).toBe(1)
  })

  it('sets ceilingHit on ceiling_breach_bytes soft tripwire', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () =>
      tripwire('ceiling_breach_bytes', 'retry', { message: 'too big' }),
    )
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    const result = await (
      tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }
    ).execute({ x: '1' }, {})
    expect(result).toEqual({ error: 'ceiling_breach_bytes', message: 'too big' })
    expect(accumulator.ceilingHit).toBe(true)
    expect(accumulator.toolFailureCount).toBe(1)
  })

  it('throws HardTripwireError on abort-disposition tripwire', async () => {
    const accumulator = newAccumulator()
    const tw = tripwire('infra_error', 'abort', { message: 'boom' })
    const gateway = makeGateway(async () => tw)
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    await expect(
      (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
        { x: '1' },
        {},
      ),
    ).rejects.toMatchObject({
      name: 'HardTripwireError',
      tripwire: tw,
      toolName: 't1',
    })
  })

  it('skips tools that are absent from the registry', () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () => ok('x', false))
    const tools = buildSubAgentTools({
      toolScope: ['t1', 'missing'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })
    expect(tools['t1']).toBeDefined()
    expect(tools['missing']).toBeUndefined()
  })

  it('increments iteration counter monotonically across repeated calls to the same tool', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () => ok('v', false))
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })
    const exec = (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute
    await exec({ x: '1' }, {})
    await exec({ x: '2' }, {})
    expect(accumulator.sourceToolProvenance.map((c) => c.iteration)).toEqual([1, 2])
    expect(accumulator.callCount).toBe(2)
  })

  it('iteration counter is global across tools (I-3): t1, t2, t1 → 1, 2, 3', async () => {
    const accumulator = newAccumulator()
    const gateway = makeGateway(async () => ok('v', false))
    const tools = buildSubAgentTools({
      toolScope: ['t1', 't2'],
      registry: makeRegistry({ t1: makeDescriptor('t1'), t2: makeDescriptor('t2') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })
    const exec1 = (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute
    const exec2 = (tools['t2'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute
    await exec1({ x: '1' }, {})
    await exec2({ x: '2' }, {})
    await exec1({ x: '3' }, {})

    expect(
      accumulator.sourceToolProvenance.map((c) => ({
        toolName: c.toolName,
        iteration: c.iteration,
      })),
    ).toEqual([
      { toolName: 't1', iteration: 1 },
      { toolName: 't2', iteration: 2 },
      { toolName: 't1', iteration: 3 },
    ])
    expect(accumulator.callCount).toBe(3)
  })

  it('wraps thrown gateway error into HardTripwireError(infra_error) and leaves accumulator unchanged (I-2)', async () => {
    const accumulator = newAccumulator()
    const gateway: ToolGatewayPort = {
      invoke: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    let captured: unknown
    try {
      await (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
        { x: '1' },
        {},
      )
    } catch (e) {
      captured = e
    }
    expect(captured).toBeInstanceOf(HardTripwireError)
    const err = captured as HardTripwireError
    expect(err.toolName).toBe('t1')
    expect(err.tripwire.variant).toBe('infra_error')
    expect(err.tripwire.disposition).toBe('abort')
    expect(err.tripwire.context['message']).toBe('boom')
    expect(err.tripwire.context['cause']).toBe('Error')

    // Accumulator unchanged: failures aren't double-counted (the throw covers it).
    expect(accumulator.toolResultCount).toBe(0)
    expect(accumulator.toolFailureCount).toBe(0)
    expect(accumulator.sourceToolProvenance).toHaveLength(0)
    expect(accumulator.drafts).toHaveLength(0)
  })

  it('rethrows an existing HardTripwireError as-is (I-2 identity)', async () => {
    const accumulator = newAccumulator()
    const realHardTrip = tripwire('infra_error', 'abort', { message: 'existing' })
    const original = new HardTripwireError(realHardTrip, 't1')
    const gateway: ToolGatewayPort = {
      invoke: vi.fn(async () => {
        throw original
      }),
    }
    const tools = buildSubAgentTools({
      toolScope: ['t1'],
      registry: makeRegistry({ t1: makeDescriptor('t1') }),
      toolGateway: gateway,
      invokeContext,
      accumulator,
    })

    let captured: unknown
    try {
      await (tools['t1'] as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
        { x: '1' },
        {},
      )
    } catch (e) {
      captured = e
    }
    expect(captured).toBe(original)
  })
})

// ─── HardTripwireError ────────────────────────────────────────────────────────

describe('HardTripwireError', () => {
  it('exposes tripwire and toolName fields', () => {
    const tw = tripwire('infra_error', 'abort', { message: 'down' })
    const err = new HardTripwireError(tw, 'tool-x')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('HardTripwireError')
    expect(err.tripwire).toBe(tw)
    expect(err.toolName).toBe('tool-x')
  })
})
