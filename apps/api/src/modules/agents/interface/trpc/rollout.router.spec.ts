/**
 * rollout.router.spec.ts — Plan 11 Task 6
 *
 * Unit tests for the rollout tRPC router. Uses createCaller without the
 * permission middleware (unit-test boundary); permission meta is decorative at
 * this layer — the canDo check lives in the global permission middleware wired
 * by TrpcModule. We test tenantId/actorId guards and correct DB write / read
 * delegation.
 */

import { describe, it, expect, vi } from 'vitest'
import { rolloutRouter, setRolloutHandlers } from './rollout.router'
import type { RolloutHandlers } from './rollout.router'
import type { AgentRolloutConfigRow } from '../../infrastructure/schema/agents.schema'

// ─── Test UUIDs ───────────────────────────────────────────────────────────────

const TENANT_ID = 'a1b2c3d4-e5f6-4a1b-8c3d-000000000001'
const ACTOR_ID = 'a1b2c3d4-e5f6-4a1b-8c3d-000000000002'
const ROLLOUT_ID = 'a1b2c3d4-e5f6-4a1b-8c3d-000000000003'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCtx(tenantId: string | null = TENANT_ID, actorId: string | null = ACTOR_ID) {
  return {
    req: { headers: {} as Record<string, string | undefined> },
    tenantId,
    actorId,
  }
}

function makeConfig(overrides?: Partial<AgentRolloutConfigRow>): AgentRolloutConfigRow {
  return {
    id: ROLLOUT_ID,
    tenantId: TENANT_ID,
    changeClass: 'router',
    candidateVersion: 'v2',
    baselineVersion: 'v1',
    stabilityKey: 'tenant_id',
    trafficPercentage: '50',
    shadowEnabled: true,
    autoRollbackEnabled: true,
    regressionThresholds: {
      error_rate_max: 0.02,
      cost_delta_pct_max: 0.2,
      initiator_approval_drop_max: 0.1,
      router_accuracy_signal_max: 0.15,
    },
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    activatedAt: new Date('2026-01-01T01:00:00Z'),
    completedOrRolledBackAt: null,
    createdBy: ACTOR_ID,
    ...overrides,
  }
}

// ─── Mock handlers ────────────────────────────────────────────────────────────

