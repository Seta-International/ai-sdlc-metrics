import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { IsPlannerEnabledQuery } from './is-planner-enabled.query'
import { IsPlannerEnabledHandler } from './is-planner-enabled.handler'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const OTHER_TENANT_ID = '01900000-0000-7000-8000-000000000002'

function makeDb(rows: Array<{ plannerCoreEnabled: boolean }>): Db {
  const selectFn = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  })
  return { select: selectFn } as unknown as Db
}

describe('IsPlannerEnabledHandler', () => {
  let handler: IsPlannerEnabledHandler

  describe('when tenant_settings row exists with plannerCoreEnabled = true', () => {
    beforeEach(() => {
      handler = new IsPlannerEnabledHandler(makeDb([{ plannerCoreEnabled: true }]))
    })

    it('returns true', async () => {
      const result = await handler.execute(new IsPlannerEnabledQuery(TENANT_ID))
      expect(result).toBe(true)
    })
  })

  describe('when tenant_settings row exists with plannerCoreEnabled = false', () => {
    beforeEach(() => {
      handler = new IsPlannerEnabledHandler(makeDb([{ plannerCoreEnabled: false }]))
    })

    it('returns false', async () => {
      const result = await handler.execute(new IsPlannerEnabledQuery(TENANT_ID))
      expect(result).toBe(false)
    })
  })

  describe('when no tenant_settings row exists', () => {
    beforeEach(() => {
      handler = new IsPlannerEnabledHandler(makeDb([]))
    })

    it('returns false (defaults to disabled)', async () => {
      const result = await handler.execute(new IsPlannerEnabledQuery(OTHER_TENANT_ID))
      expect(result).toBe(false)
    })
  })
})
