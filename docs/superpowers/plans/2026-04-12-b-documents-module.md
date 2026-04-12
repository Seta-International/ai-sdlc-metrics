# Documents Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all stubs in `modules/documents` with real Drizzle repositories, command/query handlers, a pg-boss generation worker, and a tRPC router.

**Architecture:** Hexagonal DDD — domain ports first, Drizzle implementations second, application handlers third, tRPC interface last. The pg-boss worker runs inline with the API process (same ECS task). Document files are uploaded to S3 via `S3StorageClient.putObject`. The tRPC router follows the `*RouterService` singleton pattern used by the admin module.

**Tech Stack:** Drizzle ORM, pg-boss (`PgBossService`), `packages/documents` (PDF/Excel generation), `packages/storage` (`S3StorageClient`), NestJS CQRS, tRPC, vitest

**Prerequisite:** Plan A (shared infrastructure) must be complete — `PgBossModule`, `RedisModule`, `StorageClient.putObject`, and `DocumentGeneratedEvent.requestedBy` must exist.

---

## File Map

| Action | Path                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| Modify | `apps/api/src/modules/documents/domain/repositories/template.repository.port.ts`                                    |
| Modify | `apps/api/src/modules/documents/domain/repositories/generation-job.repository.port.ts`                              |
| Create | `apps/api/src/modules/documents/domain/repositories/tenant-branding.repository.port.ts`                             |
| Create | `apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.ts`                         |
| Create | `apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.integration.spec.ts`        |
| Create | `apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.ts`                   |
| Create | `apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.integration.spec.ts`  |
| Create | `apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.ts`                  |
| Create | `apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.integration.spec.ts` |
| Create | `apps/api/src/modules/documents/application/commands/create-template.command.ts`                                    |
| Create | `apps/api/src/modules/documents/application/commands/create-template.handler.ts`                                    |
| Create | `apps/api/src/modules/documents/application/commands/create-template.handler.spec.ts`                               |
| Create | `apps/api/src/modules/documents/application/commands/update-branding.command.ts`                                    |
| Create | `apps/api/src/modules/documents/application/commands/update-branding.handler.ts`                                    |
| Create | `apps/api/src/modules/documents/application/commands/update-branding.handler.spec.ts`                               |
| Create | `apps/api/src/modules/documents/application/queries/list-templates.query.ts`                                        |
| Create | `apps/api/src/modules/documents/application/queries/list-templates.handler.ts`                                      |
| Create | `apps/api/src/modules/documents/application/queries/list-templates.handler.spec.ts`                                 |
| Create | `apps/api/src/modules/documents/application/queries/list-generation-jobs.query.ts`                                  |
| Create | `apps/api/src/modules/documents/application/queries/list-generation-jobs.handler.ts`                                |
| Create | `apps/api/src/modules/documents/application/queries/get-generation-job.query.ts`                                    |
| Create | `apps/api/src/modules/documents/application/queries/get-generation-job.handler.ts`                                  |
| Create | `apps/api/src/modules/documents/application/queries/get-generation-job.handler.spec.ts`                             |
| Create | `apps/api/src/modules/documents/application/queries/get-job-download-url.query.ts`                                  |
| Create | `apps/api/src/modules/documents/application/queries/get-job-download-url.handler.ts`                                |
| Create | `apps/api/src/modules/documents/application/queries/get-job-download-url.handler.spec.ts`                           |
| Modify | `apps/api/src/modules/documents/application/commands/generate-document.handler.ts`                                  |
| Modify | `apps/api/src/modules/documents/application/commands/generate-document.handler.spec.ts`                             |
| Create | `apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.ts`                                    |
| Create | `apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.spec.ts`                               |
| Modify | `apps/api/src/modules/documents/documents.module.ts`                                                                |
| Create | `apps/api/src/modules/documents/interface/trpc/documents-router.service.ts`                                         |
| Create | `apps/api/src/modules/documents/interface/trpc/documents.router.ts`                                                 |
| Modify | `apps/api/src/common/trpc/app-router.ts`                                                                            |
| Modify | `apps/api/src/common/trpc/trpc.module.ts`                                                                           |

---

## Task 1: Update domain repository ports

**Files:**

- Modify: `apps/api/src/modules/documents/domain/repositories/template.repository.port.ts`
- Modify: `apps/api/src/modules/documents/domain/repositories/generation-job.repository.port.ts`
- Create: `apps/api/src/modules/documents/domain/repositories/tenant-branding.repository.port.ts`

- [ ] **Step 1: Update ITemplateRepository — add findById and listByTenant**

Edit `apps/api/src/modules/documents/domain/repositories/template.repository.port.ts`:

```ts
import type { Template } from '../entities/template.entity'
import type { TemplateFormat } from '../value-objects/template-format.vo'

export interface ITemplateRepository {
  findBySlugAndTenant(tenantId: string, slug: string): Promise<Template | null>
  findById(tenantId: string, id: string): Promise<Template | null>
  findByTenant(tenantId: string): Promise<Template[]>
  listByTenant(
    tenantId: string,
    filters?: { format?: TemplateFormat; limit?: number; offset?: number },
  ): Promise<Template[]>
  insert(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template>
}

export const TEMPLATE_REPOSITORY = Symbol('ITemplateRepository')
```

- [ ] **Step 2: Update IGenerationJobRepository — add listByTenant**

Edit `apps/api/src/modules/documents/domain/repositories/generation-job.repository.port.ts`:

```ts
import type { GenerationJob } from '../entities/generation-job.entity'
import type { JobStatus } from '../value-objects/job-status.vo'

export interface IGenerationJobRepository {
  insert(job: Omit<GenerationJob, 'id' | 'createdAt' | 'completedAt'>): Promise<GenerationJob>
  findById(tenantId: string, id: string): Promise<GenerationJob | null>
  updateStatus(
    id: string,
    status: JobStatus,
    outputFileKey?: string,
    errorMessage?: string,
  ): Promise<void>
  listByTenant(
    tenantId: string,
    filters?: { status?: JobStatus; limit?: number; offset?: number },
  ): Promise<GenerationJob[]>
}

export const GENERATION_JOB_REPOSITORY = Symbol('IGenerationJobRepository')
```

- [ ] **Step 3: Create ITenantBrandingRepository port**

Create `apps/api/src/modules/documents/domain/repositories/tenant-branding.repository.port.ts`:

