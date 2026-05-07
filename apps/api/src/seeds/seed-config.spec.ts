import { describe, expect, it } from 'vitest'
import { getSeedDatabaseUrl } from './seed-config'

describe('getSeedDatabaseUrl', () => {
  it('uses the provided DATABASE_URL when present', () => {
    expect(getSeedDatabaseUrl('postgresql://example/custom')).toBe('postgresql://example/custom')
  })

  it('defaults to the local future database when DATABASE_URL is unset', () => {
    expect(getSeedDatabaseUrl(undefined)).toBe('postgresql://future:future@localhost:5432/future')
  })
})
