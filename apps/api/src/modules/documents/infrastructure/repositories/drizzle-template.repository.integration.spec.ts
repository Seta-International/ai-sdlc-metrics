import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, migrateForTest, seedTenant, setTenantContext } from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleTemplateRepository } from './drizzle-template.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleTemplateRepository
let tenantId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
  // clean slate before seeding
  await db.execute(sql`TRUNCATE documents.template CASCADE`)
  repo = new DrizzleTemplateRepository(db)
  const t = await seedTenant(db)
  tenantId = t.id
  await setTenantContext(db, tenantId)
})

afterAll(async () => {
  await db.execute(sql`TRUNCATE documents.template CASCADE`)
})

describe('DrizzleTemplateRepository', () => {
  it('inserts and retrieves a template by slug', async () => {
    const tmpl = await repo.insert({
      tenantId,
      slug: 'payslip',
      name: 'Monthly Payslip',
      format: 'pdf',
      content: '<html>{{name}}</html>',
      version: 1,
      isDefault: false,
      createdBy: null,
    })

    expect(tmpl.id).toBeTruthy()
    expect(tmpl.slug).toBe('payslip')

    const found = await repo.findBySlugAndTenant(tenantId, 'payslip')
    expect(found?.id).toBe(tmpl.id)
  })

  it('findById returns null for wrong tenant', async () => {
    const tmpl = await repo.insert({
      tenantId,
      slug: 'offer-letter',
      name: 'Offer Letter',
      format: 'pdf',
      content: '<html></html>',
      version: 1,
      isDefault: false,
      createdBy: null,
    })

    const result = await repo.findById('00000000-0000-0000-0000-000000000001', tmpl.id)
    expect(result).toBeNull()
  })

  it('listByTenant filters by format', async () => {
    await repo.insert({
      tenantId,
      slug: 'timesheet-report',
      name: 'Timesheet',
      format: 'excel',
      content: '[]',
      version: 1,
      isDefault: false,
      createdBy: null,
    })

    const pdfs = await repo.listByTenant(tenantId, { format: 'pdf' })
    expect(pdfs.length).toBeGreaterThanOrEqual(1)
    expect(pdfs.every((t) => t.format === 'pdf')).toBe(true)

    const excels = await repo.listByTenant(tenantId, { format: 'excel' })
    expect(excels.length).toBeGreaterThanOrEqual(1)
    expect(excels.every((t) => t.format === 'excel')).toBe(true)
  })
})