```ts
import type { TenantBranding } from '../entities/tenant-branding.entity'

export interface ITenantBrandingRepository {
  findByTenant(tenantId: string): Promise<TenantBranding | null>
  upsert(data: Omit<TenantBranding, 'id'>): Promise<TenantBranding>
}

export const TENANT_BRANDING_REPOSITORY = Symbol('ITenantBrandingRepository')
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/documents/domain/repositories/
git commit -m "feat(documents): update domain repository ports — add missing methods"
```

---

## Task 2: DrizzleTemplateRepository

**Files:**

- Create: `apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.ts`
- Create: `apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.integration.spec.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
} from '@future/db/src/test-helpers'
import type { Db } from '@future/db'
import { DrizzleTemplateRepository } from './drizzle-template.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleTemplateRepository
let tenantId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
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
    expect(pdfs.every((t) => t.format === 'pdf')).toBe(true)

    const excels = await repo.listByTenant(tenantId, { format: 'excel' })
    expect(excels.every((t) => t.format === 'excel')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:integration -- drizzle-template.repository
```

Expected: FAIL — `DrizzleTemplateRepository not found`.

- [ ] **Step 3: Implement DrizzleTemplateRepository**

Create `apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'
import type { TemplateFormat } from '../../domain/value-objects/template-format.vo'
import { template } from '../schema/documents.schema'

@Injectable()
export class DrizzleTemplateRepository implements ITemplateRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findBySlugAndTenant(tenantId: string, slug: string): Promise<Template | null> {
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.tenantId, tenantId), eq(template.slug, slug)))
      .limit(1)
    return (rows[0] as Template | undefined) ?? null
  }

  async findById(tenantId: string, id: string): Promise<Template | null> {
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.tenantId, tenantId), eq(template.id, id)))
      .limit(1)
    return (rows[0] as Template | undefined) ?? null
  }

  async findByTenant(tenantId: string): Promise<Template[]> {
    const rows = await this.db.select().from(template).where(eq(template.tenantId, tenantId))
    return rows as Template[]
  }

  async listByTenant(
    tenantId: string,
    filters?: { format?: TemplateFormat; limit?: number; offset?: number },
  ): Promise<Template[]> {
    const conditions = [eq(template.tenantId, tenantId)]
    if (filters?.format) conditions.push(eq(template.format, filters.format))

    let q = this.db
      .select()
      .from(template)
      .where(and(...conditions))
      .$dynamic()
    if (filters?.limit !== undefined) q = q.limit(filters.limit)
    if (filters?.offset !== undefined) q = q.offset(filters.offset)

    return (await q) as Template[]
  }

  async insert(data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template> {
    const rows = await this.db
      .insert(template)
      .values({
        tenantId: data.tenantId,
        slug: data.slug,
        name: data.name,
        format: data.format,
        content: data.content,
        version: data.version,
        isDefault: data.isDefault,
        createdBy: data.createdBy ?? undefined,
      })
      .returning()
    return rows[0] as Template
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:integration -- drizzle-template.repository
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.ts \
        apps/api/src/modules/documents/infrastructure/repositories/drizzle-template.repository.integration.spec.ts
git commit -m "feat(documents): DrizzleTemplateRepository with integration tests"
```

---

## Task 3: DrizzleGenerationJobRepository

**Files:**

- Create: `apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.ts`
- Create: `apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.integration.spec.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  seedActor,
  setTenantContext,
} from '@future/db/src/test-helpers'
import type { Db } from '@future/db'
import { DrizzleGenerationJobRepository } from './drizzle-generation-job.repository'
import { DrizzleTemplateRepository } from './drizzle-template.repository'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'

let db: Db
let repo: DrizzleGenerationJobRepository
let templateRepo: DrizzleTemplateRepository
let tenantId: string
let actorId: string
let templateId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
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
    expect(results.some((j) => j.id === failed.id)).toBe(true)
    expect(results.every((j) => j.status === 'failed')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:integration -- drizzle-generation-job.repository
```

- [ ] **Step 3: Implement DrizzleGenerationJobRepository**

Create `apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'
import type { JobStatus } from '../../domain/value-objects/job-status.vo'
import { generationJob } from '../schema/documents.schema'

@Injectable()
export class DrizzleGenerationJobRepository implements IGenerationJobRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(
    data: Omit<GenerationJob, 'id' | 'createdAt' | 'completedAt'>,
  ): Promise<GenerationJob> {
    const rows = await this.db
      .insert(generationJob)
      .values({
        tenantId: data.tenantId,
        templateId: data.templateId,
        requestedBy: data.requestedBy,
        status: data.status,
        inputData: data.inputData,
        outputFileKey: data.outputFileKey ?? undefined,
        errorMessage: data.errorMessage ?? undefined,
      })
      .returning()
    return rows[0] as GenerationJob
  }

  async findById(tenantId: string, id: string): Promise<GenerationJob | null> {
    const rows = await this.db
      .select()
      .from(generationJob)
      .where(and(eq(generationJob.tenantId, tenantId), eq(generationJob.id, id)))
      .limit(1)
    return (rows[0] as GenerationJob | undefined) ?? null
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    outputFileKey?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.db
      .update(generationJob)
      .set({
        status,
        outputFileKey: outputFileKey ?? undefined,
        errorMessage: errorMessage ?? undefined,
        completedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      })
      .where(eq(generationJob.id, id))
  }

  async listByTenant(
    tenantId: string,
    filters?: { status?: JobStatus; limit?: number; offset?: number },
  ): Promise<GenerationJob[]> {
    const conditions = [eq(generationJob.tenantId, tenantId)]
    if (filters?.status) conditions.push(eq(generationJob.status, filters.status))

    let q = this.db
      .select()
      .from(generationJob)
      .where(and(...conditions))
      .$dynamic()
    if (filters?.limit !== undefined) q = q.limit(filters.limit)
    if (filters?.offset !== undefined) q = q.offset(filters.offset)

    return (await q) as GenerationJob[]
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:integration -- drizzle-generation-job.repository
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.ts \
        apps/api/src/modules/documents/infrastructure/repositories/drizzle-generation-job.repository.integration.spec.ts
git commit -m "feat(documents): DrizzleGenerationJobRepository with integration tests"
```

---

## Task 4: DrizzleTenantBrandingRepository

**Files:**

- Create: `apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.ts`
- Create: `apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.integration.spec.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.integration.spec.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
} from '@future/db/src/test-helpers'
import type { Db } from '@future/db'
import { DrizzleTenantBrandingRepository } from './drizzle-tenant-branding.repository'
import { sql } from 'drizzle-orm'

let db: Db
let repo: DrizzleTenantBrandingRepository
let tenantId: string

beforeAll(async () => {
  await migrateForTest()
  db = createTestDb()
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
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:integration -- drizzle-tenant-branding.repository
```

