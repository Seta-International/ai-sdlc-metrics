import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CostRecorder } from './cost-recorder'
import type { Pricing, UsageTokens } from '../../domain/cost/cost-types'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const PRICING: Pricing = {
  pricingId: 'price-1',
  modelId: 'gpt-4o',
  inputUsdPerMtok: 2.5,
  inputCachedReadUsdPerMtok: 1.25,
  inputCachedWriteUsdPerMtok: 2.5,
  outputUsdPerMtok: 10,
  outputReasoningUsdPerMtok: 10,
  effectiveFrom: new Date('2025-01-01T00:00:00Z'),
}

const USAGE: UsageTokens = {
  inputUncached: 1000,
  inputCachedRead: 200,
  inputCachedWrite: 100,
  output: 500,
  outputReasoning: 50,
}

const BASE_OPTS = {
  traceId: 'trace-uuid-1',
  tenantId: 'tenant-uuid-1',
  userId: 'user-uuid-1',
  layer: 'router',
  modelId: 'gpt-4o',
  usage: USAGE,
  pricing: PRICING,
  costUsd: 0.0075,
}

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeInsertChain() {
  const chain = { values: vi.fn().mockResolvedValue(undefined) }
  return chain
}

function makeUpdateChain() {
  const chain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  chain.set.mockReturnValue(chain)
  return chain
}

function makeInsertOnConflictChain() {
  const chain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  }
  chain.values.mockReturnValue(chain)
  return chain
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('CostRecorder', () => {
  let service: CostRecorder
  let mockDb: { insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let mockAudit: { recordEvent: ReturnType<typeof vi.fn> }
  let mockExtractor: { detectDroppedFields: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const insertChain = makeInsertChain()
    const updateChain = makeUpdateChain()
    const upsertChain = makeInsertOnConflictChain()

    // insert is called twice: once for cost event, once for user budget upsert
    let insertCallCount = 0
    mockDb = {
      insert: vi.fn().mockImplementation(() => {
        insertCallCount++
        if (insertCallCount === 1) return insertChain
        return upsertChain
      }),
      update: vi.fn().mockReturnValue(updateChain),
    }

    mockAudit = { recordEvent: vi.fn().mockResolvedValue(undefined) }
    mockExtractor = { detectDroppedFields: vi.fn().mockReturnValue([]) }

    service = new CostRecorder(mockDb as never, mockAudit as never, mockExtractor as never)
  })

  afterEach(() => vi.clearAllMocks())

  // ─── 1. Happy path ────────────────────────────────────────────────────────────
  it('inserts cost event, decrements tenant budget, updates user budget when userId provided', async () => {
    await service.record(BASE_OPTS)

    // insert called twice: cost event + user budget upsert
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    // update called once: tenant budget decrement
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    // no adapter-drop audit emitted (no rawProviderResponse)
    expect(mockAudit.recordEvent).not.toHaveBeenCalled()
    expect(mockExtractor.detectDroppedFields).not.toHaveBeenCalled()
  })

  // ─── 2. No userId ─────────────────────────────────────────────────────────────
  it('skips user budget update when userId is not provided', async () => {
    const { userId: _uid, ...optsNoUser } = BASE_OPTS
    await service.record(optsNoUser)

    // Only cost event insert, no user budget insert
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(mockAudit.recordEvent).not.toHaveBeenCalled()
  })

  // ─── 3. rawProviderResponse with no dropped fields ────────────────────────────
  it('runs adapter-drop detection but emits no audit when no fields are dropped', async () => {
    mockExtractor.detectDroppedFields.mockReturnValue([])
    await service.record({ ...BASE_OPTS, rawProviderResponse: { usage: {} } })

    expect(mockExtractor.detectDroppedFields).toHaveBeenCalledTimes(1)
    expect(mockAudit.recordEvent).not.toHaveBeenCalled()
  })

  // ─── 4. rawProviderResponse with dropped fields ───────────────────────────────
  it('emits adapter_dropped_cache_fields audit when dropped fields detected', async () => {
    mockExtractor.detectDroppedFields.mockReturnValue(['inputCachedRead', 'inputCachedWrite'])
    const rawProviderResponse = { usage: { prompt_tokens_details: { cached_tokens: 5 } } }

    await service.record({ ...BASE_OPTS, rawProviderResponse })

    expect(mockExtractor.detectDroppedFields).toHaveBeenCalledTimes(1)
    expect(mockAudit.recordEvent).toHaveBeenCalledTimes(1)
    expect(mockAudit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.adapter_dropped_cache_fields',
        module: 'agents',
        tenantId: BASE_OPTS.tenantId,
        payload: expect.objectContaining({
          modelId: BASE_OPTS.modelId,
          droppedFields: ['inputCachedRead', 'inputCachedWrite'],
          layer: BASE_OPTS.layer,
        }),
      }),
    )
    // DB operations still proceed
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  // ─── 5. Sequential DB calls ───────────────────────────────────────────────────
  it('executes DB operations sequentially (insert → tenant update → user upsert)', async () => {
    const callOrder: string[] = []

    const insertValues = vi.fn().mockImplementation(async () => {
      callOrder.push('insert-cost-event')
    })
    const insertOnConflict = {
      values: vi.fn(),
      onConflictDoUpdate: vi.fn().mockImplementation(async () => {
        callOrder.push('upsert-user-budget')
      }),
    }
    insertOnConflict.values.mockReturnValue(insertOnConflict)

    let insertCall = 0
    mockDb.insert.mockImplementation(() => {
      insertCall++
      if (insertCall === 1) return { values: insertValues }
      return insertOnConflict
    })

    const updateWhere = vi.fn().mockImplementation(async () => {
      callOrder.push('update-tenant-budget')
    })
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    mockDb.update.mockReturnValue({ set: updateSet })

    await service.record(BASE_OPTS)

    expect(callOrder).toEqual(['insert-cost-event', 'update-tenant-budget', 'upsert-user-budget'])
  })

  // ─── 6. Zero cost ─────────────────────────────────────────────────────────────
  it('still inserts a cost event row when costUsd is 0', async () => {
    await service.record({ ...BASE_OPTS, costUsd: 0 })

    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  // ─── 7. R-05.6: audit failure does not abort recording ────────────────────────
  it('continues to write cost event even when auditFacade.recordEvent throws', async () => {
    mockExtractor.detectDroppedFields.mockReturnValue(['inputCachedRead'])
    mockAudit.recordEvent.mockRejectedValue(new Error('audit DB unavailable'))

    await expect(
      service.record({ ...BASE_OPTS, rawProviderResponse: { usage: {} } }),
    ).resolves.toBeUndefined()

    // Cost event and budget writes still happen despite audit failure
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })
})
