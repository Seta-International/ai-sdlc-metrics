/**
 * auto-rollback-orchestrator.spec.ts — Plan 11 Task 5
 *
 * Covers:
 *  1. Happy path (auto): updates config to traffic_percentage=0, status=rolled_back; inserts rollout event; calls kernelAuditFacade.recordEvent
 *  2. Idempotent: already rolled_back config → logs warning + returns without DB writes
 *  3. Auto rollback → event_type='auto_rolled_back', triggered_by='auto:regression_monitor'
 *  4. Manual rollback → event_type='manually_rolled_back', triggered_by='human:manual', reason='manual rollback'
 *  5. Config not found → returns without error
 *  6. Already completed config → returns without DB writes (idempotent)
 *  7. Audit payload includes trippedSignals and fromPercentage
 *  8. Auto rollback skipped when autoRollbackEnabled=false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AutoRollbackOrchestrator } from './auto-rollback-orchestrator'
import type { SignalResult } from './regression-signal-monitor'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROLLOUT_CONFIG_ID = '01900000-0000-7000-8000-000000000010'
const TENANT_ID = '01900000-0000-7000-8000-000000000020'
const CREATED_BY = '01900000-0000-7000-8000-000000000030'

const SAMPLE_TRIPPED_SIGNALS: SignalResult[] = [
  { signal: 'error_rate', observed: 0.35, threshold: 0.2 },
]

function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ROLLOUT_CONFIG_ID,
    tenantId: TENANT_ID,
    trafficPercentage: '25.00',
    status: 'active',
    autoRollbackEnabled: true,
    createdBy: CREATED_BY,
    ...overrides,
  }
}

// ─── DB Mock factory ──────────────────────────────────────────────────────────

/**
 * Builds a DB mock for AutoRollbackOrchestrator.
 *
 * Sequence of DB calls:
 *   1. select().from().where().limit() → [configRow] (or [])
 *   2. update().set().where()          → void  (update status)
 *   3. insert().values()               → void  (insert rollout event)
 */
function buildDb(configRows: Record<string, unknown>[]) {
  // Track calls in order
  const updateWhereMock = vi.fn().mockResolvedValue(undefined)
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock })
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock })

  const insertValuesMock = vi.fn().mockResolvedValue(undefined)
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock })

  const limitMock = vi.fn().mockResolvedValue(configRows)
  const selectWhereMock = vi.fn().mockReturnValue({ limit: limitMock })
  const fromMock = vi.fn().mockReturnValue({ where: selectWhereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })

  return {
    db: { select: selectMock, update: updateMock, insert: insertMock } as never,
    selectMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    insertMock,
    insertValuesMock,
  }
}