- [ ] **Step 3: Implement DrizzleTenantBrandingRepository**

Create `apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import type { TenantBranding } from '../../domain/entities/tenant-branding.entity'
import { tenantBranding } from '../schema/documents.schema'

@Injectable()
export class DrizzleTenantBrandingRepository implements ITenantBrandingRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findByTenant(tenantId: string): Promise<TenantBranding | null> {
    const rows = await this.db
      .select()
      .from(tenantBranding)
      .where(eq(tenantBranding.tenantId, tenantId))
      .limit(1)
    return (rows[0] as TenantBranding | undefined) ?? null
  }

  async upsert(data: Omit<TenantBranding, 'id'>): Promise<TenantBranding> {
    const rows = await this.db
      .insert(tenantBranding)
      .values({
        tenantId: data.tenantId,
        companyName: data.companyName,
        logoFileKey: data.logoFileKey ?? undefined,
        primaryColor: data.primaryColor ?? undefined,
        fontFamily: data.fontFamily ?? undefined,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: tenantBranding.tenantId,
        set: {
          companyName: data.companyName,
          logoFileKey: data.logoFileKey ?? undefined,
          primaryColor: data.primaryColor ?? undefined,
          fontFamily: data.fontFamily ?? undefined,
          updatedAt: new Date(),
        },
      })
      .returning()
    return rows[0] as TenantBranding
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/api && bun run test:integration -- drizzle-tenant-branding.repository
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.ts \
        apps/api/src/modules/documents/infrastructure/repositories/drizzle-tenant-branding.repository.integration.spec.ts
git commit -m "feat(documents): DrizzleTenantBrandingRepository with integration tests"
```

---

## Task 5: CreateTemplateHandler

**Files:**

- Create: `apps/api/src/modules/documents/application/commands/create-template.command.ts`
- Create: `apps/api/src/modules/documents/application/commands/create-template.handler.ts`
- Create: `apps/api/src/modules/documents/application/commands/create-template.handler.spec.ts`

- [ ] **Step 1: Create the command**

Create `apps/api/src/modules/documents/application/commands/create-template.command.ts`:

```ts
import type { TemplateFormat } from '../../domain/value-objects/template-format.vo'

export class CreateTemplateCommand {
  constructor(
    public readonly tenantId: string,
    public readonly createdBy: string,
    public readonly slug: string,
    public readonly name: string,
    public readonly format: TemplateFormat,
    public readonly content: string,
  ) {}
}
```

- [ ] **Step 2: Write failing unit test**

Create `apps/api/src/modules/documents/application/commands/create-template.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateTemplateHandler } from './create-template.handler'
import { CreateTemplateCommand } from './create-template.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'

const mockRepo: ITemplateRepository = {
  findBySlugAndTenant: vi.fn(),
  findById: vi.fn(),
  findByTenant: vi.fn(),
  listByTenant: vi.fn(),
  insert: vi.fn(),
}

describe('CreateTemplateHandler', () => {
  let handler: CreateTemplateHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new CreateTemplateHandler(mockRepo)
  })

  it('inserts template and returns id', async () => {
    vi.mocked(mockRepo.findBySlugAndTenant).mockResolvedValue(null)
    vi.mocked(mockRepo.insert).mockResolvedValue({
      id: 'tmpl-1',
      tenantId: 'tenant-1',
      slug: 'payslip',
      name: 'Payslip',
      format: 'pdf',
      content: '<html></html>',
      version: 1,
      isDefault: false,
      createdBy: 'actor-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const id = await handler.execute(
      new CreateTemplateCommand(
        'tenant-1',
        'actor-1',
        'payslip',
        'Payslip',
        'pdf',
        '<html></html>',
      ),
    )

    expect(id).toBe('tmpl-1')
    expect(mockRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'payslip', format: 'pdf', version: 1 }),
    )
  })

  it('throws if slug already exists for tenant', async () => {
    vi.mocked(mockRepo.findBySlugAndTenant).mockResolvedValue({
      id: 'existing',
      tenantId: 'tenant-1',
      slug: 'payslip',
      name: 'Payslip',
      format: 'pdf',
      content: '',
      version: 1,
      isDefault: false,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      handler.execute(
        new CreateTemplateCommand('tenant-1', 'actor-1', 'payslip', 'Payslip', 'pdf', ''),
      ),
    ).rejects.toThrow('Template slug already exists: payslip')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- create-template.handler
```

- [ ] **Step 4: Implement CreateTemplateHandler**

Create `apps/api/src/modules/documents/application/commands/create-template.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { CreateTemplateCommand } from './create-template.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'

@CommandHandler(CreateTemplateCommand)
@Injectable()
export class CreateTemplateHandler implements ICommandHandler<CreateTemplateCommand, string> {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async execute(command: CreateTemplateCommand): Promise<string> {
    const existing = await this.templateRepo.findBySlugAndTenant(command.tenantId, command.slug)
    if (existing) {
      throw new Error(`Template slug already exists: ${command.slug}`)
    }

    const template = await this.templateRepo.insert({
      tenantId: command.tenantId,
      slug: command.slug,
      name: command.name,
      format: command.format,
      content: command.content,
      version: 1,
      isDefault: false,
      createdBy: command.createdBy,
    })

    return template.id
  }
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- create-template.handler
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/application/commands/create-template.command.ts \
        apps/api/src/modules/documents/application/commands/create-template.handler.ts \
        apps/api/src/modules/documents/application/commands/create-template.handler.spec.ts
git commit -m "feat(documents): CreateTemplateHandler — validates slug uniqueness"
```

---

## Task 6: UpdateBrandingHandler

**Files:**

- Create: `apps/api/src/modules/documents/application/commands/update-branding.command.ts`
- Create: `apps/api/src/modules/documents/application/commands/update-branding.handler.ts`
- Create: `apps/api/src/modules/documents/application/commands/update-branding.handler.spec.ts`

- [ ] **Step 1: Create the command**

Create `apps/api/src/modules/documents/application/commands/update-branding.command.ts`:

```ts
export class UpdateBrandingCommand {
  constructor(
    public readonly tenantId: string,
    public readonly companyName: string,
    public readonly logoFileKey: string | null,
    public readonly primaryColor: string | null,
    public readonly fontFamily: string | null,
  ) {}
}
```

- [ ] **Step 2: Write failing unit test**

