import { describe, expect, it, vi } from 'vitest'
import { DrizzleTaskVisibilityService } from './task-visibility'

function makeDb(firstResult: unknown[], secondResult: unknown[] = [], thirdResult: unknown[] = []) {
  const limitFn = vi
    .fn()
    .mockResolvedValueOnce(firstResult)
    .mockResolvedValueOnce(secondResult)
    .mockResolvedValueOnce(thirdResult)
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn })
  const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn })
  const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn, where: whereFn })
  const selectFn = vi.fn().mockReturnValue({ from: fromFn })
  return { select: selectFn, _where: whereFn, _limit: limitFn }
}

const ACTOR_ID = 'actor-1'
const OTHER_ACTOR_ID = 'actor-2'
const TENANT_ID = 'tenant-1'
const TASK_ID = 'task-1'

describe('DrizzleTaskVisibilityService', () => {
  describe('canActorSeeTask', () => {
    it('returns task-not-found when first query returns empty', async () => {
      const db = makeDb([])
      const svc = new DrizzleTaskVisibilityService(db as never)
      const result = await svc.canActorSeeTask(ACTOR_ID, TENANT_ID, TASK_ID)
      expect(result).toBe('task-not-found')
    })

    it('returns true on personal plan when owner === actor', async () => {
      const db = makeDb([{ ownerActorId: ACTOR_ID }])
      const svc = new DrizzleTaskVisibilityService(db as never)
      const result = await svc.canActorSeeTask(ACTOR_ID, TENANT_ID, TASK_ID)
      expect(result).toBe(true)
    })

    it('returns false on personal plan when owner !== actor', async () => {
      const db = makeDb([{ ownerActorId: OTHER_ACTOR_ID }])
      const svc = new DrizzleTaskVisibilityService(db as never)
      const result = await svc.canActorSeeTask(ACTOR_ID, TENANT_ID, TASK_ID)
      expect(result).toBe(false)
    })

    it('returns true on team plan when actor is an assignee', async () => {
      // ownerActorId = null → team plan; second query (assignees) hits
      const db = makeDb([{ ownerActorId: null }], [{ actorId: ACTOR_ID }])
      const svc = new DrizzleTaskVisibilityService(db as never)
      const result = await svc.canActorSeeTask(ACTOR_ID, TENANT_ID, TASK_ID)
      expect(result).toBe(true)
    })

    it('returns false on team plan when actor is not an assignee and not a member', async () => {
      // ownerActorId = null → team plan; assignee query misses; member query misses
      const db = makeDb([{ ownerActorId: null }], [], [])
      const svc = new DrizzleTaskVisibilityService(db as never)
      const result = await svc.canActorSeeTask(ACTOR_ID, TENANT_ID, TASK_ID)
      expect(result).toBe(false)
    })
  })
})