function makeAudit(): { audit: KernelAuditFacade; recordEventFn: ReturnType<typeof vi.fn> } {
  const recordEventFn = vi.fn().mockResolvedValue(undefined)
  const audit = {
    recordEvent: recordEventFn,
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as KernelAuditFacade
  return { audit, recordEventFn }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoRollbackOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Happy path (auto) ──────────────────────────────────────────────────

  it('1. happy path: updates config, inserts event, calls audit on auto rollback', async () => {
    const { db, updateSetMock, insertValuesMock } = buildDb([makeConfig()])
    const { audit, recordEventFn } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: SAMPLE_TRIPPED_SIGNALS,
      triggeredBy: 'auto',
    })

    // Update: sets traffic_percentage=0, status='rolled_back'
    expect(updateSetMock).toHaveBeenCalledOnce()
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trafficPercentage: '0',
        status: 'rolled_back',
      }),
    )

    // Insert rollout event
    expect(insertValuesMock).toHaveBeenCalledOnce()
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rolloutConfigId: ROLLOUT_CONFIG_ID,
        tenantId: TENANT_ID,
        eventType: 'auto_rolled_back',
        fromPercentage: '25.00',
        toPercentage: '0',
        triggeredBy: 'auto:regression_monitor',
      }),
    )

    // Audit
    expect(recordEventFn).toHaveBeenCalledOnce()
    expect(recordEventFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: CREATED_BY,
        eventType: 'agent.rollout_auto_rolled_back',
        module: 'agents',
        subjectId: ROLLOUT_CONFIG_ID,
      }),
    )
  })

  // ── 2. Idempotent: already rolled_back ────────────────────────────────────

  it('2. idempotent: already rolled_back → no DB writes', async () => {
    const { db, updateMock, insertMock } = buildDb([makeConfig({ status: 'rolled_back' })])
    const { audit } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: SAMPLE_TRIPPED_SIGNALS,
      triggeredBy: 'auto',
    })

    expect(updateMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(audit.recordEvent).not.toHaveBeenCalled()
  })

  // ── 3. Auto rollback event fields ─────────────────────────────────────────

  it('3. auto rollback: event_type=auto_rolled_back, triggered_by=auto:regression_monitor', async () => {
    const { db, insertValuesMock } = buildDb([makeConfig()])
    const { audit } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: SAMPLE_TRIPPED_SIGNALS,
      triggeredBy: 'auto',
    })

    const insertArg = insertValuesMock.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.eventType).toBe('auto_rolled_back')
    expect(insertArg.triggeredBy).toBe('auto:regression_monitor')
    // Reason encodes the tripped signals
    expect(String(insertArg.reason)).toContain('error_rate')
  })

  // ── 4. Manual rollback event fields ───────────────────────────────────────

  it('4. manual rollback: event_type=manually_rolled_back, triggered_by=human:manual, reason=manual rollback', async () => {
    const { db, insertValuesMock } = buildDb([makeConfig()])
    const { audit, recordEventFn } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: [],
      triggeredBy: 'manual',
    })

    const insertArg = insertValuesMock.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg.eventType).toBe('manually_rolled_back')
    expect(insertArg.triggeredBy).toBe('human:manual')
    expect(insertArg.reason).toBe('manual rollback')

    // Audit event type should be manually_rolled_back
    expect(recordEventFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.rollout_manually_rolled_back',
      }),
    )
  })

  // ── 5. Config not found ────────────────────────────────────────────────────

  it('5. config not found → returns without error and no DB writes', async () => {
    const { db, updateMock, insertMock } = buildDb([])
    const { audit } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await expect(
      orchestrator.rollback({
        rolloutConfigId: ROLLOUT_CONFIG_ID,
        trippedSignals: SAMPLE_TRIPPED_SIGNALS,
        triggeredBy: 'auto',
      }),
    ).resolves.toBeUndefined()

    expect(updateMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(audit.recordEvent).not.toHaveBeenCalled()
  })

  // ── 6. Already completed config ───────────────────────────────────────────

  it('6. already completed config → no DB writes (idempotent)', async () => {
    const { db, updateMock, insertMock } = buildDb([makeConfig({ status: 'completed' })])
    const { audit } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: [],
      triggeredBy: 'auto',
    })

    expect(updateMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(audit.recordEvent).not.toHaveBeenCalled()
  })

  // ── 7. Payload includes trippedSignals and fromPercentage ─────────────────

  it('7. audit payload includes trippedSignals and fromPercentage', async () => {
    const { db } = buildDb([makeConfig({ trafficPercentage: '50.00' })])
    const { audit, recordEventFn } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: SAMPLE_TRIPPED_SIGNALS,
      triggeredBy: 'auto',
    })

    expect(recordEventFn).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          trippedSignals: SAMPLE_TRIPPED_SIGNALS,
          fromPercentage: '50.00',
        }),
      }),
    )
  })

  // ── 8. Auto rollback skipped when autoRollbackEnabled=false ───────────────

  it('8. auto rollback skipped when autoRollbackEnabled=false', async () => {
    const { db, updateMock, insertMock } = buildDb([
      makeConfig({ autoRollbackEnabled: false, status: 'active' }),
    ])
    const { audit } = makeAudit()
    const orchestrator = new AutoRollbackOrchestrator(db, audit)

    await orchestrator.rollback({
      rolloutConfigId: ROLLOUT_CONFIG_ID,
      trippedSignals: SAMPLE_TRIPPED_SIGNALS,
      triggeredBy: 'auto',
    })

    expect(updateMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
    expect(audit.recordEvent).not.toHaveBeenCalled()
  })
})