Create `apps/api/src/modules/documents/application/commands/update-branding.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UpdateBrandingHandler } from './update-branding.handler'
import { UpdateBrandingCommand } from './update-branding.command'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'

const mockRepo: ITenantBrandingRepository = {
  findByTenant: vi.fn(),
  upsert: vi.fn(),
}

describe('UpdateBrandingHandler', () => {
  let handler: UpdateBrandingHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UpdateBrandingHandler(mockRepo)
  })

  it('upserts branding and returns tenantId', async () => {
    vi.mocked(mockRepo.upsert).mockResolvedValue({
      id: 'brand-1',
      tenantId: 'tenant-1',
      companyName: 'SETA',
      logoFileKey: null,
      primaryColor: '#1D4ED8',
      fontFamily: null,
      updatedAt: new Date(),
    })

    const result = await handler.execute(
      new UpdateBrandingCommand('tenant-1', 'SETA', null, '#1D4ED8', null),
    )

    expect(result).toBe('tenant-1')
    expect(mockRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', companyName: 'SETA' }),
    )
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- update-branding.handler
```

- [ ] **Step 4: Implement UpdateBrandingHandler**

Create `apps/api/src/modules/documents/application/commands/update-branding.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { UpdateBrandingCommand } from './update-branding.command'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import { TENANT_BRANDING_REPOSITORY } from '../../domain/repositories/tenant-branding.repository.port'

@CommandHandler(UpdateBrandingCommand)
@Injectable()
export class UpdateBrandingHandler implements ICommandHandler<UpdateBrandingCommand, string> {
  constructor(
    @Inject(TENANT_BRANDING_REPOSITORY) private readonly brandingRepo: ITenantBrandingRepository,
  ) {}

  async execute(command: UpdateBrandingCommand): Promise<string> {
    await this.brandingRepo.upsert({
      tenantId: command.tenantId,
      companyName: command.companyName,
      logoFileKey: command.logoFileKey,
      primaryColor: command.primaryColor,
      fontFamily: command.fontFamily,
      updatedAt: new Date(),
    })
    return command.tenantId
  }
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- update-branding.handler
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/application/commands/update-branding.command.ts \
        apps/api/src/modules/documents/application/commands/update-branding.handler.ts \
        apps/api/src/modules/documents/application/commands/update-branding.handler.spec.ts
git commit -m "feat(documents): UpdateBrandingHandler — upserts tenant branding"
```

---

## Task 7: Query handlers — list templates, list/get jobs, get download URL

**Files:**

- Create: `apps/api/src/modules/documents/application/queries/list-templates.query.ts`
- Create: `apps/api/src/modules/documents/application/queries/list-templates.handler.ts`
- Create: `apps/api/src/modules/documents/application/queries/list-templates.handler.spec.ts`
- Create: `apps/api/src/modules/documents/application/queries/list-generation-jobs.query.ts`
- Create: `apps/api/src/modules/documents/application/queries/list-generation-jobs.handler.ts`
- Create: `apps/api/src/modules/documents/application/queries/get-generation-job.query.ts`
- Create: `apps/api/src/modules/documents/application/queries/get-generation-job.handler.ts`
- Create: `apps/api/src/modules/documents/application/queries/get-generation-job.handler.spec.ts`
- Create: `apps/api/src/modules/documents/application/queries/get-job-download-url.query.ts`
- Create: `apps/api/src/modules/documents/application/queries/get-job-download-url.handler.ts`
- Create: `apps/api/src/modules/documents/application/queries/get-job-download-url.handler.spec.ts`

- [ ] **Step 1: Create query classes**

Create `apps/api/src/modules/documents/application/queries/list-templates.query.ts`:

```ts
import type { TemplateFormat } from '../../domain/value-objects/template-format.vo'

export class ListTemplatesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filters?: { format?: TemplateFormat; limit?: number; offset?: number },
  ) {}
}
```

Create `apps/api/src/modules/documents/application/queries/list-generation-jobs.query.ts`:

```ts
import type { JobStatus } from '../../domain/value-objects/job-status.vo'

export class ListGenerationJobsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filters?: { status?: JobStatus; limit?: number; offset?: number },
  ) {}
}
```

Create `apps/api/src/modules/documents/application/queries/get-generation-job.query.ts`:

```ts
export class GetGenerationJobQuery {
  constructor(
    public readonly tenantId: string,
    public readonly jobId: string,
  ) {}
}
```

Create `apps/api/src/modules/documents/application/queries/get-job-download-url.query.ts`:

```ts
export class GetJobDownloadUrlQuery {
  constructor(
    public readonly tenantId: string,
    public readonly jobId: string,
  ) {}
}
```

- [ ] **Step 2: Write failing unit tests for GetGenerationJobHandler and GetJobDownloadUrlHandler**

Create `apps/api/src/modules/documents/application/queries/get-generation-job.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetGenerationJobHandler } from './get-generation-job.handler'
import { GetGenerationJobQuery } from './get-generation-job.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

const mockJob: GenerationJob = {
  id: 'job-1',
  tenantId: 'tenant-1',
  templateId: 'tmpl-1',
  requestedBy: 'actor-1',
  status: 'completed',
  inputData: {},
  outputFileKey: 'tenants/t1/docs/file.pdf',
  errorMessage: null,
  createdAt: new Date(),
  completedAt: new Date(),
}

const mockRepo: IGenerationJobRepository = {
  insert: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listByTenant: vi.fn(),
}

describe('GetGenerationJobHandler', () => {
  let handler: GetGenerationJobHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetGenerationJobHandler(mockRepo)
  })

  it('returns job when found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(mockJob)
    const result = await handler.execute(new GetGenerationJobQuery('tenant-1', 'job-1'))
    expect(result).toEqual(mockJob)
  })

  it('throws when job not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null)
    await expect(handler.execute(new GetGenerationJobQuery('tenant-1', 'missing'))).rejects.toThrow(
      'Job not found: missing',
    )
  })
})
```

