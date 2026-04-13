import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  GetLocalUsersWithActorsHandler,
  type LocalUserWithActorDto,
} from './get-local-users-with-actors.handler'
import { GetLocalUsersWithActorsQuery } from './get-local-users-with-actors.query'

describe('GetLocalUsersWithActorsHandler', () => {
  let handler: GetLocalUsersWithActorsHandler
  let db: { select: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  actorId: 'actor-1',
                  email: 'test@example.com',
                  displayName: 'Test User',
                  status: 'active',
                  lastLoginAt: null,
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        }),
      }),
    }
    handler = new GetLocalUsersWithActorsHandler(db as any)
  })

  it('returns local users with actor details', async () => {
    const query = new GetLocalUsersWithActorsQuery('tenant-1')
    const result = await handler.execute(query)

    expect(result).toHaveLength(1)
    expect(result[0].actorId).toBe('actor-1')
    expect(result[0].email).toBe('test@example.com')
    expect(result[0].displayName).toBe('Test User')
  })
})
