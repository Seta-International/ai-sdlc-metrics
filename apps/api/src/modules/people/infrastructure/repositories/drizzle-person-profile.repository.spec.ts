import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DrizzlePersonProfileRepository } from './drizzle-person-profile.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROFILE_ID_1 = '01900000-0000-7000-8000-000000000020'
const PROFILE_ID_2 = '01900000-0000-7000-8000-000000000021'

describe('DrizzlePersonProfileRepository — findManyByIds', () => {
  let repo: DrizzlePersonProfileRepository
  let mockDb: {
    select: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new DrizzlePersonProfileRepository(mockDb as any)
  })

  it('returns [] without hitting DB when ids is empty', async () => {
    const result = await repo.findManyByIds([], TENANT_ID)
    expect(result).toEqual([])
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('calls db.select and returns mapped rows', async () => {
    const fakeRow = {
      id: PROFILE_ID_1,
      tenantId: TENANT_ID,
      actorId: 'actor-1',
      givenName: 'Alice',
      familyName: 'Smith',
      fullName: 'Alice Smith',
      fullNameUnaccented: 'Alice Smith',
      preferredName: null,
      nameDisplayOrder: 'given_first',
      dateOfBirth: null,
      gender: null,
      nationality: null,
      maritalStatus: null,
      photoDocumentId: null,
      middleName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([fakeRow]),
      }),
    })

    const result = await repo.findManyByIds([PROFILE_ID_1, PROFILE_ID_2], TENANT_ID)

    expect(mockDb.select).toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(PROFILE_ID_1)
  })
})
