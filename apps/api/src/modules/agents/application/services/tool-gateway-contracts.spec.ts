import { describe, it, expect } from 'vitest'
import type { RequestContext, TurnState, ToolGatewayInvokeInput } from './tool-gateway-contracts'
import { L1Cache } from '../../infrastructure/cache/l1-cache'

describe('RequestContext type', () => {
  it('compiles with all required fields', () => {
    const ctx: RequestContext = {
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
      traceId: 'trace-uuid',
      surface: 'web',
    }

    expect(ctx.tenantId).toBe('tenant-uuid')
    expect(ctx.userId).toBe('user-uuid')
    expect(ctx.traceId).toBe('trace-uuid')
    expect(ctx.surface).toBe('web')
    expect(ctx.delegationId).toBeUndefined()
  })

  it('compiles with optional delegationId', () => {
    const ctx: RequestContext = {
      tenantId: 'tenant-uuid',
      userId: 'user-uuid',
      traceId: 'trace-uuid',
      surface: 'web',
      delegationId: 'delegation-uuid',
    }

    expect(ctx.delegationId).toBe('delegation-uuid')
  })
})

describe('TurnState type', () => {
  it('compiles against a fully-populated sample', () => {
    const state: TurnState = {
      tainted: { value: false },
      circuitBreaker: new Map([
        ['people.listEmployees', { permissionDenied: true, brokenAt: Date.now() }],
        ['time.listLeave', { ceilingBreached: true, brokenAt: Date.now() }],
      ]),
      retryCount: new Map([['people.listEmployees', 1]]),
      toolCeilingRemaining: new Map([
        ['people.listEmployees', { bytes: 500_000, wallclockMs: 3000 }],
      ]),
      l1Cache: new L1Cache(),
    }

    expect(state.tainted.value).toBe(false)
    expect(state.circuitBreaker.size).toBe(2)
    expect(state.retryCount.get('people.listEmployees')).toBe(1)
    expect(state.toolCeilingRemaining.get('people.listEmployees')).toEqual({
      bytes: 500_000,
      wallclockMs: 3000,
    })
  })

  it('tainted wrapper value is mutable', () => {
    const state: TurnState = {
      tainted: { value: false },
      circuitBreaker: new Map(),
      retryCount: new Map(),
      toolCeilingRemaining: new Map(),
      l1Cache: new L1Cache(),
    }

    state.tainted.value = true
    expect(state.tainted.value).toBe(true)
  })

  it('circuitBreaker entry can represent both permissionDenied and ceilingBreached', () => {
    const state: TurnState = {
      tainted: { value: false },
      circuitBreaker: new Map([
        ['tool-a', { permissionDenied: true, brokenAt: 1000 }],
        ['tool-b', { ceilingBreached: true, brokenAt: 2000 }],
      ]),
      retryCount: new Map(),
      toolCeilingRemaining: new Map(),
      l1Cache: new L1Cache(),
    }

    expect(state.circuitBreaker.get('tool-a')?.permissionDenied).toBe(true)
    expect(state.circuitBreaker.get('tool-b')?.ceilingBreached).toBe(true)
  })
})

describe('ToolGatewayInvokeInput type', () => {
  it('compiles with mode: execute', () => {
    const abortController = new AbortController()

    const input: ToolGatewayInvokeInput = {
      toolName: 'people.listEmployees',
      args: { departmentId: 'dept-uuid' },
      subAgentKey: 'people-reader',
      subAgentScope: ['planner:task'],
      requestContext: {
        tenantId: 'tenant-uuid',
        userId: 'user-uuid',
        traceId: 'trace-uuid',
        surface: 'web',
      },
      abortSignal: abortController.signal,
      turnState: {
        tainted: { value: false },
        circuitBreaker: new Map(),
        retryCount: new Map(),
        toolCeilingRemaining: new Map(),
        l1Cache: new L1Cache(),
      },
      mode: 'execute',
    }

    expect(input.toolName).toBe('people.listEmployees')
    expect(input.mode).toBe('execute')
    expect(input.abortSignal.aborted).toBe(false)
  })

  it('compiles with mode: dry-run', () => {
    const abortController = new AbortController()

    const input: ToolGatewayInvokeInput = {
      toolName: 'time.submitLeave',
      args: { leaveType: 'annual', startDate: '2026-05-01', endDate: '2026-05-03' },
      subAgentKey: 'leave-writer',
      subAgentScope: ['planner:task'],
      requestContext: {
        tenantId: 'tenant-uuid',
        userId: 'user-uuid',
        traceId: 'trace-uuid',
        surface: 'web',
        delegationId: 'delegation-uuid',
      },
      abortSignal: abortController.signal,
      turnState: {
        tainted: { value: false },
        circuitBreaker: new Map(),
        retryCount: new Map(),
        toolCeilingRemaining: new Map(),
        l1Cache: new L1Cache(),
      },
      mode: 'dry-run',
    }

    expect(input.mode).toBe('dry-run')
    expect(input.requestContext.delegationId).toBe('delegation-uuid')
  })
})
