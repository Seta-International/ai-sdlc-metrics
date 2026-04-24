/**
 * canary-query-rotator.spec.ts — Plan 10 Task 7
 *
 * Unit tests for CanaryQueryRotator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CanaryQueryRotator } from './canary-query-rotator'
import type {
  CanaryQueryRepository,
  CanaryQueryEntity,
} from '../../domain/repositories/canary-query.repository'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQueryInput(
  overrides: Partial<Omit<CanaryQueryEntity, 'id' | 'status'>> = {},
): Omit<CanaryQueryEntity, 'id' | 'status'> {
  return {
    tier: 'full',
    utterance: 'Show me overdue tasks',
    tenantId: 'tenant-fixture',
    expectedAnswerContract: { shape: 'list' },
    rotationQuarter: '2026-Q3',
    source: 'manually_authored',
    ...overrides,
  }
}

function makeInsertedQuery(
  input: Omit<CanaryQueryEntity, 'id' | 'status'>,
  idSuffix: string,
): CanaryQueryEntity {
  return { ...input, id: `query-${idSuffix}`, status: 'active' }
}

function makeRotator(
  overrides: {
    retireByQuarter?: () => Promise<number>
    insertBatch?: (q: Omit<CanaryQueryEntity, 'id'>[]) => Promise<CanaryQueryEntity[]>
    recordEvent?: (...args: unknown[]) => Promise<void>
  } = {},
): {
  rotator: CanaryQueryRotator
  canaryQueryRepo: CanaryQueryRepository
  audit: KernelAuditFacade
  recordEventFn: ReturnType<typeof vi.fn>
} {
  const retireByQuarterFn = vi
    .fn()
    .mockImplementation(overrides.retireByQuarter ?? (() => Promise.resolve(3)))
  const insertBatchFn = vi
    .fn()
    .mockImplementation(
      overrides.insertBatch ??
        ((q: Omit<CanaryQueryEntity, 'id'>[]) =>
          Promise.resolve(
            q.map((item, i) =>
              makeInsertedQuery(item as Omit<CanaryQueryEntity, 'id' | 'status'>, String(i)),
            ),
          )),
    )

  const canaryQueryRepo: CanaryQueryRepository = {
    findActive: vi.fn().mockResolvedValue([]),
    findActiveByQuarter: vi.fn().mockResolvedValue([]),
    insertBatch: insertBatchFn,
    retireByQuarter: retireByQuarterFn,
    findNextRoundRobin: vi.fn().mockResolvedValue(null),
  }

  const recordEventFn = vi.fn().mockResolvedValue(undefined)
  const audit = {
    recordEvent: recordEventFn,
    publishOutboxEvent: vi.fn().mockResolvedValue(undefined),
    queryAuditLog: vi.fn(),
    exportAuditLog: vi.fn(),
  } as unknown as KernelAuditFacade

  const rotator = new CanaryQueryRotator(canaryQueryRepo, audit)

  return { rotator, canaryQueryRepo, audit, recordEventFn }
}

// ─── currentQuarter tests ──────────────────────────────────────────────────────

describe('CanaryQueryRotator.currentQuarter()', () => {
  it('1a. January → Q1', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-01-15'))).toBe('2026-Q1')
  })

  it('1b. March → Q1', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-03-31'))).toBe('2026-Q1')
  })

  it('1c. April → Q2', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-04-24'))).toBe('2026-Q2')
  })

  it('1d. June → Q2', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-06-30'))).toBe('2026-Q2')
  })

  it('1e. July → Q3', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-07-01'))).toBe('2026-Q3')
  })

  it('1f. September → Q3', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-09-15'))).toBe('2026-Q3')
  })

  it('1g. October → Q4', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-10-01'))).toBe('2026-Q4')
  })

  it('1h. December → Q4', () => {
    expect(CanaryQueryRotator.currentQuarter(new Date('2026-12-31'))).toBe('2026-Q4')
  })
})

// ─── rotateQuarterly tests ─────────────────────────────────────────────────────

describe('CanaryQueryRotator.rotateQuarterly()', () => {
  it('2. retires old quarter and inserts new queries', async () => {
    const { rotator, canaryQueryRepo } = makeRotator({
      retireByQuarter: () => Promise.resolve(5),
    })

    const newQueries = [
      makeQueryInput({ tier: 'full', rotationQuarter: '2026-Q3' }),
      makeQueryInput({ tier: 'nano', rotationQuarter: '2026-Q3' }),
    ]

    await rotator.rotateQuarterly({
      newQueries,
      newQuarter: '2026-Q3',
      retireQuarter: '2026-Q2',
    })

    expect(canaryQueryRepo.retireByQuarter).toHaveBeenCalledWith('2026-Q2')
    expect(canaryQueryRepo.insertBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ tier: 'full', status: 'active' }),
        expect.objectContaining({ tier: 'nano', status: 'active' }),
      ]),
    )
  })

  it('3. emits audit event agent.canary_rotated', async () => {
    const { rotator, recordEventFn } = makeRotator({
      retireByQuarter: () => Promise.resolve(3),
    })

    const newQueries = [makeQueryInput({ rotationQuarter: '2026-Q3' })]

    await rotator.rotateQuarterly({
      newQueries,
      newQuarter: '2026-Q3',
      retireQuarter: '2026-Q2',
    })

    expect(recordEventFn).toHaveBeenCalledOnce()
    expect(recordEventFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.canary_rotated',
        module: 'agents',
        subjectId: '2026-Q3',
        payload: expect.objectContaining({
          retiredQuarter: '2026-Q2',
          newQuarter: '2026-Q3',
        }),
      }),
    )
  })

  it('4. returns correct { retired, ingested, newQuarter }', async () => {
    const { rotator } = makeRotator({
      retireByQuarter: () => Promise.resolve(4),
      insertBatch: (q) =>
        Promise.resolve(
          q.map((item, i) =>
            makeInsertedQuery(item as Omit<CanaryQueryEntity, 'id' | 'status'>, String(i)),
          ),
        ),
    })

    const newQueries = [
      makeQueryInput({ tier: 'full' }),
      makeQueryInput({ tier: 'nano' }),
      makeQueryInput({ tier: 'full' }),
    ]

    const result = await rotator.rotateQuarterly({
      newQueries,
      newQuarter: '2026-Q3',
      retireQuarter: '2026-Q2',
    })

    expect(result).toEqual({
      retired: 4,
      ingested: 3,
      newQuarter: '2026-Q3',
    })
  })
})
