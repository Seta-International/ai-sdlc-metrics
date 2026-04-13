import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, migrateForTest, seedTenant, setTenantContext } from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleTenantBrandingRepository } from './drizzle-tenant-branding.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleTenantBrandingRepository
let tenantId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
  await db.execute(sql`TRUNCATE documents.tenant_branding CASCADE`)
  repo = new DrizzleTenantBrandingRepository(db)
  const t = await seedTenant(db)
  tenantId = t.id
  await setTenantContext(db, tenantId)
})

afterAll(async () => {
  await db.execute(sql`TRUNCATE documents.tenant_branding CASCADE`)
})

describe('DrizzleTenantBrandingRepository', () => {
  it('returns null when no branding exists', async () => {
    const result = await repo.findByTenant(tenantId)
    expect(result).toBeNull()
  })

  it('upserts branding and retrieves it', async () => {
    const branding = await repo.upsert({
      tenantId,
      companyName: 'SETA International',
      logoFileKey: null,
      primaryColor: '#1D4ED8',
      fontFamily: null,
      updatedAt: new Date(),
    })

    expect(branding.companyName).toBe('SETA International')

    const found = await repo.findByTenant(tenantId)
    expect(found?.primaryColor).toBe('#1D4ED8')
  })

  it('upsert updates existing row', async () => {
    await repo.upsert({
      tenantId,
      companyName: 'Updated Name',
      logoFileKey: null,
      primaryColor: '#FF0000',
      fontFamily: null,
      updatedAt: new Date(),
    })

    const found = await repo.findByTenant(tenantId)
    expect(found?.companyName).toBe('Updated Name')
    expect(found?.primaryColor).toBe('#FF0000')
  })

  it('upsert can clear optional fields by passing null', async () => {
    // First set a value
    await repo.upsert({
      tenantId,
      companyName: 'SETA',
      logoFileKey: 'tenants/abc/logo.png',
      primaryColor: '#000000',
      fontFamily: null,
      updatedAt: new Date(),
    })

    // Then clear it by passing null
    await repo.upsert({
      tenantId,
      companyName: 'SETA',
      logoFileKey: null,
      primaryColor: null,
      fontFamily: null,
      updatedAt: new Date(),
    })

    const found = await repo.findByTenant(tenantId)
    expect(found?.logoFileKey).toBeNull()
    expect(found?.primaryColor).toBeNull()
  })
})
