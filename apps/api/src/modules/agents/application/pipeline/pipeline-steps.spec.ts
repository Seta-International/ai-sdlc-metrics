import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import type { AgentToolDescriptor, AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'
import type { TurnState } from '../services/tool-gateway-contracts'
import type { TrpcCaller } from './pipeline-steps'
import {
  resolve,
  prepareTaintWrap,
  ceilingPreCheck,
  preWriteAbortCheck,
  invoke,
  applyTaintWrap,
  auditEmit,
} from './pipeline-steps'
import type { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_META: AgentToolMeta = {
  whenToUse: 'Use to read tasks',
  whenNotToUse: 'Not for mutations',
  examples: [{ input: 'List tasks', callArgs: {} }],
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

function makeTurnState(overrides?: Partial<TurnState>): TurnState {
  return {
    tainted: { value: false },
    circuitBreaker: new Map(),
    retryCount: new Map(),
    toolCeilingRemaining: new Map(),
    l1Cache: {} as TurnState['l1Cache'],
    ...overrides,
  }
}

const REQUEST_CONTEXT = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  traceId: 'trace-1',
  surface: 'web',
}

// ─── resolve ──────────────────────────────────────────────────────────────────

describe('resolve', () => {
  function makeRegistry(descriptor?: AgentToolDescriptor): ToolRegistry {
    return {
      getDescriptor: vi.fn().mockReturnValue(descriptor),
      listAgentTools: vi.fn().mockReturnValue([]),
      resolveMenuFor: vi.fn().mockReturnValue([]),
      loadFromRouter: vi.fn(),
    } as unknown as ToolRegistry
  }

  it('returns tripwire procedure_not_agent_exposed when tool not in registry', () => {
    const registry = makeRegistry(undefined)
    const result = resolve({ toolName: 'unknown.tool', subAgentScope: ['planner:task'], registry })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('procedure_not_agent_exposed')
      expect(result.disposition).toBe('abort')
      expect(result.context).toMatchObject({ toolName: 'unknown.tool' })
    }
  })

  it('returns tripwire procedure_out_of_sub_agent_scope when permission not covered by scope', () => {
    const descriptor = makeDescriptor({ permission: 'people:profile:read' })
    const registry = makeRegistry(descriptor)

    const result = resolve({
      toolName: 'people.getProfile',
      subAgentScope: ['planner:task'],
      registry,
    })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('procedure_out_of_sub_agent_scope')
      expect(result.disposition).toBe('abort')
      expect(result.context).toMatchObject({
        toolName: 'people.getProfile',
        permission: 'people:profile:read',
      })
    }
  })

  it('returns descriptor when tool exists and is in scope', () => {
    const descriptor = makeDescriptor()
    const registry = makeRegistry(descriptor)

    const result = resolve({
      toolName: 'planner.task.getBoard',
      subAgentScope: ['planner:task'],
      registry,
    })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.descriptor).toBe(descriptor)
    }
  })

  it('accepts tool whose permission exactly equals the scope prefix', () => {
    const descriptor = makeDescriptor({ permission: 'planner:task' })
    const registry = makeRegistry(descriptor)

    const result = resolve({
      toolName: 'planner.task.getBoard',
      subAgentScope: ['planner:task'],
      registry,
    })

    expect(result.kind).toBe('ok')
  })

  it('scope uses segment-boundary match: planner:tasks:list does not match planner:task', () => {
    const descriptor = makeDescriptor({ permission: 'planner:tasks:list' })
    const registry = makeRegistry(descriptor)

    const result = resolve({
      toolName: 'planner.tasks.list',
      subAgentScope: ['planner:task'],
      registry,
    })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('procedure_out_of_sub_agent_scope')
    }
  })
})

// ─── prepareTaintWrap ─────────────────────────────────────────────────────────

describe('prepareTaintWrap', () => {
  it('returns empty fieldsToWrap when tenantAuthoredFreeText is absent', () => {
    const descriptor = makeDescriptor()
    const result = prepareTaintWrap({ descriptor })
    expect(result.fieldsToWrap).toEqual([])
  })

  it('returns empty fieldsToWrap when tenantAuthoredFreeText is empty array', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, tenantAuthoredFreeText: [] },
    })
    const result = prepareTaintWrap({ descriptor })
    expect(result.fieldsToWrap).toEqual([])
  })

  it('returns the tenantAuthoredFreeText array when present', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, tenantAuthoredFreeText: ['description', 'notes'] },
    })
    const result = prepareTaintWrap({ descriptor })
    expect(result.fieldsToWrap).toEqual(['description', 'notes'])
  })
})

