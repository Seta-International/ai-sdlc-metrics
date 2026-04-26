import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BackfillGroupWorker } from './backfill-group.worker'
import type { MsGraphClient } from '../ms-graph-client'
import { MsLinkedGroupEntity } from '../../../domain/entities/ms-linked-group.entity'
import {
  MS_SYNC_BACKFILL_PROGRESS_EVENT,
  MS_GROUP_BACKFILL_COMPLETED_EVENT,
} from '@future/event-contracts'

function makeGroup(
  overrides: Partial<Parameters<typeof MsLinkedGroupEntity.reconstitute>[0]> = {},
) {
  return MsLinkedGroupEntity.reconstitute({
    id: 'lg-1',
    tenantId: 't1',
    msGroupId: 'g1',
    displayName: 'Team Alpha',
    linkedByActorId: 'actor-1',
    linkedAt: new Date('2026-01-01'),
    syncEnabled: true,
    backfillingAt: new Date('2026-01-02'),
    backfillJobId: 'job-1',
    unlinkedAt: null,
    ...overrides,
  })
}

describe('BackfillGroupWorker', () => {
  let worker: BackfillGroupWorker
  let graph: jest.Mocked<Pick<MsGraphClient, 'getAllPages'>>
  let ingestor: { ingestPlan: ReturnType<typeof vi.fn> }
  let groupRepo: { findById: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    /* eslint-disable @typescript-eslint/no-explicit-any */
    graph = { getAllPages: vi.fn() } as any
    ingestor = { ingestPlan: vi.fn().mockResolvedValue(undefined) } as any
    groupRepo = {
      findById: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
    } as any
    /* eslint-enable @typescript-eslint/no-explicit-any */
    eventBus = { publish: vi.fn() }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    worker = new BackfillGroupWorker(
      graph as any,
      ingestor as any,
      groupRepo as any,
      eventBus as any,
    )
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ingests each plan, emits progress and completed events', async () => {
    const plans = [{ id: 'p1' }, { id: 'p2' }]
    vi.mocked(graph.getAllPages).mockResolvedValue(plans)
    vi.mocked(groupRepo.findById).mockResolvedValue(makeGroup())

    const runPromise = worker.run({ tenantId: 't1', msGroupId: 'g1', linkedGroupId: 'lg-1' })
    await vi.runAllTimersAsync()
    await runPromise

    expect(graph.getAllPages).toHaveBeenCalledWith('t1', '/groups/g1/planner/plans')
    expect(ingestor.ingestPlan).toHaveBeenCalledTimes(2)
    expect(ingestor.ingestPlan).toHaveBeenNthCalledWith(1, {
      tenantId: 't1',
      msPlanId: 'p1',
      origin: 'ms-sync-backfill',
    })
    expect(ingestor.ingestPlan).toHaveBeenNthCalledWith(2, {
      tenantId: 't1',
      msPlanId: 'p2',
      origin: 'ms-sync-backfill',
    })

    // initial progress + 2 per-plan + 1 completed = 4
    expect(eventBus.publish).toHaveBeenCalledTimes(4)
    const events = vi.mocked(eventBus.publish).mock.calls.map((c) => c[0])

    expect(events[0].type).toBe(MS_SYNC_BACKFILL_PROGRESS_EVENT)
    expect(events[0]).toMatchObject({ total: 2, processed: 0, msGroupId: 'g1', tenantId: 't1' })
    expect(events[1].type).toBe(MS_SYNC_BACKFILL_PROGRESS_EVENT)
    expect(events[1]).toMatchObject({ total: 2, processed: 1 })
    expect(events[2].type).toBe(MS_SYNC_BACKFILL_PROGRESS_EVENT)
    expect(events[2]).toMatchObject({ total: 2, processed: 2 })
    expect(events[3].type).toBe(MS_GROUP_BACKFILL_COMPLETED_EVENT)
    expect(events[3]).toMatchObject({ totalPlans: 2, msGroupId: 'g1', linkedGroupId: 'lg-1' })
  })

  it('calls finishBackfill on the linked group', async () => {
    vi.mocked(graph.getAllPages).mockResolvedValue([{ id: 'p1' }])
    const group = makeGroup()
    vi.mocked(groupRepo.findById).mockResolvedValue(group)

    const runPromise = worker.run({ tenantId: 't1', msGroupId: 'g1', linkedGroupId: 'lg-1' })
    await vi.runAllTimersAsync()
    await runPromise

    expect(groupRepo.findById).toHaveBeenCalledWith('lg-1')
    expect(groupRepo.upsert).toHaveBeenCalledWith(expect.any(MsLinkedGroupEntity))
    const saved = vi.mocked(groupRepo.upsert).mock.calls[0][0] as MsLinkedGroupEntity
    expect(saved.backfillingAt).toBeNull()
    expect(saved.backfillJobId).toBeNull()
  })

  it('skips group upsert when group not found', async () => {
    vi.mocked(graph.getAllPages).mockResolvedValue([])
    vi.mocked(groupRepo.findById).mockResolvedValue(null)

    const runPromise = worker.run({ tenantId: 't1', msGroupId: 'g1', linkedGroupId: 'lg-1' })
    await vi.runAllTimersAsync()
    await runPromise

    expect(groupRepo.upsert).not.toHaveBeenCalled()
    const lastEvent = vi.mocked(eventBus.publish).mock.calls.at(-1)![0]
    expect(lastEvent.type).toBe(MS_GROUP_BACKFILL_COMPLETED_EVENT)
    expect(lastEvent.totalPlans).toBe(0)
  })
})
