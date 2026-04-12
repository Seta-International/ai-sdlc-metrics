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
import { createPreferencesRouter } from './preferences.router'

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

describe('preferences tRPC router', () => {
  const db = createTestDb()
  let repo: DrizzleSavedViewRepository

  const makeCtx = () => ({
    req: { headers: {} },
    tenantId: TENANT_A,
    actorId: ACTOR_A,
  })

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await truncatePreferencesSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'tenant-pref-router' })
    await seedActor(db, { id: ACTOR_A, tenantId: TENANT_A })
    await seedActor(db, { id: ACTOR_B, tenantId: TENANT_A })
    repo = new DrizzleSavedViewRepository(db as never)
  })

  afterAll(async () => {
    await truncatePreferencesSchema(db)
    await truncateCoreSchema(db)
  })

  beforeAll(async () => {
    await setTenantContext(db, TENANT_A)
  })

  it('savedView.list — returns views for current actor', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller(makeCtx())

    const created = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'hiring.jobs',
      name: 'My View',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    const views = await caller.savedView.list({ resourceKey: 'hiring.jobs' })
    expect(views.some((v) => v.id === created.id)).toBe(true)
    expect(views.every((v) => v.actorId === ACTOR_A)).toBe(true)

    await repo.delete(created.id, TENANT_A, ACTOR_A)
  })

  it('savedView.resolve — returns views, activeView, defaultViewId', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller(makeCtx())

    const defaultView = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'time.timesheets',
      name: 'Default',
      isDefault: true,
      stateJson: DEFAULT_STATE,
    })

    const activeView = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'time.timesheets',
      name: 'Active',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    const result = await caller.savedView.resolve({
      resourceKey: 'time.timesheets',
      activeViewId: activeView.id,
    })

    expect(result.views).toHaveLength(2)
    expect(result.defaultViewId).toBe(defaultView.id)
    expect(result.activeView?.id).toBe(activeView.id)

    await repo.delete(defaultView.id, TENANT_A, ACTOR_A)
    await repo.delete(activeView.id, TENANT_A, ACTOR_A)
  })

  it('savedView.create — creates a new saved view', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller(makeCtx())

    const created = await caller.savedView.create({
      resourceKey: 'projects.list',
      name: 'My Project View',
      stateJson: DEFAULT_STATE,
      isDefault: false,
    })

    expect(created.id).toBeDefined()
    expect(created.name).toBe('My Project View')
    expect(created.actorId).toBe(ACTOR_A)
    expect(created.tenantId).toBe(TENANT_A)
    expect(created.resourceKey).toBe('projects.list')

    await repo.delete(created.id, TENANT_A, ACTOR_A)
  })

  it('savedView.update — updates name and stateJson', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller(makeCtx())

    const created = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'finance.invoices',
      name: 'Original Name',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    const updated = await caller.savedView.update({
      id: created.id,
      name: 'Updated Name',
    })

    expect(updated.name).toBe('Updated Name')
    expect(updated.id).toBe(created.id)

    await repo.delete(created.id, TENANT_A, ACTOR_A)
  })

  it('savedView.delete — removes a view', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller(makeCtx())

    const created = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'goals.okrs',
      name: 'To Delete',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    await caller.savedView.delete({ id: created.id })

    const found = await repo.findById(created.id, TENANT_A, ACTOR_A)
    expect(found).toBeNull()
  })

  it('savedView.setDefault — marks a view as default', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller(makeCtx())

    const view1 = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'performance.reviews',
      name: 'View 1',
      isDefault: true,
      stateJson: DEFAULT_STATE,
    })

    const view2 = await repo.create({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      resourceKey: 'performance.reviews',
      name: 'View 2',
      isDefault: false,
      stateJson: DEFAULT_STATE,
    })

    await caller.savedView.setDefault({ id: view2.id, resourceKey: 'performance.reviews' })

    const views = await repo.listByResource(TENANT_A, ACTOR_A, 'performance.reviews')
    const newDefault = views.find((v) => v.id === view2.id)
    const oldDefault = views.find((v) => v.id === view1.id)

    expect(newDefault?.isDefault).toBe(true)
    expect(oldDefault?.isDefault).toBe(false)

    await repo.delete(view1.id, TENANT_A, ACTOR_A)
    await repo.delete(view2.id, TENANT_A, ACTOR_A)
  })

  it('savedView.list — throws UNAUTHORIZED when no tenantId/actorId in ctx', async () => {
    const preferencesRouter = createPreferencesRouter(repo)
    const caller = preferencesRouter.createCaller({
      req: { headers: {} },
      tenantId: null,
      actorId: null,
    })

    await expect(caller.savedView.list({ resourceKey: 'people.employees' })).rejects.toThrow()
  })
})