// ─── ceilingPreCheck ──────────────────────────────────────────────────────────

describe('ceilingPreCheck', () => {
  it('returns ok with Infinity when descriptor has no ceilings', () => {
    const descriptor = makeDescriptor()
    const turnState = makeTurnState()
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.remaining.bytes).toBe(Infinity)
      expect(result.remaining.wallclockMs).toBe(Infinity)
    }
  })

  it('returns ok when ceiling exists and budget is positive', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { bytesScanned: 1000 } },
    })
    const turnState = makeTurnState()
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('ok')
  })

  it('seeds from descriptor ceilings on first encounter (no entry in toolCeilingRemaining)', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { bytesScanned: 500, wallclockMs: 3000 } },
    })
    const turnState = makeTurnState()
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.remaining.bytes).toBe(500)
      expect(result.remaining.wallclockMs).toBe(3000)
    }
  })

  it('returns ceiling_breach_bytes with retry on first breach (no prior retry)', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
    })
    const turnState = makeTurnState({
      toolCeilingRemaining: new Map([[descriptor.name, { bytes: 0 }]]),
    })
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('ceiling_breach_bytes')
      expect(result.disposition).toBe('retry')
      expect(result.context).toMatchObject({
        toolName: descriptor.name,
        bytesRemaining: 0,
      })
    }
  })

  it('returns ceiling_breach_bytes with abort when retryCount >= 1', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
    })
    const retryKey = `${descriptor.name}:ceiling`
    const turnState = makeTurnState({
      toolCeilingRemaining: new Map([[descriptor.name, { bytes: 0 }]]),
      retryCount: new Map([[retryKey, 1]]),
    })
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('ceiling_breach_bytes')
      expect(result.disposition).toBe('abort')
    }
  })

  it('returns ceiling_breach_wallclock with retry on first breach', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { wallclockMs: 0 } },
    })
    const turnState = makeTurnState({
      toolCeilingRemaining: new Map([[descriptor.name, { wallclockMs: 0 }]]),
    })
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('ceiling_breach_wallclock')
      expect(result.disposition).toBe('retry')
      expect(result.context).toMatchObject({
        toolName: descriptor.name,
        wallclockRemaining: 0,
      })
    }
  })

  it('returns ceiling_breach_wallclock with abort when retryCount >= 1', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { wallclockMs: 0 } },
    })
    const retryKey = `${descriptor.name}:ceiling`
    const turnState = makeTurnState({
      toolCeilingRemaining: new Map([[descriptor.name, { wallclockMs: 0 }]]),
      retryCount: new Map([[retryKey, 2]]),
    })
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('ceiling_breach_wallclock')
      expect(result.disposition).toBe('abort')
    }
  })

  it('includes correct remaining values in ceiling breach context', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { bytesScanned: 100, wallclockMs: 500 } },
    })
    const turnState = makeTurnState({
      toolCeilingRemaining: new Map([[descriptor.name, { bytes: 0, wallclockMs: 200 }]]),
    })
    const result = ceilingPreCheck({ descriptor, turnState })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('ceiling_breach_bytes')
      expect(result.context).toMatchObject({ bytesRemaining: 0, wallclockRemaining: 200 })
    }
  })

  it('does NOT mutate TurnState', () => {
    const descriptor = makeDescriptor({
      meta: { ...BASE_META, ceilings: { bytesScanned: 0 } },
    })
    const turnState = makeTurnState({
      toolCeilingRemaining: new Map([[descriptor.name, { bytes: 0 }]]),
    })

    ceilingPreCheck({ descriptor, turnState })

    // retryCount must remain untouched — orchestrator owns mutation
    expect(turnState.retryCount.size).toBe(0)
    // toolCeilingRemaining must remain at 0 — orchestrator decrements after success
    expect(turnState.toolCeilingRemaining.get(descriptor.name)?.bytes).toBe(0)
  })
})

// ─── preWriteAbortCheck ───────────────────────────────────────────────────────

