import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzleMsStagedUserRepository } from './drizzle-ms-staged-user.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const STAGED_USER_ID = '01900000-0000-7000-8000-000000000010'

describe('DrizzleMsStagedUserRepository', () => {
  let repo: DrizzleMsStagedUserRepository
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
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    }
    repo = new DrizzleMsStagedUserRepository(mockDb)
  })

  it('findById returns null when no record exists', async () => {
    const result = await repo.findById(STAGED_USER_ID, TENANT_ID)
    expect(result).toBeNull()
  })

  it('findByMsExternalId returns null when no record exists', async () => {
    const result = await repo.findByMsExternalId('ms-ext-id', TENANT_ID)
    expect(result).toBeNull()
  })

  it('upsertPending throws when insert returns empty', async () => {
    await expect(
      repo.upsertPending(TENANT_ID, {
        msExternalId: 'ext-id',
        displayName: 'Test User',
        email: null,
        jobTitle: null,
        department: null,
        officeLocation: null,
        mobilePhone: null,
        workPhone: null,
        managerMsId: null,
        photoDocumentId: null,
      }),
    ).rejects.toThrow('Upsert failed')
  })

  it('findById returns a record when one exists', async () => {
    const fakeRow = {
      id: STAGED_USER_ID,
      tenantId: TENANT_ID,
      msExternalId: 'ext-id',
      displayName: 'Test',
      status: 'pending',
    }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeRow]) }),
      }),
    })
    const result = await repo.findById(STAGED_USER_ID, TENANT_ID)
    expect(result).toEqual(fakeRow)
  })

  it('findByMsExternalId returns a record when one exists', async () => {
    const fakeRow = {
      id: STAGED_USER_ID,
      tenantId: TENANT_ID,
      msExternalId: 'ext-id',
      displayName: 'Test',
      status: 'pending',
    }
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([fakeRow]) }),
      }),
    })
    const result = await repo.findByMsExternalId('ext-id', TENANT_ID)
    expect(result).toEqual(fakeRow)
  })

  it('upsertPending returns the created staged user', async () => {
    const fakeRow = {
      id: STAGED_USER_ID,
      tenantId: TENANT_ID,
      msExternalId: 'ext-id',
      displayName: 'Test',
      status: 'pending',
    }
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi
          .fn()
          .mockReturnValue({ returning: vi.fn().mockResolvedValue([fakeRow]) }),
      }),
    })
    const result = await repo.upsertPending(TENANT_ID, {
      msExternalId: 'ext-id',
      displayName: 'Test',
      email: null,
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      workPhone: null,
      managerMsId: null,
      photoDocumentId: null,
    })
    expect(result).toEqual(fakeRow)
  })

  it('updateStatus calls update on db', async () => {
    await repo.updateStatus(STAGED_USER_ID, TENANT_ID, 'imported')
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('listByStatus returns empty array when no records', async () => {
    // listByStatus uses select chain with limit/offset/orderBy
    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }
    mockDb.select.mockReturnValue(selectChain)
    const result = await repo.listByStatus(TENANT_ID, 'pending', 10, 0)
    expect(result).toEqual([])
  })

  it('countByStatus returns count of rows', async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    }
    mockDb.select.mockReturnValue(selectChain)
    const result = await repo.countByStatus(TENANT_ID, 'pending')
    expect(result).toBe(2)
  })
})
