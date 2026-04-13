import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
} from '@future/db/test-helpers'
import type { Db } from '@future/db'
import { DrizzleGenerationJobRepository } from './drizzle-generation-job.repository'
import { DrizzleTemplateRepository } from './drizzle-template.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleGenerationJobRepository
let templateRepo: DrizzleTemplateRepository
let tenantId: string
let actorId: string
let templateId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
  await db.execute(sql`TRUNCATE documents.generation_job, documents.template CASCADE`)
  repo = new DrizzleGenerationJobRepository(db)
  templateRepo = new DrizzleTemplateRepository(db)
  const t = await seedTenant(db)
  tenantId = t.id
  const a = await seedActor(db, { tenantId })
  actorId = a.id
  await setTenantContext(db, tenantId)

  const tmpl = await templateRepo.insert({
    tenantId,
    slug: 'payslip',
    name: 'Payslip',
    format: 'pdf',
    content: '<html></html>',
    version: 1,
    isDefault: false,
    createdBy: null,
  })
  templateId = tmpl.id
})

afterAll(async () => {
  await db.execute(sql`TRUNCATE documents.generation_job, documents.template CASCADE`)
})

describe('DrizzleGenerationJobRepository', () => {
  it('inserts a job with pending status', async () => {
    const job = await repo.insert({
      tenantId,
      templateId,
      requestedBy: actorId,
      status: 'pending',
      inputData: { month: '2026-03' },
      outputFileKey: null,
      errorMessage: null,
    })

    expect(job.id).toBeTruthy()
    expect(job.status).toBe('pending')
  })

  it('updates status to completed with outputFileKey', async () => {
    const job = await repo.insert({
      tenantId,
      templateId,
      requestedBy: actorId,
      status: 'pending',
      inputData: {},
      outputFileKey: null,
      errorMessage: null,
    })

    await repo.updateStatus(job.id, 'completed', 'tenants/abc/docs/file.pdf')

    const updated = await repo.findById(tenantId, job.id)
    expect(updated?.status).toBe('completed')
    expect(updated?.outputFileKey).toBe('tenants/abc/docs/file.pdf')
    expect(updated?.completedAt).toBeInstanceOf(Date)
  })

  it('listByTenant filters by status', async () => {
    const failed = await repo.insert({
      tenantId,
      templateId,
      requestedBy: actorId,
      status: 'failed',
      inputData: {},
      outputFileKey: null,
      errorMessage: 'timeout',
    })

    const results = await repo.listByTenant(tenantId, { status: 'failed' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((j) => j.id === failed.id)).toBe(true)
    expect(results.every((j) => j.status === 'failed')).toBe(true)
  })
})
