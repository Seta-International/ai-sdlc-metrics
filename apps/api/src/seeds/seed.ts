import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createDb } from '@future/db'
import { tenant } from '../modules/kernel/infrastructure/schema/tenant.schema'
import { actor } from '../modules/kernel/infrastructure/schema/actor.schema'
import { userIdentity } from '../modules/kernel/infrastructure/schema/user-identity.schema'
import { roleGrant } from '../modules/kernel/infrastructure/schema/role-grant.schema'
import { rolePermission } from '../modules/kernel/infrastructure/schema/role-permission.schema'
import { DEFAULT_ROLE_PERMISSIONS } from '../modules/kernel/domain/constants/default-role-permissions'

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256')
    .update('future-seed-v1:' + seed)
    .digest('hex')
  const p3 = '5' + hash.slice(13, 16) // version 5
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) // variant 10xx
  const p4 = variant + hash.slice(17, 20)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${p3}-${p4}-${hash.slice(20, 32)}`
}

interface RawEmployee {
  is_active: boolean
  is_admin: boolean
  is_pm: boolean
  id: string
  email: string
  company: string | null
  name: string
  direct_manager_id: string | null
}

interface RawData {
  data: RawEmployee[]
}

const TENANTS = [
  {
    slug: 'seta',
    name: 'SETA International',
    planTier: 'enterprise' as const,
    companySrc: 'SETA',
    domain: 'seta-international.vn',
  },
  {
    slug: 'blueoc',
    name: 'BlueOC',
    planTier: 'professional' as const,
    companySrc: 'BlueOC',
    domain: 'blueoc.tech',
  },
  {
    slug: 'aicycle',
    name: 'AIcycle',
    planTier: 'starter' as const,
    companySrc: 'AIcycle',
    domain: 'aicycle.ai',
  },
]

const SKIP_DOMAINS = ['yopmail', 'gmail']

const ROLE_OVERRIDES: Record<string, string[]> = {
  'canh.ta@seta-international.vn': ['tenant_admin', 'line_manager'],
}

function getEmailDomain(email: string): string | null {
  const atIdx = email.indexOf('@')
  if (atIdx === -1) return null
  return email.slice(atIdx + 1)
}

function shouldSkipEmail(email: string): boolean {
  if (!email.includes('@')) return true
  return SKIP_DOMAINS.some((d) => email.includes(d))
}

function assignTenant(emp: RawEmployee): (typeof TENANTS)[number] | null {
  if (shouldSkipEmail(emp.email)) return null

  if (emp.company !== null) {
    const match = TENANTS.find((t) => t.companySrc === emp.company)
    return match ?? null
  }

  const domain = getEmailDomain(emp.email)
  if (!domain) return null
  return TENANTS.find((t) => domain === t.domain) ?? null
}

async function main() {
  const db = createDb(
    process.env['DATABASE_URL'] ?? 'postgresql://future:future@localhost:5432/future_dev',
  )

  const rawPath = join(__dirname, 'data', 'employees-raw.json')
  const rawData = JSON.parse(readFileSync(rawPath, 'utf-8')) as RawData
  const employees = rawData.data

  const now = new Date()

  for (const tenantCfg of TENANTS) {
    const tenantId = deterministicUuid('tenant:' + tenantCfg.slug)
    const systemActorId = deterministicUuid('system:' + tenantCfg.slug)

    await db
      .insert(tenant)
      .values({
        id: tenantId,
        name: tenantCfg.name,
        slug: tenantCfg.slug,
        planTier: tenantCfg.planTier,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    await db
      .insert(actor)
      .values({
        id: systemActorId,
        tenantId,
        type: 'system',
        displayName: 'Seed System',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const tenantEmployees = employees.filter((e) => assignTenant(e)?.slug === tenantCfg.slug)

    for (const emp of tenantEmployees) {
      const actorId = deterministicUuid('actor:' + emp.email)
      const identityId = deterministicUuid('identity:' + emp.email)

      const roles: string[] =
        ROLE_OVERRIDES[emp.email] ??
        (emp.is_admin ? ['tenant_admin'] : emp.is_pm ? ['line_manager'] : ['employee'])

      await db
        .insert(actor)
        .values({
          id: actorId,
          tenantId,
          type: 'person',
          displayName: emp.name,
          status: emp.is_active ? 'active' : 'inactive',
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()

      await db
        .insert(userIdentity)
        .values({
          id: identityId,
          tenantId,
          actorId,
          email: emp.email,
          ssoSubject: emp.email,
          provider: 'local',
          status: 'active',
          createdAt: now,
        })
        .onConflictDoNothing()

      for (const role of roles) {
        await db
          .insert(roleGrant)
          .values({
            id: deterministicUuid('grant:' + emp.email + ':' + role),
            tenantId,
            actorId,
            roleKey: role as (typeof roleGrant.$inferInsert)['roleKey'],
            scopeType: 'global',
            scopeId: null,
            grantedBy: systemActorId,
            source: 'manual',
            validFrom: now,
          })
          .onConflictDoNothing()
      }
    }

    for (const [roleKey, entries] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const entry of entries) {
        await db
          .insert(rolePermission)
          .values({
            id: deterministicUuid(
              'perm:' + tenantCfg.slug + ':' + roleKey + ':' + entry.permissionKey,
            ),
            tenantId,
            roleKey: roleKey as (typeof rolePermission.$inferInsert)['roleKey'],
            permissionKey: entry.permissionKey,
            isLocked: entry.isLocked,
            createdAt: now,
          })
          .onConflictDoNothing()
      }
    }
  }

  console.log('Seed complete')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
