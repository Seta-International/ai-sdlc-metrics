/**
 * ScheduledTurnService tests — Plan 09 R-09.6a
 *
 * Tests are ordered TDD-style: tests were written first, then the implementation.
 *
 * Coverage:
 *   1. executeScheduledTurn() invokes ToolGateway with READ_ONLY_POLICY.
 *   2. When gateway returns success, outcome is 'completed'.
 *   3. When gateway returns policy_violation tripwire, outcome is 'refused' and
 *      kernel audit event is emitted.
 *   4. When gateway returns a non-policy tripwire, outcome is 'error'.
 *   5. When permittedTools is empty, returns 'completed' without calling gateway.
 *   6. Taint seeding: tainted=true when taintSeeded=true, false otherwise.
 *   7. READ_ONLY_POLICY is forwarded in the invoke input.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScheduledTurnService } from './scheduled-turn-service'
import type { ToolGateway } from './tool-gateway'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { ScheduledTurnInput } from './scheduled-turn-service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const USER_ID = '00000000-0000-7000-8000-000000000002'
const DELEGATION_ID = '00000000-0000-7000-8000-000000000003'
const SCHEDULE_ID = '00000000-0000-7000-8000-000000000004'
const FLOW_ID = '00000000-0000-7000-8000-000000000005'
const TRACE_ID = '00000000-0000-7000-8000-000000000006'

function makeInput(overrides: Partial<ScheduledTurnInput> = {}): ScheduledTurnInput {
  return {
    tenantId: TENANT_ID,
    userOnBehalfOf: USER_ID,
    actorPrincipal: 'user',
    delegationId: DELEGATION_ID,
    scheduleId: SCHEDULE_ID,
    flowId: FLOW_ID,
    traceId: TRACE_ID,
    taintSeeded: false,
    prompt: 'Summarize my tasks',
    permittedTools: ['planner.listTasks'],
    modelId: 'gpt-5.4',
    ...overrides,
  }
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeToolGateway(
  invokeResult: Awaited<ReturnType<ToolGateway['invoke']>>,
): Pick<ToolGateway, 'invoke'> {
  return {
    invoke: vi.fn().mockResolvedValue(invokeResult),
  }
}

function makeKernelAuditFacade(): KernelAuditFacade {
  return {
    recordEvent: vi.fn().mockResolvedValue(undefined),
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
    queryAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
  } as unknown as KernelAuditFacade
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScheduledTurnService.executeScheduledTurn()', () => {
  let toolGateway: Pick<ToolGateway, 'invoke'>
  let auditFacade: KernelAuditFacade
  let service: ScheduledTurnService

  beforeEach(() => {
    vi.clearAllMocks()
    toolGateway = makeToolGateway({ kind: 'ok', result: { tasks: [] }, fromCache: false })
    auditFacade = makeKernelAuditFacade()
    service = new ScheduledTurnService(toolGateway as ToolGateway, auditFacade)
  })

  // ── Test 1: gateway is called ──────────────────────────────────────────────

  it('invokes ToolGateway with the permitted tool and read-only policy', async () => {
    await service.executeScheduledTurn(makeInput())

    expect(toolGateway.invoke).toHaveBeenCalledOnce()
    const invokeCalls = (toolGateway.invoke as ReturnType<typeof vi.fn>).mock.calls
    const input = invokeCalls[0][0] as Parameters<ToolGateway['invoke']>[0]
    expect(input.toolName).toBe('planner.listTasks')
    expect(input.policy).toMatchObject({ readOnly: true })
    expect(input.requestContext.tenantId).toBe(TENANT_ID)
    expect(input.requestContext.delegationId).toBe(DELEGATION_ID)
    expect(input.requestContext.surface).toBe('scheduler')
  })

  // ── Test 2: success path → 'completed' ────────────────────────────────────

  it('returns outcome=completed when gateway returns ok', async () => {
    const result = await service.executeScheduledTurn(makeInput())

    expect(result.outcome).toBe('completed')
    expect(result.costSpentUsd).toBe(0)
  })

  // ── Test 3: policy_violation → 'refused' + audit event ────────────────────

  it('returns outcome=refused and emits audit when gateway returns policy_violation', async () => {
    toolGateway = makeToolGateway({
      kind: 'tripwire',
      variant: 'policy_violation',
      disposition: 'abort',
      context: { toolName: 'planner.createTask', reason: 'read_only_policy' },
    })
    service = new ScheduledTurnService(toolGateway as ToolGateway, auditFacade)

    const result = await service.executeScheduledTurn(
      makeInput({ permittedTools: ['planner.createTask'] }),
    )

    expect(result.outcome).toBe('refused')
    expect(result.refusedToolName).toBe('planner.createTask')
    expect(result.costSpentUsd).toBe(0)

    // Kernel audit must be emitted
    expect(auditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        eventType: 'agent.schedule_run_policy_violation',
        payload: expect.objectContaining({
          scheduleId: SCHEDULE_ID,
          refusedTool: 'planner.createTask',
          reason: 'read_only_policy_violation',
        }),
      }),
    )
  })

  // ── Test 4: other tripwire → 'error' ──────────────────────────────────────

  it('returns outcome=error when gateway returns a non-policy-violation tripwire', async () => {
    toolGateway = makeToolGateway({
      kind: 'tripwire',
      variant: 'infra_error',
      disposition: 'abort',
      context: { toolName: 'planner.listTasks' },
    })
    service = new ScheduledTurnService(toolGateway as ToolGateway, auditFacade)

    const result = await service.executeScheduledTurn(makeInput())

    expect(result.outcome).toBe('error')
    expect(result.errorMessage).toContain('infra_error')
    expect(result.costSpentUsd).toBe(0)
  })

  // ── Test 5: empty permittedTools → 'completed' without calling gateway ─────

  it('returns outcome=completed without invoking gateway when permittedTools is empty', async () => {
    const result = await service.executeScheduledTurn(makeInput({ permittedTools: [] }))

    expect(result.outcome).toBe('completed')
    expect(toolGateway.invoke).not.toHaveBeenCalled()
  })

  // ── Test 6: taint seeding ─────────────────────────────────────────────────

  it('seeds taint=true in TurnState when taintSeeded=true', async () => {
    await service.executeScheduledTurn(makeInput({ taintSeeded: true }))

    const invokeCalls = (toolGateway.invoke as ReturnType<typeof vi.fn>).mock.calls
    const input = invokeCalls[0][0] as Parameters<ToolGateway['invoke']>[0]
    expect(input.turnState.tainted.value).toBe(true)
  })

  it('seeds taint=false in TurnState when taintSeeded=false', async () => {
    await service.executeScheduledTurn(makeInput({ taintSeeded: false }))

    const invokeCalls = (toolGateway.invoke as ReturnType<typeof vi.fn>).mock.calls
    const input = invokeCalls[0][0] as Parameters<ToolGateway['invoke']>[0]
    expect(input.turnState.tainted.value).toBe(false)
  })

  // ── Test 7: READ_ONLY_POLICY is the exact policy object ───────────────────

  it('forwards READ_ONLY_POLICY (readOnly===true) in the invoke call', async () => {
    await service.executeScheduledTurn(makeInput())

    const invokeCalls = (toolGateway.invoke as ReturnType<typeof vi.fn>).mock.calls
    const input = invokeCalls[0][0] as Parameters<ToolGateway['invoke']>[0]
    expect(input.policy?.readOnly).toBe(true)
  })

  // ── Test 8: flowId is threaded through ────────────────────────────────────

  it('threads flowId from input to gateway invoke', async () => {
    await service.executeScheduledTurn(makeInput({ flowId: FLOW_ID }))

    const invokeCalls = (toolGateway.invoke as ReturnType<typeof vi.fn>).mock.calls
    const input = invokeCalls[0][0] as Parameters<ToolGateway['invoke']>[0]
    expect(input.flowId).toBe(FLOW_ID)
  })
})
