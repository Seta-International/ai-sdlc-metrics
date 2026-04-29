import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListStagedMsUsersHandler } from './list-staged-ms-users.handler'
import { ListStagedMsUsersQuery } from './list-staged-ms-users.query'
import type { IMsStagedUserRepository } from '../../domain/repositories/ms-staged-user.repository'
import type { MsStagedUser } from '../../domain/entities/ms-staged-user.entity'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const STAGED_USER: MsStagedUser = {
  id: 'su1',
  tenantId: TENANT_ID,
  msExternalId: 'aad-1',
  displayName: 'Alice',
  email: 'alice@co.com',
  jobTitle: 'Eng',
  department: 'R&D',
  officeLocation: 'HCM',
  mobilePhone: null,
  workPhone: null,
  managerMsId: null,
  photoDocumentId: null,
  status: 'pending',
  importedEmploymentId: null,
  lastSeenAt: new Date(),
  createdAt: new Date(),
}

describe('ListStagedMsUsersHandler', () => {
  let repo: Partial<IMsStagedUserRepository>

  beforeEach(() => {
    repo = {
      listByStatus: vi.fn().mockResolvedValue([STAGED_USER]),
      countByStatus: vi.fn().mockResolvedValue(1),
    }
  })

  it('returns list and count for pending status', async () => {
    const handler = new ListStagedMsUsersHandler(repo as IMsStagedUserRepository)
    const result = await handler.execute(new ListStagedMsUsersQuery(TENANT_ID, 'pending', 20, 0))

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(repo.listByStatus).toHaveBeenCalledWith(TENANT_ID, 'pending', 20, 0)
  })
})
