import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import path from 'path'
import { uuidv7 } from 'uuidv7'
import { createDb, type Db } from '../index'

export const MIGRATIONS_DIR = path.join(__dirname, '../../drizzle/migrations')

export function createTestDb(): Db {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required for integration tests')
  }

  return createDb(url)
}

export async function migrateForTest(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required')
  }

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool)

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await pool.end()
  }
}

export async function truncateCoreSchema(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE core.role_permission, core.role_grant, core.user_identity, core.actor, core.department, core.tenant RESTART IDENTITY CASCADE`,
  )
}

export async function setTenantContext(db: Db, tenantId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`)
}

export async function seedTenant(
  db: Db,
  overrides: Partial<{
    id: string
    name: string
    slug: string
    planTier: string
  }> = {},
): Promise<{ id: string; name: string; slug: string }> {
  const id = overrides.id ?? uuidv7()
  const name = overrides.name ?? `Test Tenant ${id.slice(0, 8)}`
  const slug = overrides.slug ?? `test-${id.slice(0, 8)}`
  const planTier = overrides.planTier ?? 'starter'

  await db.execute(
    sql`INSERT INTO core.tenant (id, name, slug, status, plan_tier, created_at, updated_at)
        VALUES (${id}, ${name}, ${slug}, 'active', ${planTier}, NOW(), NOW())`,
  )

  return { id, name, slug }
}

export async function seedActor(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    type: string
    displayName: string
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const type = overrides.type ?? 'person'
  const displayName = overrides.displayName ?? `Test Actor ${id.slice(0, 8)}`
  const status = overrides.status ?? 'active'

  await db.execute(
    sql`INSERT INTO core.actor (id, tenant_id, type, display_name, status, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${type}, ${displayName}, ${status}, NOW(), NOW())`,
  )

  return { id, tenantId }
}

export async function truncatePeopleSchema(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE
      people.employment_profile,
      people.employment_profile_detail,
      people.profile_section,
      people.profile_change_request,
      people.periodic_profile_review,
      people.onboarding_template,
      people.onboarding_task_template,
      people.onboarding_case,
      people.onboarding_task,
      people.offboarding_template,
      people.offboarding_task_template,
      people.offboarding_case,
      people.offboarding_task,
      people.account_membership,
      people.contract_version
    RESTART IDENTITY CASCADE`,
  )
}

export async function seedEmploymentProfile(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    actorId: string
    employeeCode: string
    companyEmail: string
    employmentType: string
    employmentStatus: string
    workArrangement: string
    hireDate: string
    jobTitle: string
  }> = {},
): Promise<{ id: string; tenantId: string; actorId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const actorId = overrides.actorId ?? uuidv7()
  const employeeCode = overrides.employeeCode ?? `SETA-${id.slice(0, 8).toUpperCase()}`
  const companyEmail = overrides.companyEmail ?? `employee-${id.slice(0, 8)}@seta-international.vn`
  const employmentType = overrides.employmentType ?? 'permanent'
  const employmentStatus = overrides.employmentStatus ?? 'active'
  const workArrangement = overrides.workArrangement ?? 'onsite'
  const hireDate = overrides.hireDate ?? new Date().toISOString()
  const jobTitle = overrides.jobTitle ?? 'Software Engineer'

  await db.execute(
    sql`INSERT INTO people.employment_profile
      (id, tenant_id, actor_id, employee_code, company_email, employment_type, employment_status, work_arrangement, hire_date, job_title, created_at, updated_at)
      VALUES (${id}, ${tenantId}, ${actorId}, ${employeeCode}, ${companyEmail}, ${employmentType}, ${employmentStatus}, ${workArrangement}, ${hireDate}, ${jobTitle}, NOW(), NOW())`,
  )

  return { id, tenantId, actorId }
}

export async function truncateProjectsSchema(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE
      projects.allocation,
      projects.project_role,
      projects.project,
      projects.account
    RESTART IDENTITY CASCADE`,
  )
}

export async function seedAccount(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    name: string
    clientCompany: string
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const name = overrides.name ?? `Test Account ${id.slice(0, 8)}`
  const clientCompany = overrides.clientCompany ?? 'Test Client'
  const status = overrides.status ?? 'active'

  await db.execute(
    sql`INSERT INTO projects.account
        (id, tenant_id, name, client_company, status, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${name}, ${clientCompany}, ${status}, NOW(), NOW())`,
  )

  return { id, tenantId }
}

export async function seedProject(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    accountId: string
    name: string
    code: string
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string; accountId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const accountId = overrides.accountId ?? uuidv7()
  const name = overrides.name ?? `Test Project ${id.slice(0, 8)}`
  const code = overrides.code ?? `PRJ-${id.slice(0, 4)}`
  const status = overrides.status ?? 'active'

  await db.execute(
    sql`INSERT INTO projects.project
        (id, tenant_id, account_id, name, code, status, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${accountId}, ${name}, ${code}, ${status}, NOW(), NOW())`,
  )

  return { id, tenantId, accountId }
}

export async function seedProjectRole(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    projectId: string
    roleName: string
    headcount: number
    status: string
  }> = {},
): Promise<{ id: string; tenantId: string; projectId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const projectId = overrides.projectId ?? uuidv7()
  const roleName = overrides.roleName ?? 'Developer'
  const headcount = overrides.headcount ?? 1
  const status = overrides.status ?? 'open'

  await db.execute(
    sql`INSERT INTO projects.project_role
        (id, tenant_id, project_id, role_name, headcount, status, created_at)
        VALUES (${id}, ${tenantId}, ${projectId}, ${roleName}, ${headcount}, ${status}, NOW())`,
  )

  return { id, tenantId, projectId }
}

export async function seedAllocation(
  db: Db,
  overrides: Partial<{
    id: string
    tenantId: string
    projectId: string
    projectRoleId: string
    actorId: string | null
    hoursPerDay: string
    billingType: string
    memberType: string
    status: string
    startedAt: Date
    endedAt: Date | null
  }> = {},
): Promise<{ id: string; tenantId: string }> {
  const id = overrides.id ?? uuidv7()
  const tenantId = overrides.tenantId ?? uuidv7()
  const projectId = overrides.projectId ?? uuidv7()
  const projectRoleId = overrides.projectRoleId ?? uuidv7()
  const actorId = overrides.actorId ?? null
  const hoursPerDay = overrides.hoursPerDay ?? '8.00'
  const billingType = overrides.billingType ?? 'billable'
  const memberType = overrides.memberType ?? 'core'
  const status = overrides.status ?? 'tentative'
  const startedAt = overrides.startedAt ?? new Date()
  const endedAt = overrides.endedAt ?? null

  await db.execute(
    sql`INSERT INTO projects.allocation
        (id, tenant_id, project_id, project_role_id, actor_id, hours_per_day,
         billing_type, member_type, status, started_at, ended_at, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${projectId}, ${projectRoleId}, ${actorId},
                ${hoursPerDay}, ${billingType}, ${memberType}, ${status},
                ${startedAt}, ${endedAt}, NOW(), NOW())`,
  )

  return { id, tenantId }
}
