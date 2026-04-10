import { createDb, type Db } from '../index.js'

export function createTestDb(): Db {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests')
  return createDb(url)
}

export async function seedActor(
  _db: Db,
  _overrides?: Partial<{
    id: string
    tenantId: string
    type: 'person' | 'organization' | 'system'
    displayName: string
  }>,
) {
  // TODO: implement once kernel schema is defined in apps/api
  throw new Error('seedActor: not yet implemented — add after kernel schema Task 9')
}
