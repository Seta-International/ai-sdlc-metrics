import { describe, it, expect, vi, beforeEach } from 'vitest'
import type PgBoss from 'pg-boss'
import {
  CompositionMonitorWorker,
  type CompositionMonitorJobData,
  CROSS_TURN_RATE_THRESHOLD,
} from './composition-monitor.worker'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TRACE_ID = '00000000-0000-7000-8000-000000000001'
const TENANT_ID = '00000000-0000-7000-8000-000000000002'
const USER_ID = '00000000-0000-7000-8000-000000000003'
const FLOW_ID = '00000000-0000-7000-8000-000000000004'

function makeJob(
  overrides: Partial<CompositionMonitorJobData> = {},
): PgBoss.Job<CompositionMonitorJobData> {
  return {
    id: 'job-1',
    name: 'observability-composition-monitor',
    data: {
      traceId: TRACE_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      flowId: FLOW_ID,
      ...overrides,
    },
  } as PgBoss.Job<CompositionMonitorJobData>
}

function makeInvocationRow(
  overrides: Partial<{
    toolName: string
    subAgentKey: string | null
    tenantId: string
    userId: string
    traceId: string
    createdAt: Date
  }> = {},
) {
  return {
    id: 'inv-1',
    traceId: TRACE_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    toolName: 'tool.a',
    args: {},
    resultPreview: null,
    resultHash: null,
    byteCount: null,
    resultStatus: 'ok',
    subAgentKey: null,
    phase: 1,
    iteration: null,
    createdAt: new Date(),
    ...overrides,
  }
}

// ── Mock DB ───────────────────────────────────────────────────────────────────

const mockSelectFn = vi.fn()

// Chain builder: .select().from().where() → returns mockSelectFn result
function buildDbMock(results: unknown[][]) {
  let callIndex = 0
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const result = results[callIndex] ?? []
          callIndex++
          return Promise.resolve(result)
        }),
      }),
    }),
  }
}

