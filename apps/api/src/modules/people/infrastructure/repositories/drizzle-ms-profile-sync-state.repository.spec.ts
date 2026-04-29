import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleMsProfileSyncStateRepository } from './drizzle-ms-profile-sync-state.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

describe('DrizzleMsProfileSyncStateRepository', () => {
  let repo: DrizzleMsProfileSyncStateRepository
  let mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi
          .fn()
          .mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new DrizzleMsProfileSyncStateRepository(mockDb as any)
  })

  it('findByTenantId returns null when no record exists', async () => {
    const result = await repo.findByTenantId(TENANT_ID)
    expect(result).toBeNull()
  })

  it('upsert calls insert with onConflictDoUpdate', async () => {
    const deltaToken = 'some-delta-token'
    const lastSyncedAt = new Date('2026-01-01')
    await repo.upsert(TENANT_ID, deltaToken, lastSyncedAt)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('clearDeltaToken calls update with null deltaToken', async () => {
    await repo.clearDeltaToken(TENANT_ID)
    expect(mockDb.update).toHaveBeenCalled()
  })
})