Create `apps/api/src/modules/documents/application/queries/get-job-download-url.handler.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetJobDownloadUrlHandler } from './get-job-download-url.handler'
import { GetJobDownloadUrlQuery } from './get-job-download-url.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { StorageClient } from '@future/storage'

const mockRepo: IGenerationJobRepository = {
  insert: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listByTenant: vi.fn(),
}

const mockStorage: StorageClient = {
  getUploadUrl: vi.fn(),
  getDownloadUrl: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  headObject: vi.fn(),
}

describe('GetJobDownloadUrlHandler', () => {
  let handler: GetJobDownloadUrlHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new GetJobDownloadUrlHandler(mockRepo, mockStorage)
  })

  it('returns presigned URL for a completed job', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'completed',
      inputData: {},
      outputFileKey: 'tenants/t1/docs/file.pdf',
      errorMessage: null,
      createdAt: new Date(),
      completedAt: new Date(),
    })
    vi.mocked(mockStorage.getDownloadUrl).mockResolvedValue({
      url: 'https://s3.example.com/signed',
      expiresAt: new Date(),
    })

    const result = await handler.execute(new GetJobDownloadUrlQuery('tenant-1', 'job-1'))
    expect(result.url).toBe('https://s3.example.com/signed')
    expect(mockStorage.getDownloadUrl).toHaveBeenCalledWith('tenants/t1/docs/file.pdf')
  })

  it('throws when job is not completed', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'pending',
      inputData: {},
      outputFileKey: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    })

    await expect(handler.execute(new GetJobDownloadUrlQuery('tenant-1', 'job-1'))).rejects.toThrow(
      'Job not completed: job-1',
    )
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd apps/api && bun run test:unit -- get-generation-job.handler get-job-download-url.handler
```

- [ ] **Step 4: Implement all query handlers**

Create `apps/api/src/modules/documents/application/queries/list-templates.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ListTemplatesQuery } from './list-templates.query'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { Template } from '../../domain/entities/template.entity'

@QueryHandler(ListTemplatesQuery)
@Injectable()
export class ListTemplatesHandler implements IQueryHandler<ListTemplatesQuery, Template[]> {
  constructor(@Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository) {}

  async execute(query: ListTemplatesQuery): Promise<Template[]> {
    return this.templateRepo.listByTenant(query.tenantId, query.filters)
  }
}
```

Create `apps/api/src/modules/documents/application/queries/list-generation-jobs.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ListGenerationJobsQuery } from './list-generation-jobs.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

@QueryHandler(ListGenerationJobsQuery)
@Injectable()
export class ListGenerationJobsHandler implements IQueryHandler<
  ListGenerationJobsQuery,
  GenerationJob[]
> {
  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
  ) {}

  async execute(query: ListGenerationJobsQuery): Promise<GenerationJob[]> {
    return this.jobRepo.listByTenant(query.tenantId, query.filters)
  }
}
```

Create `apps/api/src/modules/documents/application/queries/get-generation-job.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetGenerationJobQuery } from './get-generation-job.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { GenerationJob } from '../../domain/entities/generation-job.entity'

@QueryHandler(GetGenerationJobQuery)
@Injectable()
export class GetGenerationJobHandler implements IQueryHandler<
  GetGenerationJobQuery,
  GenerationJob
> {
  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
  ) {}

  async execute(query: GetGenerationJobQuery): Promise<GenerationJob> {
    const job = await this.jobRepo.findById(query.tenantId, query.jobId)
    if (!job) throw new Error(`Job not found: ${query.jobId}`)
    return job
  }
}
```

Create `apps/api/src/modules/documents/application/queries/get-job-download-url.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetJobDownloadUrlQuery } from './get-job-download-url.query'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { StorageClient, PresignedUrl } from '@future/storage'

export const STORAGE_CLIENT = Symbol('StorageClient')

@QueryHandler(GetJobDownloadUrlQuery)
@Injectable()
export class GetJobDownloadUrlHandler implements IQueryHandler<
  GetJobDownloadUrlQuery,
  PresignedUrl
> {
  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
  ) {}

  async execute(query: GetJobDownloadUrlQuery): Promise<PresignedUrl> {
    const job = await this.jobRepo.findById(query.tenantId, query.jobId)
    if (!job) throw new Error(`Job not found: ${query.jobId}`)
    if (job.status !== 'completed' || !job.outputFileKey) {
      throw new Error(`Job not completed: ${query.jobId}`)
    }
    return this.storage.getDownloadUrl(job.outputFileKey)
  }
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd apps/api && bun run test:unit -- get-generation-job.handler get-job-download-url.handler
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/application/queries/
git commit -m "feat(documents): add query handlers — list templates, list/get jobs, download URL"
```

---

## Task 8: DocumentGenerateWorker

**Files:**

- Create: `apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.ts`
- Create: `apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.spec.ts`

- [ ] **Step 1: Write failing unit test**

Create `apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentGenerateWorker } from './document-generate.worker'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import type { StorageClient } from '@future/storage'
import type { EventBus } from '@nestjs/cqrs'

const mockJobRepo: IGenerationJobRepository = {
  insert: vi.fn(),
  findById: vi.fn(),
  updateStatus: vi.fn(),
  listByTenant: vi.fn(),
}
const mockTemplateRepo: ITemplateRepository = {
  findBySlugAndTenant: vi.fn(),
  findById: vi.fn(),
  findByTenant: vi.fn(),
  listByTenant: vi.fn(),
  insert: vi.fn(),
}
const mockBrandingRepo: ITenantBrandingRepository = {
  findByTenant: vi.fn(),
  upsert: vi.fn(),
}
const mockStorage: StorageClient = {
  getUploadUrl: vi.fn(),
  getDownloadUrl: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  headObject: vi.fn(),
}
const mockEventBus = { publish: vi.fn() } as unknown as EventBus

vi.mock('@future/documents', () => ({
  generatePdf: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  generateExcel: vi.fn().mockResolvedValue(Buffer.from('xlsx-bytes')),
}))

describe('DocumentGenerateWorker', () => {
  let worker: DocumentGenerateWorker

  beforeEach(() => {
    vi.clearAllMocks()
    worker = new DocumentGenerateWorker(
      mockJobRepo,
      mockTemplateRepo,
      mockBrandingRepo,
      mockStorage,
      mockEventBus,
    )
  })

  it('generates PDF, uploads to S3, and marks job completed', async () => {
    vi.mocked(mockJobRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'pending',
      inputData: { name: 'Nguyen Van A' },
      outputFileKey: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    })
    vi.mocked(mockTemplateRepo.findById).mockResolvedValue({
      id: 'tmpl-1',
      tenantId: 'tenant-1',
      slug: 'payslip',
      name: 'Payslip',
      format: 'pdf',
      content: '<html>{{name}}</html>',
      version: 1,
      isDefault: false,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(mockBrandingRepo.findByTenant).mockResolvedValue(null)
    vi.mocked(mockStorage.putObject).mockResolvedValue(undefined)

    await worker.handle({ data: { jobId: 'job-1', tenantId: 'tenant-1' } } as never)

    expect(mockJobRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'processing',
      undefined,
      undefined,
    )
    expect(mockStorage.putObject).toHaveBeenCalled()
    expect(mockJobRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'completed',
      expect.stringContaining('tenant-1'),
      undefined,
    )
    expect(mockEventBus.publish).toHaveBeenCalled()
  })

  it('marks job failed on error', async () => {
    vi.mocked(mockJobRepo.findById).mockResolvedValue({
      id: 'job-1',
      tenantId: 'tenant-1',
      templateId: 'tmpl-1',
      requestedBy: 'actor-1',
      status: 'pending',
      inputData: {},
      outputFileKey: null,
      errorMessage: null,
      createdAt: new Date(),
      completedAt: null,
    })
    vi.mocked(mockTemplateRepo.findById).mockResolvedValue(null)

    await worker.handle({ data: { jobId: 'job-1', tenantId: 'tenant-1' } } as never)

    expect(mockJobRepo.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      undefined,
      expect.stringContaining('Template not found'),
    )
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/api && bun run test:unit -- document-generate.worker
```

