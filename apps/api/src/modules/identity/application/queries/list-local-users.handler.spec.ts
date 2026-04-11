import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListLocalUsersQuery } from './list-local-users.query'
import { ListLocalUsersHandler } from './list-local-users.handler'
import type { ILocalUserQueryPort, LocalUserDto } from '../../domain/ports/local-user-query.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

const makeUser = (actorId: string, overrides?: Partial<LocalUserDto>): LocalUserDto => ({
  actorId,
  email: `user-${actorId}@example.com`,
  displayName: `User ${actorId}`,
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
  ...overrides,
})

describe('ListLocalUsersHandler', () => {
  let handler: ListLocalUsersHandler
  let localUserQuery: ILocalUserQueryPort

  beforeEach(() => {
    localUserQuery = {
      listByTenantId: vi.fn(),
    } as unknown as ILocalUserQueryPort
    handler = new ListLocalUsersHandler(localUserQuery)
  })

  it('returns local users for a tenant', async () => {
    const users = [
      makeUser('01900000-0000-7000-8000-000000000010'),
      makeUser('01900000-0000-7000-8000-000000000011'),
    ]
    vi.mocked(localUserQuery.listByTenantId).mockResolvedValue(users)

    const result = await handler.execute(new ListLocalUsersQuery(TENANT_ID))

    expect(result).toHaveLength(2)
    expect(result).toEqual(users)
    expect(localUserQuery.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })

  it('returns empty array when no local users exist', async () => {
    vi.mocked(localUserQuery.listByTenantId).mockResolvedValue([])

    const result = await handler.execute(new ListLocalUsersQuery(TENANT_ID))

    expect(result).toEqual([])
    expect(localUserQuery.listByTenantId).toHaveBeenCalledWith(TENANT_ID)
  })
})
