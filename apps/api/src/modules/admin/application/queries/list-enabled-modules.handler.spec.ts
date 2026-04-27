import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@future/db'
import { ListEnabledModulesHandler } from './list-enabled-modules.handler'
import { ListEnabledModulesQuery } from './list-enabled-modules.query'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'

function buildDb(rows: ReadonlyArray<{ moduleKey: string }>): Db {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return { select } as unknown as Db
}

describe('ListEnabledModulesHandler', () => {
  it('returns a Set of enabled module keys for the tenant', async () => {
    const db = buildDb([{ moduleKey: 'planner' }, { moduleKey: 'people' }])
    const handler = new ListEnabledModulesHandler(db)

    const result = await handler.execute(new ListEnabledModulesQuery(TENANT_ID))

    expect(result).toBeInstanceOf(Set)
    expect([...result].sort()).toEqual(['people', 'planner'])
  })

  it('returns an empty set when the tenant has no enabled modules', async () => {
    const db = buildDb([])
    const handler = new ListEnabledModulesHandler(db)

    const result = await handler.execute(new ListEnabledModulesQuery(TENANT_ID))

    expect(result.size).toBe(0)
  })
})