- [ ] **Step 3: Implement DocumentGenerateWorker**

Create `apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common'
import { EventBus } from '@nestjs/cqrs'
import type PgBoss from 'pg-boss'
import { generatePdf, generateExcel } from '@future/documents'
import type { StorageClient } from '@future/storage'
import { DocumentGeneratedEvent } from '@future/event-contracts'
import { uuidv7 } from 'uuidv7'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { ITenantBrandingRepository } from '../../domain/repositories/tenant-branding.repository.port'
import { TENANT_BRANDING_REPOSITORY } from '../../domain/repositories/tenant-branding.repository.port'
import { STORAGE_CLIENT } from '../../application/queries/get-job-download-url.handler'

export interface DocumentGenerateJobData {
  jobId: string
  tenantId: string
}

@Injectable()
export class DocumentGenerateWorker {
  private readonly logger = new Logger(DocumentGenerateWorker.name)

  constructor(
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
    @Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository,
    @Inject(TENANT_BRANDING_REPOSITORY) private readonly brandingRepo: ITenantBrandingRepository,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly eventBus: EventBus,
  ) {}

  async handle(job: PgBoss.Job<DocumentGenerateJobData>): Promise<void> {
    const { jobId, tenantId } = job.data

    const genJob = await this.jobRepo.findById(tenantId, jobId)
    if (!genJob) {
      this.logger.error(`Generation job not found: ${jobId}`)
      return
    }

    await this.jobRepo.updateStatus(jobId, 'processing')

    try {
      const template = await this.templateRepo.findById(tenantId, genJob.templateId)
      if (!template) throw new Error(`Template not found: ${genJob.templateId}`)

      const branding = await this.brandingRepo.findByTenant(tenantId)
      const brandingOpts = branding
        ? {
            companyName: branding.companyName,
            primaryColor: branding.primaryColor ?? undefined,
            logoUrl: branding.logoFileKey ?? undefined,
            fontFamily: branding.fontFamily ?? undefined,
          }
        : undefined

      let fileBuffer: Buffer
      let contentType: string

      if (template.format === 'pdf') {
        const result = await generatePdf({
          template: { html: template.content },
          data: genJob.inputData,
          branding: brandingOpts,
        })
        fileBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result)
        contentType = 'application/pdf'
      } else {
        const sheets = JSON.parse(template.content) as Parameters<typeof generateExcel>[0]['sheets']
        const result = await generateExcel({ sheets, branding: brandingOpts })
        fileBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result)
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }

      const ext = template.format === 'pdf' ? 'pdf' : 'xlsx'
      const outputKey = `${tenantId}/documents/${genJob.templateId}/${uuidv7()}.${ext}`

      await this.storage.putObject(outputKey, fileBuffer, contentType)
      await this.jobRepo.updateStatus(jobId, 'completed', outputKey)

      this.eventBus.publish(
        new DocumentGeneratedEvent(
          tenantId,
          jobId,
          template.slug,
          template.format,
          outputKey,
          genJob.requestedBy,
        ),
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`Document generation failed for job ${jobId}: ${message}`)
      await this.jobRepo.updateStatus(jobId, 'failed', undefined, message)
    }
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/api && bun run test:unit -- document-generate.worker
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.ts \
        apps/api/src/modules/documents/infrastructure/jobs/document-generate.worker.spec.ts
git commit -m "feat(documents): DocumentGenerateWorker — generates PDF/Excel, uploads to S3"
```

---

## Task 9: Update GenerateDocumentHandler to enqueue pg-boss job

**Files:**

- Modify: `apps/api/src/modules/documents/application/commands/generate-document.handler.ts`
- Modify: `apps/api/src/modules/documents/application/commands/generate-document.handler.spec.ts`

- [ ] **Step 1: Update the handler**

Edit `apps/api/src/modules/documents/application/commands/generate-document.handler.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { GenerateDocumentCommand } from './generate-document.command'
import type { ITemplateRepository } from '../../domain/repositories/template.repository.port'
import { TEMPLATE_REPOSITORY } from '../../domain/repositories/template.repository.port'
import type { IGenerationJobRepository } from '../../domain/repositories/generation-job.repository.port'
import { GENERATION_JOB_REPOSITORY } from '../../domain/repositories/generation-job.repository.port'
import { PgBossService, JOB_DOCUMENTS_GENERATE } from '../../../../common/jobs/pg-boss.service'

@CommandHandler(GenerateDocumentCommand)
@Injectable()
export class GenerateDocumentHandler implements ICommandHandler<GenerateDocumentCommand, string> {
  constructor(
    @Inject(TEMPLATE_REPOSITORY) private readonly templateRepo: ITemplateRepository,
    @Inject(GENERATION_JOB_REPOSITORY) private readonly jobRepo: IGenerationJobRepository,
    private readonly pgBoss: PgBossService,
  ) {}

  async execute(command: GenerateDocumentCommand): Promise<string> {
    const template = await this.templateRepo.findBySlugAndTenant(
      command.tenantId,
      command.templateSlug,
    )

    if (!template) {
      throw new Error(`Template not found: ${command.templateSlug}`)
    }

    const job = await this.jobRepo.insert({
      tenantId: command.tenantId,
      templateId: template.id,
      requestedBy: command.requestedBy,
      status: 'pending',
      inputData: command.inputData,
      outputFileKey: null,
      errorMessage: null,
    })

    await this.pgBoss.enqueue(JOB_DOCUMENTS_GENERATE, {
      jobId: job.id,
      tenantId: command.tenantId,
    })

    return job.id
  }
}
```