const mockAuditFacade = {
  recordEvent: vi.fn().mockResolvedValue(undefined),
} as unknown as KernelAuditFacade

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CompositionMonitorWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFn.mockReset()
  })

  it('emits no audit event when there are no composition-sensitive tools in invocations', async () => {
    const db = buildDbMock([
      [
        makeInvocationRow({ toolName: 'planner.list_tasks' }),
        makeInvocationRow({ toolName: 'hiring.list_jobs' }),
      ],
    ])
    const worker = new CompositionMonitorWorker(
      db as never,
      mockAuditFacade,
      new Set(['tool.sensitive']), // sensitive set doesn't include the above tools
    )

    await worker.handle(makeJob())

    expect(mockAuditFacade.recordEvent).not.toHaveBeenCalled()
  })

  it('emits turn_level signal when ≥2 sensitive invocations have distinct subAgentKey', async () => {
    const db = buildDbMock([
      [
        makeInvocationRow({ toolName: 'tool.a', subAgentKey: 'agent-1' }),
        makeInvocationRow({ toolName: 'tool.b', subAgentKey: 'agent-2' }),
      ],
    ])
    const worker = new CompositionMonitorWorker(
      db as never,
      mockAuditFacade,
      new Set(['tool.a', 'tool.b']),
    )

    await worker.handle(makeJob())

    expect(mockAuditFacade.recordEvent).toHaveBeenCalledOnce()
    const call = vi.mocked(mockAuditFacade.recordEvent).mock.calls[0][0]
    expect(call.eventType).toBe('agent.composition_pattern_observed')
    expect(call.payload).toMatchObject({
      signal: 'turn_level',
      traceId: TRACE_ID,
      flowId: FLOW_ID,
      toolNames: expect.arrayContaining(['tool.a', 'tool.b']),
      aggregateDimensions: expect.arrayContaining(['agent-1', 'agent-2']),
    })
  })

  it('emits cross_turn_rate signal when total recent sensitive count ≥ threshold', async () => {
    // Turn-level: only 1 distinct subAgentKey → no turn_level match.
    // Cross-turn: returns enough rows to hit threshold — only for USER_ID.
    const OTHER_USER_ID = '00000000-0000-7000-8000-000000000099'
    const recentRows = Array.from({ length: CROSS_TURN_RATE_THRESHOLD }, (_, i) =>
      makeInvocationRow({
        toolName: 'tool.a',
        subAgentKey: 'agent-1',
        traceId: `trace-${i}`,
        userId: USER_ID,
      }),
    )
    // Rows belonging to a different user — must NOT be counted.
    const otherUserRows = Array.from({ length: CROSS_TURN_RATE_THRESHOLD }, (_, i) =>
      makeInvocationRow({
        toolName: 'tool.a',
        subAgentKey: 'agent-1',
        traceId: `other-${i}`,
        userId: OTHER_USER_ID,
      }),
    )

    // Capture WHERE arguments so we can assert userId scoping.
    const whereCalls: unknown[] = []
    let callIndex = 0
    const allResults = [
      [makeInvocationRow({ toolName: 'tool.a', subAgentKey: 'agent-1' })], // trace-level
      recentRows, // cross-turn (only USER_ID rows returned by the DB)
    ]
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((...args: unknown[]) => {
            whereCalls.push(args[0])
            const result = allResults[callIndex] ?? []
            callIndex++
            return Promise.resolve(result)
          }),
        }),
      }),
    }
    const worker = new CompositionMonitorWorker(db as never, mockAuditFacade, new Set(['tool.a']))

    await worker.handle(makeJob())

    expect(mockAuditFacade.recordEvent).toHaveBeenCalledOnce()
    const call = vi.mocked(mockAuditFacade.recordEvent).mock.calls[0][0]
    expect(call.payload).toMatchObject({ signal: 'cross_turn_rate' })

    // Verify the cross-turn WHERE clause includes userId scoping.
    // The second where call corresponds to the cross-turn window query.
    expect(whereCalls).toHaveLength(2)
    // Drizzle SQL objects have circular refs — use a visited set to avoid stack overflow.
    const findValue = (node: unknown, target: string, visited = new WeakSet()): boolean => {
      if (node === target) return true
      if (node === null || typeof node !== 'object') return false
      if (visited.has(node as object)) return false
      visited.add(node as object)
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (findValue(v, target, visited)) return true
      }
      return false
    }
    expect(findValue(whereCalls[1], USER_ID)).toBe(true)
    // OTHER_USER_ID was never in the DB result (mock returned only USER_ID rows),
    // confirming the query is scoped per (tenant_id, user_id).
    expect(otherUserRows.every((r) => r.userId === OTHER_USER_ID)).toBe(true)
  })

  it('turn_level signal takes priority — does not run cross-turn query when turn_level fires', async () => {
    // Two invocations with distinct subAgentKeys → turn_level should fire and return early.
    const db = buildDbMock([
      [
        makeInvocationRow({ toolName: 'tool.a', subAgentKey: 'agent-1' }),
        makeInvocationRow({ toolName: 'tool.b', subAgentKey: 'agent-2' }),
      ],
      // This second entry should never be called:
      [makeInvocationRow({ toolName: 'tool.a' })],
    ])
    const fromSpy = (db.select() as ReturnType<typeof db.select>).from
    const worker = new CompositionMonitorWorker(
      db as never,
      mockAuditFacade,
      new Set(['tool.a', 'tool.b']),
    )

    await worker.handle(makeJob())

    expect(mockAuditFacade.recordEvent).toHaveBeenCalledOnce()
    const call = vi.mocked(mockAuditFacade.recordEvent).mock.calls[0][0]
    expect(call.payload).toMatchObject({ signal: 'turn_level' })
    // The DB was only called once (turn query), not twice (no cross-turn query).
    expect(fromSpy).toHaveBeenCalledTimes(1)
  })

  it('swallows errors and does not re-throw', async () => {
    const throwingDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        }),
      }),
    }
    const worker = new CompositionMonitorWorker(
      throwingDb as never,
      mockAuditFacade,
      new Set(['tool.a']),
    )

    // Should not throw
    await expect(worker.handle(makeJob())).resolves.toBeUndefined()
    expect(mockAuditFacade.recordEvent).not.toHaveBeenCalled()
  })
})