describe('preWriteAbortCheck', () => {
  it('returns ok for query procedure regardless of signal state (aborted)', () => {
    const descriptor = makeDescriptor({ procedure: 'query' })
    const abortSignal = AbortSignal.abort('cancelled')
    const result = preWriteAbortCheck({ descriptor, abortSignal })
    expect(result.kind).toBe('ok')
  })

  it('returns ok for query procedure when signal is not aborted', () => {
    const descriptor = makeDescriptor({ procedure: 'query' })
    const abortSignal = new AbortController().signal
    const result = preWriteAbortCheck({ descriptor, abortSignal })
    expect(result.kind).toBe('ok')
  })

  it('returns ok for mutation when signal is not aborted', () => {
    const descriptor = makeDescriptor({ procedure: 'mutation' })
    const abortSignal = new AbortController().signal
    const result = preWriteAbortCheck({ descriptor, abortSignal })
    expect(result.kind).toBe('ok')
  })

  it('returns abort_pre_write tripwire for mutation when signal is aborted', () => {
    const descriptor = makeDescriptor({ procedure: 'mutation' })
    const abortSignal = AbortSignal.abort('user cancelled')
    const result = preWriteAbortCheck({ descriptor, abortSignal })

    expect(result.kind).toBe('tripwire')
    if (result.kind === 'tripwire') {
      expect(result.variant).toBe('abort_pre_write')
      expect(result.disposition).toBe('abort')
      expect(result.context).toMatchObject({
        toolName: descriptor.name,
        reason: 'user cancelled',
      })
    }
  })
})

// ─── invoke ───────────────────────────────────────────────────────────────────

describe('invoke', () => {
  function makeCaller(resolveValue?: unknown, rejectError?: unknown): TrpcCaller {
    const callFn =
      rejectError !== undefined
        ? vi.fn().mockRejectedValue(rejectError)
        : vi.fn().mockResolvedValue(resolveValue)
    return { call: callFn }
  }

  const INVOKE_BASE = {
    descriptor: makeDescriptor(),
    args: { planId: 'plan-1' },
    requestContext: REQUEST_CONTEXT,
    mode: 'execute' as const,
  }

  it('returns ok with result on success', async () => {
    const result = { tasks: [{ id: '1' }] }
    const caller = makeCaller(result)
    const outcome = await invoke({ ...INVOKE_BASE, caller })

    expect(outcome.kind).toBe('ok')
    if (outcome.kind === 'ok') {
      expect(outcome.result).toBe(result)
    }
  })

  it('passes correct arguments to caller.call', async () => {
    const caller = makeCaller('done')
    await invoke({ ...INVOKE_BASE, caller })

    expect(caller.call).toHaveBeenCalledWith({
      toolName: INVOKE_BASE.descriptor.name,
      args: INVOKE_BASE.args,
      requestContext: REQUEST_CONTEXT,
      mode: 'execute',
    })
  })

  it('FORBIDDEN → permission_denied, abort', async () => {
    const err = new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('permission_denied')
      expect(outcome.disposition).toBe('abort')
      expect(outcome.context).toMatchObject({ rawMessage: 'Not allowed', trpcCode: 'FORBIDDEN' })
    }
  })

  it('BAD_REQUEST with "validation" in message → validation_failed, retry', async () => {
    const err = new TRPCError({ code: 'BAD_REQUEST', message: 'Validation error: field required' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('validation_failed')
      expect(outcome.disposition).toBe('retry')
    }
  })

  it('BAD_REQUEST with ZodError cause → validation_failed, retry', async () => {
    const { z } = await import('zod')
    const schema = z.object({ name: z.string() })
    const parseResult = schema.safeParse({ name: 123 })
    const zodError = !parseResult.success ? parseResult.error : null
    expect(zodError).not.toBeNull()

    const err = new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Input parse error',
      cause: zodError,
    })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('validation_failed')
      expect(outcome.disposition).toBe('retry')
      // fieldName should be populated from ZodError
      expect(outcome.context['fieldName']).toBe('name')
    }
  })

  it('BAD_REQUEST without validation markers → infra_error, abort', async () => {
    const err = new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown bad request' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('infra_error')
      expect(outcome.disposition).toBe('abort')
    }
  })

  it('CONFLICT → business_rule_violation, abort', async () => {
    const err = new TRPCError({ code: 'CONFLICT', message: 'Resource already exists' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('business_rule_violation')
      expect(outcome.disposition).toBe('abort')
    }
  })

  it('UNPROCESSABLE_CONTENT → business_rule_violation, abort', async () => {
    const err = new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: 'Rule violated' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('business_rule_violation')
      expect(outcome.disposition).toBe('abort')
    }
  })

  it('TIMEOUT → invocation_timeout, retry', async () => {
    const err = new TRPCError({ code: 'TIMEOUT', message: 'Request timed out' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('invocation_timeout')
      expect(outcome.disposition).toBe('retry')
    }
  })

  it('CLIENT_CLOSED_REQUEST → invocation_timeout, retry', async () => {
    const err = new TRPCError({ code: 'CLIENT_CLOSED_REQUEST', message: 'Client disconnected' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('invocation_timeout')
      expect(outcome.disposition).toBe('retry')
    }
  })

  it('INTERNAL_SERVER_ERROR → infra_error, abort', async () => {
    const err = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB exploded' })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('infra_error')
      expect(outcome.disposition).toBe('abort')
    }
  })

  it('unknown non-TRPCError throw → infra_error, abort', async () => {
    const err = new Error('Something totally unexpected')
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      expect(outcome.variant).toBe('infra_error')
      expect(outcome.disposition).toBe('abort')
    }
  })

  it('rawMessage is carried in context; no sanitization applied here', async () => {
    const rawMsg = 'Raw error message with <script>xss</script> and other content'
    const err = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: rawMsg })
    const outcome = await invoke({ ...INVOKE_BASE, caller: makeCaller(undefined, err) })

    expect(outcome.kind).toBe('tripwire')
    if (outcome.kind === 'tripwire') {
      // rawMessage must be verbatim — orchestrator is responsible for sanitization
      expect(outcome.context['rawMessage']).toBe(rawMsg)
    }
  })
})