- [ ] **Step 2: Update the spec to mock PgBossService**

Edit `apps/api/src/modules/documents/application/commands/generate-document.handler.spec.ts` — add a mock for `PgBossService`:

Read the existing spec first. Then add at the top of the mock setup:

```ts
const mockPgBoss = { enqueue: vi.fn().mockResolvedValue('boss-job-id') }
```

And pass `mockPgBoss as unknown as PgBossService` as the third constructor arg. The test should verify `enqueue` was called with `JOB_DOCUMENTS_GENERATE`.

- [ ] **Step 3: Run unit tests — verify pass**

```bash
cd apps/api && bun run test:unit -- generate-document.handler
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/documents/application/commands/generate-document.handler.ts \
        apps/api/src/modules/documents/application/commands/generate-document.handler.spec.ts
git commit -m "feat(documents): GenerateDocumentHandler enqueues pg-boss job"
```

---

## Task 10: Wire DocumentsModule

**Files:**

- Modify: `apps/api/src/modules/documents/documents.module.ts`

- [ ] **Step 1: Replace all stubs with real providers**

Edit `apps/api/src/modules/documents/documents.module.ts`:

```ts
import { Module, OnApplicationBootstrap } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import { S3StorageClient } from '@future/storage'
import { DocumentsQueryFacade } from './application/facades/documents-query.facade'
import { GenerateDocumentHandler } from './application/commands/generate-document.handler'
import { CreateTemplateHandler } from './application/commands/create-template.handler'
import { UpdateBrandingHandler } from './application/commands/update-branding.handler'
import { ListTemplatesHandler } from './application/queries/list-templates.handler'
import { ListGenerationJobsHandler } from './application/queries/list-generation-jobs.handler'
import { GetGenerationJobHandler } from './application/queries/get-generation-job.handler'
import { GetJobDownloadUrlHandler } from './application/queries/get-job-download-url.handler'
import { STORAGE_CLIENT } from './application/queries/get-job-download-url.handler'
import { TEMPLATE_REPOSITORY } from './domain/repositories/template.repository.port'
import { GENERATION_JOB_REPOSITORY } from './domain/repositories/generation-job.repository.port'
import { TENANT_BRANDING_REPOSITORY } from './domain/repositories/tenant-branding.repository.port'
import { DrizzleTemplateRepository } from './infrastructure/repositories/drizzle-template.repository'
import { DrizzleGenerationJobRepository } from './infrastructure/repositories/drizzle-generation-job.repository'
import { DrizzleTenantBrandingRepository } from './infrastructure/repositories/drizzle-tenant-branding.repository'
import { DocumentGenerateWorker } from './infrastructure/jobs/document-generate.worker'
import { PgBossService, JOB_DOCUMENTS_GENERATE } from '../../common/jobs/pg-boss.service'
import { DocumentsRouterService } from './interface/trpc/documents-router.service'

@Module({
  imports: [CqrsModule],
  providers: [
    DocumentsQueryFacade,
    GenerateDocumentHandler,
    CreateTemplateHandler,
    UpdateBrandingHandler,
    ListTemplatesHandler,
    ListGenerationJobsHandler,
    GetGenerationJobHandler,
    GetJobDownloadUrlHandler,
    DocumentsRouterService,
    DocumentGenerateWorker,
    { provide: TEMPLATE_REPOSITORY, useClass: DrizzleTemplateRepository },
    { provide: GENERATION_JOB_REPOSITORY, useClass: DrizzleGenerationJobRepository },
    { provide: TENANT_BRANDING_REPOSITORY, useClass: DrizzleTenantBrandingRepository },
    {
      provide: STORAGE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new S3StorageClient({
          bucket: config.getOrThrow<string>('S3_BUCKET'),
          region: config.getOrThrow<string>('S3_REGION'),
        }),
    },
  ],
  exports: [DocumentsQueryFacade],
})
export class DocumentsModule implements OnApplicationBootstrap {
  constructor(
    private readonly pgBoss: PgBossService,
    private readonly worker: DocumentGenerateWorker,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker(JOB_DOCUMENTS_GENERATE, (job) => this.worker.handle(job))
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | grep -i "documents" | head -20
```

Expected: no errors in documents files.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/documents/documents.module.ts
git commit -m "feat(documents): wire DocumentsModule — replace stubs with real providers"
```

---

## Task 11: Documents tRPC router and RouterService

**Files:**

- Create: `apps/api/src/modules/documents/interface/trpc/documents-router.service.ts`
- Create: `apps/api/src/modules/documents/interface/trpc/documents.router.ts`
- Modify: `apps/api/src/common/trpc/app-router.ts`
- Modify: `apps/api/src/common/trpc/trpc.module.ts`

- [ ] **Step 1: Create DocumentsRouterService (singleton pattern)**

Create `apps/api/src/modules/documents/interface/trpc/documents-router.service.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'

let instance: DocumentsRouterService | null = null

@Injectable()
export class DocumentsRouterService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this
  }

  static getInstance(): DocumentsRouterService {
    if (!instance) throw new Error('DocumentsRouterService not initialized')
    return instance
  }

  command<T>(cmd: T): Promise<unknown> {
    return this.commandBus.execute(cmd as never)
  }

  query<T>(q: T): Promise<unknown> {
    return this.queryBus.execute(q as never)
  }
}
```

- [ ] **Step 2: Create Documents tRPC router**

Create `apps/api/src/modules/documents/interface/trpc/documents.router.ts`:

```ts
import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { DocumentsRouterService } from './documents-router.service'
import { GenerateDocumentCommand } from '../../application/commands/generate-document.command'
import { CreateTemplateCommand } from '../../application/commands/create-template.command'
import { UpdateBrandingCommand } from '../../application/commands/update-branding.command'
import { ListTemplatesQuery } from '../../application/queries/list-templates.query'
import { ListGenerationJobsQuery } from '../../application/queries/list-generation-jobs.query'
import { GetGenerationJobQuery } from '../../application/queries/get-generation-job.query'
import { GetJobDownloadUrlQuery } from '../../application/queries/get-job-download-url.query'

function svc() {
  return DocumentsRouterService.getInstance()
}

