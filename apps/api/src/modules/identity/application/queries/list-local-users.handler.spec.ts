import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListLocalUsersQuery } from './list-local-users.query'
import { ListLocalUsersHandler } from './list-local-users.handler'
import type { ILocalUserQueryPort } from '../../domain/ports/local-user-query.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const fakeLocalUsers = [
  {
    actorId: '01900000-0000-7000-8000-000000000050',
    email: 'contractor@example.com',
    displayName: 'John Contractor',
    status: 'active' as const,
    lastLoginAt: null,
    createdAt: new Date('2026-04-10T10:00:00Z'),
  },
]

describe('ListLocalUsersHandler', () => {
  let handler: ListLocalUsersHandler
  let localUserQuery: ILocalUserQueryPort

  beforeEach(() => {
    localUserQuery = {
      listByTenantId: vi.fn(),
    }
    handler = new ListLocalUsersHandler(localUserQuery)
  })

  it('returns local users for the tenant', async () => {
    vi.mocked(localUserQuery.listByTenantId).mockResolvedValue(fakeLocalUsers)

    const result = await handler.execute(new ListLocalUsersQuery(TENANT_ID))

    expect(result).toEqual(fakeLocalUsers)
    expect(localUserQuery.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns empty array when no local users exist', async () => {
    vi.mocked(localUserQuery.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListLocalUsersQuery(TENANT_ID))

    expect(result).toEqual([])
  })
})