// ─── applyTaintWrap ───────────────────────────────────────────────────────────

describe('applyTaintWrap', () => {
  it('returns result unchanged when fieldsToWrap is empty', () => {
    const result = { id: '1', description: 'Do the thing' }
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result, fieldsToWrap: [], turnState })

    expect(outcome.wrappedResult).toBe(result)
    expect(outcome.fieldsWrapped).toEqual([])
    expect(outcome.taintFlipped).toBe(false)
    expect(turnState.tainted.value).toBe(false)
  })

  it('wraps a declared string field in the result; flips tainted', () => {
    const result = { id: '1', description: 'Do the thing', count: 42 }
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({
      result,
      fieldsToWrap: ['description'],
      turnState,
    })

    expect(outcome.wrappedResult).toEqual({
      id: '1',
      description: '<tenant_authored field="description">Do the thing</tenant_authored>',
      count: 42,
    })
    expect(outcome.fieldsWrapped).toEqual(['description'])
    expect(outcome.taintFlipped).toBe(true)
    expect(turnState.tainted.value).toBe(true)
  })

  it('does NOT wrap non-string fields (numbers, booleans, objects)', () => {
    const result = { id: '1', count: 42, active: true, nested: { a: 1 } }
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({
      result,
      fieldsToWrap: ['count', 'active', 'nested'],
      turnState,
    })

    expect(outcome.wrappedResult).toEqual({ id: '1', count: 42, active: true, nested: { a: 1 } })
    expect(outcome.fieldsWrapped).toEqual([])
    expect(outcome.taintFlipped).toBe(false)
  })

  it('wraps fields in each array element', () => {
    const result = [
      { id: '1', notes: 'Note one' },
      { id: '2', notes: 'Note two' },
    ]
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result, fieldsToWrap: ['notes'], turnState })

    expect(outcome.wrappedResult).toEqual([
      { id: '1', notes: '<tenant_authored field="notes">Note one</tenant_authored>' },
      { id: '2', notes: '<tenant_authored field="notes">Note two</tenant_authored>' },
    ])
    expect(outcome.fieldsWrapped).toEqual(['notes'])
    expect(outcome.taintFlipped).toBe(true)
    expect(turnState.tainted.value).toBe(true)
  })

  it('passes through null result', () => {
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result: null, fieldsToWrap: ['notes'], turnState })

    expect(outcome.wrappedResult).toBeNull()
    expect(outcome.fieldsWrapped).toEqual([])
    expect(outcome.taintFlipped).toBe(false)
  })

  it('passes through undefined result', () => {
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result: undefined, fieldsToWrap: ['notes'], turnState })

    expect(outcome.wrappedResult).toBeUndefined()
    expect(outcome.taintFlipped).toBe(false)
  })

  it('passes through primitive (string) result', () => {
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result: 'just a string', fieldsToWrap: ['notes'], turnState })

    expect(outcome.wrappedResult).toBe('just a string')
    expect(outcome.taintFlipped).toBe(false)
  })

  it('passes through primitive (number) result', () => {
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result: 42, fieldsToWrap: ['notes'], turnState })

    expect(outcome.wrappedResult).toBe(42)
    expect(outcome.taintFlipped).toBe(false)
  })

  it('does not mutate the original result object', () => {
    const result = { id: '1', description: 'Original' }
    const turnState = makeTurnState()
    applyTaintWrap({ result, fieldsToWrap: ['description'], turnState })

    // Original must not be mutated
    expect(result.description).toBe('Original')
  })

  it('does not wrap declared fields that are absent on the result', () => {
    const result = { id: '1' }
    const turnState = makeTurnState()
    const outcome = applyTaintWrap({ result, fieldsToWrap: ['description'], turnState })

    expect(outcome.wrappedResult).toEqual({ id: '1' })
    expect(outcome.fieldsWrapped).toEqual([])
    expect(outcome.taintFlipped).toBe(false)
  })
})