const templateFormatEnum = z.enum(['pdf', 'excel'])
const jobStatusEnum = z.enum(['pending', 'processing', 'completed', 'failed'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDocumentsRouter(protectedProcedure: any) {
  return router({
    templates: router({
      list: protectedProcedure
        .input(z.object({ format: templateFormatEnum.optional() }))
        .query(({ ctx, input }: { ctx: AuthContext; input: { format?: 'pdf' | 'excel' } }) =>
          svc().query(new ListTemplatesQuery(ctx.tenantId, { format: input.format })),
        ),

      get: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(({ ctx, input }: { ctx: AuthContext; input: { id: string } }) =>
          svc().query(new GetGenerationJobQuery(ctx.tenantId, input.id)),
        ),

      create: protectedProcedure
        .input(
          z.object({
            slug: z.string().min(1).max(100),
            name: z.string().min(1).max(200),
            format: templateFormatEnum,
            content: z.string().min(1),
          }),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
          svc().command(
            new CreateTemplateCommand(
              ctx.tenantId,
              ctx.actorId,
              input.slug,
              input.name,
              input.format,
              input.content,
            ),
          ),
        ),
    }),

    branding: router({
      get: protectedProcedure.query(({ ctx }: { ctx: AuthContext }) =>
        svc().query({ tenantId: ctx.tenantId } as never),
      ),

      update: protectedProcedure
        .input(
          z.object({
            companyName: z.string().min(1).max(200),
            logoFileKey: z.string().nullable().optional(),
            primaryColor: z
              .string()
              .regex(/^#[0-9A-Fa-f]{6}$/)
              .nullable()
              .optional(),
            fontFamily: z.string().nullable().optional(),
          }),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
          svc().command(
            new UpdateBrandingCommand(
              ctx.tenantId,
              input.companyName,
              input.logoFileKey ?? null,
              input.primaryColor ?? null,
              input.fontFamily ?? null,
            ),
          ),
        ),
    }),

    generate: protectedProcedure
      .input(
        z.object({
          templateSlug: z.string().min(1),
          inputData: z.record(z.unknown()),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().command(
          new GenerateDocumentCommand(
            ctx.tenantId,
            ctx.actorId,
            input.templateSlug,
            input.inputData,
          ),
        ),
      ),

    jobs: router({
      list: protectedProcedure
        .input(z.object({ status: jobStatusEnum.optional() }))
        .query(
          ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: { status?: 'pending' | 'processing' | 'completed' | 'failed' }
          }) => svc().query(new ListGenerationJobsQuery(ctx.tenantId, { status: input.status })),
        ),

      getDownloadUrl: protectedProcedure
        .input(z.object({ jobId: z.string().uuid() }))
        .query(({ ctx, input }: { ctx: AuthContext; input: { jobId: string } }) =>
          svc().query(new GetJobDownloadUrlQuery(ctx.tenantId, input.jobId)),
        ),
    }),
  })
}

// Static default for type inference — replaced at runtime by TrpcModule
export const documentsRouter = router({
  templates: router({
    list: publicProcedure.input(z.object({})).query(() => []),
    get: publicProcedure.input(z.object({})).query(() => null),
    create: publicProcedure.input(z.object({})).mutation(() => null),
  }),
  branding: router({
    get: publicProcedure.query(() => null),
    update: publicProcedure.input(z.object({})).mutation(() => null),
  }),
  generate: publicProcedure.input(z.object({})).mutation(() => null),
  jobs: router({
    list: publicProcedure.input(z.object({})).query(() => []),
    getDownloadUrl: publicProcedure.input(z.object({})).query(() => null),
  }),
})
```

- [ ] **Step 3: Register documentsRouter in app-router.ts**

Edit `apps/api/src/common/trpc/app-router.ts`.

Add import at top:

```ts
import { documentsRouter as defaultDocumentsRouter } from '../../modules/documents/interface/trpc/documents.router'
```

Add mutable reference after the other `let _*Router` variables:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _documentsRouter: any = defaultDocumentsRouter
```

Add setter function:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setDocumentsRouter(r: any): void {
  _documentsRouter = r
}
```

Add `documents: _documentsRouter` to the `buildAppRouter()` return:

```ts
return router({
  kernel: _kernelRouter,
  identity: identityWithAdmin,
  people: _peopleRouter,
  time: timeRouter,
  // ... all existing entries ...
  documents: _documentsRouter, // ADD THIS
})
```

- [ ] **Step 4: Wire into TrpcModule**

Edit `apps/api/src/common/trpc/trpc.module.ts`.

Add imports:

```ts
import { DocumentsModule } from '../../modules/documents/documents.module'
import { DocumentsRouterService } from '../../modules/documents/interface/trpc/documents-router.service'
import {
  createDocumentsRouter,
  setDocumentsRouter,
} from '../../modules/documents/interface/trpc/documents.router'
```

Add `DocumentsModule` to `@Module` imports array.

Add `DocumentsRouterService` injection to constructor.

In `onModuleInit()`, add after the existing `setAdminRouter(...)` call:

```ts
setDocumentsRouter(createDocumentsRouter(permissionProtectedProcedure))
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | grep -v "node_modules" | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/documents/interface/ \
        apps/api/src/common/trpc/app-router.ts \
        apps/api/src/common/trpc/trpc.module.ts
git commit -m "feat(documents): add tRPC router — templates, branding, generate, jobs"
```

---

## Task 12: Run all tests — verify full documents module

- [ ] **Step 1: Run all unit tests**

```bash
cd apps/api && bun run test:unit
```

Expected: all PASS. No failures.

- [ ] **Step 2: Run all integration tests**

```bash
cd apps/api && bun run test:integration
```

Expected: all PASS (requires docker postgres running with migrations applied).

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | grep -v "node_modules" | grep -v "^$" | head -20
```

Expected: no new errors.

---

## Completion Checklist

- [ ] `ITemplateRepository` has `findById` and `listByTenant`
- [ ] `IGenerationJobRepository` has `listByTenant`
- [ ] `ITenantBrandingRepository` port created
- [ ] `DrizzleTemplateRepository` — integration tested
- [ ] `DrizzleGenerationJobRepository` — integration tested
- [ ] `DrizzleTenantBrandingRepository` — integration tested
- [ ] `CreateTemplateHandler` — unit tested, validates slug uniqueness
- [ ] `UpdateBrandingHandler` — unit tested
- [ ] `ListTemplatesHandler`, `ListGenerationJobsHandler`, `GetGenerationJobHandler` — implemented
- [ ] `GetJobDownloadUrlHandler` — unit tested, checks job is completed
- [ ] `DocumentGenerateWorker` — unit tested, handles PDF/Excel, uploads to S3, publishes event
- [ ] `GenerateDocumentHandler` — enqueues pg-boss job
- [ ] `DocumentsModule` — no stubs, all real providers
- [ ] `documentsRouter` — full tRPC surface wired into `AppRouter`
- [ ] All unit + integration tests pass