function buildMockHandlers(): RolloutHandlers {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    } as unknown as RolloutHandlers['db'],
    kernelAuditFacade: {
      recordEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as RolloutHandlers['kernelAuditFacade'],
    autoRollbackOrchestrator: {
      rollback: vi.fn().mockResolvedValue(undefined),
    } as unknown as RolloutHandlers['autoRollbackOrchestrator'],
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('rolloutRouter', () => {
  describe('exports', () => {
    it('exports rolloutRouter', () => {
      expect(rolloutRouter).toBeDefined()
    })

    it('exports setRolloutHandlers function', () => {
      expect(typeof setRolloutHandlers).toBe('function')
    })

    it('rolloutRouter has all expected procedures', () => {
      const r = rolloutRouter as unknown as {
        _def: { procedures: Record<string, unknown> }
      }
      expect(r._def.procedures).toBeDefined()
      const procs = r._def.procedures
      expect(procs['createRollout']).toBeDefined()
      expect(procs['shiftPercentage']).toBeDefined()
      expect(procs['rollback']).toBeDefined()
      expect(procs['complete']).toBeDefined()
      expect(procs['list']).toBeDefined()
      expect(procs['get']).toBeDefined()
      expect(procs['getDiffReport']).toBeDefined()
    })

    it('all procedures carry AGENT_ROLLOUT_MANAGE permission meta', () => {
      const r = rolloutRouter as unknown as {
        _def: { procedures: Record<string, { _def?: { meta?: { permission?: string } } }> }
      }
      for (const [name, proc] of Object.entries(r._def.procedures)) {
        expect(proc._def?.meta?.permission, `${name} must have permission meta`).toBe(
          'agent:rollout:manage',
        )
      }
    })
  })

  // ─── createRollout ──────────────────────────────────────────────────────────

  describe('createRollout', () => {
    const validInput = {
      changeClass: 'router' as const,
      candidateVersion: 'v2',
      baselineVersion: 'v1',
      shadowEnabled: true,
      autoRollbackEnabled: true,
      regressionThresholds: {
        error_rate_max: 0.02,
        cost_delta_pct_max: 0.2,
        initiator_approval_drop_max: 0.1,
        router_accuracy_signal_max: 0.15,
      },
    }

    it('inserts a rollout config row and emits kernel audit on success', async () => {
      const handlers = buildMockHandlers()
      const expectedRow = makeConfig({ status: 'drafting', trafficPercentage: '0' })

      // Chain: .select() → .from() → .where() → .limit() (returns [expectedRow])
      // For insert: .insert() → .values() → .returning()
      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([expectedRow]),
      }
      ;(handlers.db.insert as ReturnType<typeof vi.fn>).mockReturnValue(mockInsertChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      const result = await caller.createRollout(validInput)

      expect(handlers.db.insert).toHaveBeenCalled()
      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          createdBy: ACTOR_ID,
          changeClass: 'router',
          candidateVersion: 'v2',
          baselineVersion: 'v1',
          stabilityKey: 'tenant_id',
          status: 'drafting',
          trafficPercentage: '0',
        }),
      )
      expect(handlers.kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
          eventType: 'agent.rollout_created',
          module: 'agents',
        }),
      )
      expect(result).toEqual(expectedRow)
    })

    it('derives stabilityKey=tenant_id+user_id for sub_agent_prompt changeClass', async () => {
      const handlers = buildMockHandlers()
      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([makeConfig({ changeClass: 'sub_agent_prompt' })]),
      }
      ;(handlers.db.insert as ReturnType<typeof vi.fn>).mockReturnValue(mockInsertChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await caller.createRollout({ ...validInput, changeClass: 'sub_agent_prompt' })

      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ stabilityKey: 'tenant_id+user_id' }),
      )
    })

    it('derives stabilityKey=tenant_id for all other changeClass values', async () => {
      const handlers = buildMockHandlers()
      const mockInsertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([makeConfig()]),
      }
      ;(handlers.db.insert as ReturnType<typeof vi.fn>).mockReturnValue(mockInsertChain)
      setRolloutHandlers(handlers)

      for (const changeClass of ['router', 'planner', 'model', 'tool_meta'] as const) {
        mockInsertChain.values.mockClear()
        const caller = rolloutRouter.createCaller(makeCtx())
        await caller.createRollout({ ...validInput, changeClass })
        expect(mockInsertChain.values).toHaveBeenCalledWith(
          expect.objectContaining({ stabilityKey: 'tenant_id' }),
        )
      }
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.createRollout(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('throws UNAUTHORIZED when actorId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(TENANT_ID, null))
      await expect(caller.createRollout(validInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // ─── shiftPercentage ────────────────────────────────────────────────────────

  describe('shiftPercentage', () => {
    const shiftInput = {
      rolloutConfigId: ROLLOUT_ID,
      toPercentage: 75,
      reason: 'scaling up',
    }

    function buildShiftHandlers(configOverride?: Partial<AgentRolloutConfigRow>) {
      const handlers = buildMockHandlers()
      const config = makeConfig({ status: 'active', ...configOverride })

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([config]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      ;(handlers.db.update as ReturnType<typeof vi.fn>).mockReturnValue(mockUpdateChain)

      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }
      ;(handlers.db.insert as ReturnType<typeof vi.fn>).mockReturnValue(mockInsertChain)

      return { handlers, mockSelectChain, mockUpdateChain, mockInsertChain }
    }

    it('updates trafficPercentage and inserts percentage_shifted event for active config', async () => {
      const { handlers, mockUpdateChain, mockInsertChain } = buildShiftHandlers({
        status: 'active',
      })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await caller.shiftPercentage(shiftInput)

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ trafficPercentage: '75' }),
      )
      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          rolloutConfigId: ROLLOUT_ID,
          eventType: 'percentage_shifted',
          toPercentage: '75',
          reason: 'scaling up',
        }),
      )
      expect(handlers.kernelAuditFacade.recordEvent).toHaveBeenCalled()
    })

    it('activates drafting config and inserts both activated and percentage_shifted events', async () => {
      const { handlers, mockUpdateChain, mockInsertChain } = buildShiftHandlers({
        status: 'drafting',
      })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await caller.shiftPercentage(shiftInput)

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          trafficPercentage: '75',
        }),
      )

      // Two insert calls: 'activated' then 'percentage_shifted'
      const insertCalls = (mockInsertChain.values as ReturnType<typeof vi.fn>).mock.calls
      const eventTypes = insertCalls.map((c) => (c[0] as { eventType: string }).eventType)
      expect(eventTypes).toContain('activated')
      expect(eventTypes).toContain('percentage_shifted')
    })

    it('throws NOT_FOUND when config does not exist', async () => {
      const handlers = buildMockHandlers()
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.shiftPercentage(shiftInput)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws BAD_REQUEST when config status is rolled_back', async () => {
      const { handlers } = buildShiftHandlers({ status: 'rolled_back' })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.shiftPercentage(shiftInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('throws BAD_REQUEST when config status is completed', async () => {
      const { handlers } = buildShiftHandlers({ status: 'completed' })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.shiftPercentage(shiftInput)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.shiftPercentage(shiftInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // ─── rollback ───────────────────────────────────────────────────────────────

  describe('rollback', () => {
    const rollbackInput = {
      rolloutConfigId: ROLLOUT_ID,
      reason: 'something went wrong',
    }

    it('calls AutoRollbackOrchestrator.rollback with triggeredBy=manual', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await caller.rollback(rollbackInput)

      expect(handlers.autoRollbackOrchestrator.rollback).toHaveBeenCalledWith(
        expect.objectContaining({
          rolloutConfigId: ROLLOUT_ID,
          trippedSignals: [],
          triggeredBy: 'manual',
        }),
      )
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.rollback(rollbackInput)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // ─── complete ───────────────────────────────────────────────────────────────

  describe('complete', () => {
    const completeInput = { rolloutConfigId: ROLLOUT_ID }

    function buildCompleteHandlers(configOverride?: Partial<AgentRolloutConfigRow>) {
      const handlers = buildMockHandlers()
      const config = makeConfig({
        status: 'active',
        trafficPercentage: '100',
        ...configOverride,
      })

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([config]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)

      const mockUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      }
      ;(handlers.db.update as ReturnType<typeof vi.fn>).mockReturnValue(mockUpdateChain)

      const mockInsertChain = {
        values: vi.fn().mockResolvedValue(undefined),
      }
      ;(handlers.db.insert as ReturnType<typeof vi.fn>).mockReturnValue(mockInsertChain)

      return { handlers, mockSelectChain, mockUpdateChain, mockInsertChain }
    }

    it('updates status to completed and inserts completed event', async () => {
      const { handlers, mockUpdateChain, mockInsertChain } = buildCompleteHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await caller.complete(completeInput)

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        }),
      )
      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          rolloutConfigId: ROLLOUT_ID,
          eventType: 'completed',
          triggeredBy: `human:${ACTOR_ID}`,
        }),
      )
      expect(handlers.kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.rollout_completed',
        }),
      )
    })

    it('throws NOT_FOUND when config does not exist', async () => {
      const handlers = buildMockHandlers()
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.complete(completeInput)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws BAD_REQUEST when config is not active', async () => {
      const { handlers } = buildCompleteHandlers({ status: 'drafting' })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.complete(completeInput)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('complete on already-completed config returns BAD_REQUEST', async () => {
      const { handlers } = buildCompleteHandlers({ status: 'completed' })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.complete(completeInput)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('throws BAD_REQUEST when trafficPercentage < 100', async () => {
      const { handlers } = buildCompleteHandlers({
        status: 'active',
        trafficPercentage: '50',
      })
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.complete(completeInput)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.complete(completeInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })

  // ─── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all rollout configs for the tenant ordered by createdAt desc', async () => {
      const handlers = buildMockHandlers()
      const configs = [makeConfig(), makeConfig({ id: 'a1b2c3d4-e5f6-4a1b-8c3d-000000000099' })]

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(configs),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      const result = await caller.list()

      expect(handlers.db.select).toHaveBeenCalled()
      expect(result).toEqual(configs)
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })

  // ─── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the config row when found for the tenant', async () => {
      const handlers = buildMockHandlers()
      const config = makeConfig()

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([config]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      const result = await caller.get({ rolloutConfigId: ROLLOUT_ID })

      expect(result).toEqual(config)
    })

    it('throws NOT_FOUND when config is missing or wrong tenant', async () => {
      const handlers = buildMockHandlers()
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(caller.get({ rolloutConfigId: ROLLOUT_ID })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.get({ rolloutConfigId: ROLLOUT_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // ─── getDiffReport ──────────────────────────────────────────────────────────

  describe('getDiffReport', () => {
    const fromTs = new Date('2026-01-01T00:00:00Z')
    const toTs = new Date('2026-01-02T00:00:00Z')

    const diffInput = {
      rolloutConfigId: ROLLOUT_ID,
      fromTs,
      toTs,
    }

    it('aggregates shadow run diff categories and returns DiffReport', async () => {
      const handlers = buildMockHandlers()

      // Mock returns GROUP BY aggregated rows (one per diff category).
      // 10 identical, 3 minor, 1 major, 2 shadow_errored = 16 total.
      const groupByRows = [
        { diffCategory: 'identical', count: 10 },
        { diffCategory: 'minor_difference', count: 3 },
        { diffCategory: 'major_difference', count: 1 },
        { diffCategory: 'shadow_errored', count: 2 },
      ]

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockResolvedValue(groupByRows),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      const report = await caller.getDiffReport(diffInput)

      expect(report.rolloutConfigId).toBe(ROLLOUT_ID)
      expect(report.totalRuns).toBe(16)
      expect(report.identicalCount).toBe(10)
      expect(report.minorDifferenceCount).toBe(3)
      expect(report.majorDifferenceCount).toBe(1)
      expect(report.shadowErroredCount).toBe(2)
      expect(report.identicalPct).toBeCloseTo(10 / 16)
      expect(report.majorDifferencePct).toBeCloseTo(1 / 16)
      expect(report.fromTs).toEqual(fromTs)
      expect(report.toTs).toEqual(toTs)
    })

    it('returns zero counts when no shadow runs exist', async () => {
      const handlers = buildMockHandlers()
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockResolvedValue([]),
      }
      ;(handlers.db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockSelectChain)
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      const report = await caller.getDiffReport(diffInput)

      expect(report.totalRuns).toBe(0)
      expect(report.identicalCount).toBe(0)
      expect(report.identicalPct).toBe(0)
      expect(report.majorDifferencePct).toBe(0)
    })

    it('throws UNAUTHORIZED when tenantId is missing', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx(null))
      await expect(caller.getDiffReport(diffInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('throws BAD_REQUEST when fromTs is not before toTs', async () => {
      const handlers = buildMockHandlers()
      setRolloutHandlers(handlers)

      const caller = rolloutRouter.createCaller(makeCtx())
      await expect(
        caller.getDiffReport({
          rolloutConfigId: ROLLOUT_ID,
          fromTs: new Date('2026-01-02T00:00:00Z'),
          toTs: new Date('2026-01-01T00:00:00Z'),
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })
  })

  // ─── setRolloutHandlers ─────────────────────────────────────────────────────

  describe('setRolloutHandlers', () => {
    it('can be called with valid handlers without throwing', () => {
      const handlers = buildMockHandlers()
      expect(() => setRolloutHandlers(handlers)).not.toThrow()
    })
  })
})
