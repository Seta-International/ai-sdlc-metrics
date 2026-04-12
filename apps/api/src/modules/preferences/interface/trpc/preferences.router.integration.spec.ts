import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DrizzleSavedViewRepository } from '../../infrastructure/repositories/drizzle-saved-view.repository'
import type { SavedViewState } from '../../domain/entities/saved-view.entity'

const TENANT_A = '01900000-0000-7fff-8000-000000000101'
const ACTOR_A = '01900000-0000-7fff-8000-000000000201'
const ACTOR_B = '01900000-0000-7fff-8000-000000000202'

const DEFAULT_STATE: SavedViewState = {
  search: '',
  filters: [],
  sorting: [],
  pagination: { pageSize: 25 },
  columnVisibility: {},
  columnPinning: {},
  density: 'default',
}

async function truncatePreferencesSchema(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE preferences.saved_view RESTART IDENTITY CASCADE`)
}

describe('DrizzleSavedViewRepository — resolve logic', () => {
  const db = createTestDb()
  let repo: DrizzleSavedViewRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await truncatePreferencesSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'tenant-pref' })
    await seedActor(db, { id: ACTOR_A, tenantId: TENANT_A })
    await seedActor(db, { id: ACTOR_B, tenantId: TENANT_A })
    repo = new DrizzleSavedViewRepository(db as never)
  })

  afterAll(async () => {
    await truncatePreferencesSchema(db)
    await truncateCoreSchema(db)
  })

  it('resolve returns views, activeView, and defaultViewId for an actor', async () => {
    await setTenantContext(db, TENANT_A)

    const view1 = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'Default View',
      isDefault: true,
      stateJson: DEFAULT_STATE,
    })

    const view2 = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'My Filters',
      isDefault: false,
      stateJson: { ...DEFAULT_STATE, search: 'alice' },
    })

    const result = await repo.resolve(TENANT_A, ACTOR_A, 'people.employees', view2.id)

    expect(result.views).toHaveLength(2)
    expect(result.defaultViewId).toBe(view1.id)
    expect(result.activeView?.id).toBe(view2.id)

    // Clean up
    await repo.delete(view1.id, TENANT_A, ACTOR_A)
    await repo.delete(view2.id, TENANT_A, ACTOR_A)
  })

  it('does not expose foreign actor views', async () => {
    await setTenantContext(db, TENANT_A)

    const viewA = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'Actor A View',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    const viewB = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_B,
      resourceKey: 'people.employees',
      name: 'Actor B View',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    // Actor A should only see their own views
    const resultA = await repo.resolve(TENANT_A, ACTOR_A, 'people.employees', null)
    expect(resultA.views.every((v) => v.actorId === ACTOR_A)).toBe(true)

    // Clean up
    await repo.delete(viewA.id, TENANT_A, ACTOR_A)
    await repo.delete(viewB.id, TENANT_A, ACTOR_B)
  })

  it('invalid activeViewId falls back to the default view', async () => {
    await setTenantContext(db, TENANT_A)

    const defaultView = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'Default',
      isDefault: true,
      stateJson: DEFAULT_STATE,
    })

    const NONEXISTENT_ID = '01900000-0000-7fff-8000-000000000999'
    const result = await repo.resolve(TENANT_A, ACTOR_A, 'people.employees', NONEXISTENT_ID)

    expect(result.activeView?.id).toBe(defaultView.id)
    expect(result.defaultViewId).toBe(defaultView.id)

    await repo.delete(defaultView.id, TENANT_A, ACTOR_A)
  })

  it('deleted activeViewId falls back to the default view', async () => {
    await setTenantContext(db, TENANT_A)

    const defaultView = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'Default',
      isDefault: true,
      stateJson: DEFAULT_STATE,
    })

    const tempView = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'Temp',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    // Delete the temp view then try to resolve with its ID
    await repo.delete(tempView.id, TENANT_A, ACTOR_A)
    const result = await repo.resolve(TENANT_A, ACTOR_A, 'people.employees', tempView.id)

    expect(result.activeView?.id).toBe(defaultView.id)

    await repo.delete(defaultView.id, TENANT_A, ACTOR_A)
  })

  it('foreign activeViewId returns only current actor views and falls back to default', async () => {
    await setTenantContext(db, TENANT_A)

    const defaultViewA = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'people.employees',
      name: 'Actor A Default',
      isDefault: true,
      stateJson: DEFAULT_STATE,
    })

    const viewB = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_B,
      resourceKey: 'people.employees',
      name: 'Actor B View',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    // Actor A tries to use Actor B's view as activeViewId — should fall back to A's default
    const result = await repo.resolve(TENANT_A, ACTOR_A, 'people.employees', viewB.id)

    expect(result.views.every((v) => v.actorId === ACTOR_A)).toBe(true)
    expect(result.activeView?.id).toBe(defaultViewA.id)

    await repo.delete(defaultViewA.id, TENANT_A, ACTOR_A)
    await repo.delete(viewB.id, TENANT_A, ACTOR_B)
  })

  it('resolve returns null activeView when no views exist and no default', async () => {
    await setTenantContext(db, TENANT_A)

    const result = await repo.resolve(TENANT_A, ACTOR_A, 'nonexistent.resource', null)

    expect(result.views).toHaveLength(0)
    expect(result.activeView).toBeNull()
    expect(result.defaultViewId).toBeNull()
  })
})