// ─── auditEmit ────────────────────────────────────────────────────────────────

describe('auditEmit', () => {
  function makeAuditFacade(shouldThrow?: Error): KernelAuditFacade {
    return {
      recordEvent: shouldThrow
        ? vi.fn().mockRejectedValue(shouldThrow)
        : vi.fn().mockResolvedValue(undefined),
    } as unknown as KernelAuditFacade
  }

  function makeLogger() {
    return { error: vi.fn() }
  }

  const descriptor = makeDescriptor()

  it('calls recordEvent with the correct payload shape', async () => {
    const auditFacade = makeAuditFacade()
    const logger = makeLogger()
    const result = await auditEmit({
      descriptor,
      requestContext: REQUEST_CONTEXT,
      resultStatus: 'success',
      resultHash: 'hash-abc',
      extraAttrs: { foo: 'bar' },
      auditFacade,
      logger,
    })

    expect(result.emitted).toBe(true)
    expect(result.error).toBeUndefined()
    expect(auditFacade.recordEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'user-1',
      eventType: 'agent.tool_called',
      module: 'agents',
      subjectId: descriptor.name,
      payload: {
        permission: descriptor.permission,
        resultStatus: 'success',
        resultHash: 'hash-abc',
        extraAttrs: { foo: 'bar' },
        traceId: 'trace-1',
      },
    })
  })

  it('returns { emitted: false, error } without throwing when facade throws', async () => {
    const auditError = new Error('DB write failed')
    const auditFacade = makeAuditFacade(auditError)
    const logger = makeLogger()

    const result = await auditEmit({
      descriptor,
      requestContext: REQUEST_CONTEXT,
      resultStatus: 'infra_error',
      auditFacade,
      logger,
    })

    expect(result.emitted).toBe(false)
    expect(result.error).toBe(auditError)
  })

  it('calls logger.error exactly once on facade throw, message contains toolName and traceId', async () => {
    const auditError = new Error('DB write failed')
    const auditFacade = makeAuditFacade(auditError)
    const logger = makeLogger()

    await auditEmit({
      descriptor,
      requestContext: REQUEST_CONTEXT,
      resultStatus: 'infra_error',
      auditFacade,
      logger,
    })

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message] = logger.error.mock.calls[0] as [string, ...unknown[]]
    expect(message).toContain(descriptor.name)
    expect(message).toContain(REQUEST_CONTEXT.traceId)
  })

  it('does not propagate the audit error as a thrown exception', async () => {
    const auditFacade = makeAuditFacade(new Error('Audit failure'))
    const logger = makeLogger()

    await expect(
      auditEmit({
        descriptor,
        requestContext: REQUEST_CONTEXT,
        resultStatus: 'success',
        auditFacade,
        logger,
      }),
    ).resolves.not.toThrow()
  })

  it('works with minimal inputs (no optional resultHash or extraAttrs)', async () => {
    const auditFacade = makeAuditFacade()
    const logger = makeLogger()
    const result = await auditEmit({
      descriptor,
      requestContext: REQUEST_CONTEXT,
      resultStatus: 'ceiling_hit',
      auditFacade,
      logger,
    })

    expect(result.emitted).toBe(true)
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ resultStatus: 'ceiling_hit' }),
      }),
    )
  })
})
