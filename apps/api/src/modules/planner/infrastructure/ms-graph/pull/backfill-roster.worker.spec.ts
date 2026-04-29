import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BackfillRosterWorker } from './backfill-roster.worker'
import { MsLinkedRosterEntity } from '../../../domain/entities/ms-linked-roster.entity'

function makeRoster(
  overrides: Partial<ConstructorParameters<typeof MsLinkedRosterEntity>[0]> = {},
) {
  return new MsLinkedRosterEntity({
    id: 'lr-1',
    tenantId: 't1',
    msRosterId: 'r1',
    displayName: 'My Roster',
    linkedByActorId: 'actor-1',
    linkedAt: new Date('2026-01-01'),
    syncEnabled: true,
    mintedByFutureAt: null,
    unlinkedAt: null,
    ...overrides,
  })
}

describe('BackfillRosterWorker', () => {
  let worker: BackfillRosterWorker
  let graph: { getAllPages: ReturnType<typeof vi.fn> }
  let ingestor: { ingestPlan: ReturnType<typeof vi.fn> }
  let rosterRepo: {
    findByTenantAndRoster: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  let memberRepo: { replaceForRoster: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    graph = { getAllPages: vi.fn() }
    ingestor = { ingestPlan: vi.fn().mockResolvedValue(undefined) }
    rosterRepo = {
      findByTenantAndRoster: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
    }
    memberRepo = { replaceForRoster: vi.fn().mockResolvedValue(undefined) }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    worker = new BackfillRosterWorker(
      graph as any,
      ingestor as any,
      rosterRepo as any,
      memberRepo as any,
    )
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })

  it('ingests each plan, replaces members, and upserts roster', async () => {
    const plans = [{ id: 'p1' }, { id: 'p2' }]
    const members = [{ userId: 'u1' }, { userId: 'u2' }]
    graph.getAllPages.mockResolvedValueOnce(plans).mockResolvedValueOnce(members)
    rosterRepo.findByTenantAndRoster.mockResolvedValue(makeRoster())

    await worker.run({ tenantId: 't1', msRosterId: 'r1', linkedRosterId: 'lr-1' })

    expect(graph.getAllPages).toHaveBeenCalledTimes(2)
    expect(graph.getAllPages).toHaveBeenNthCalledWith(1, 't1', `/planner/rosters/r1/plans`, {
      useBeta: true,
    })
    expect(graph.getAllPages).toHaveBeenNthCalledWith(2, 't1', `/planner/rosters/r1/members`, {
      useBeta: true,
    })
    expect(ingestor.ingestPlan).toHaveBeenCalledTimes(2)
    expect(ingestor.ingestPlan).toHaveBeenNthCalledWith(1, {
      tenantId: 't1',
      msPlanId: 'p1',
      origin: 'ms-sync-backfill',
    })
    expect(memberRepo.replaceForRoster).toHaveBeenCalledWith({
      tenantId: 't1',
      msRosterId: 'r1',
      ssoSubjects: ['u1', 'u2'],
    })
    expect(rosterRepo.findByTenantAndRoster).toHaveBeenCalledWith('t1', 'r1')
    expect(rosterRepo.upsert).toHaveBeenCalledWith(expect.any(MsLinkedRosterEntity))
  })

  it('skips roster upsert when roster entity not found', async () => {
    graph.getAllPages.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    rosterRepo.findByTenantAndRoster.mockResolvedValue(null)

    await worker.run({ tenantId: 't1', msRosterId: 'r1', linkedRosterId: 'lr-1' })

    expect(rosterRepo.upsert).not.toHaveBeenCalled()
    expect(memberRepo.replaceForRoster).toHaveBeenCalledWith({
      tenantId: 't1',
      msRosterId: 'r1',
      ssoSubjects: [],
    })
  })

  it('handles roster with URI-encoded roster ID', async () => {
    const msRosterId = 'roster with spaces'
    graph.getAllPages.mockResolvedValue([])
    rosterRepo.findByTenantAndRoster.mockResolvedValue(null)

    await worker.run({ tenantId: 't1', msRosterId, linkedRosterId: 'lr-1' })

    expect(graph.getAllPages).toHaveBeenNthCalledWith(
      1,
      't1',
      `/planner/rosters/${encodeURIComponent(msRosterId)}/plans`,
      { useBeta: true },
    )
  })
})
