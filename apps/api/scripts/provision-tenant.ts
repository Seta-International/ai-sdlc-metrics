import { createDb } from '@future/db'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'

type PlanTier = 'starter' | 'professional' | 'enterprise'

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function requireArg(flag: string, name: string): string {
  const value = getArg(flag)
  if (!value) {
    throw new Error(`Missing required argument: ${flag} (${name})`)
  }

  return value
}

async function main(): Promise<void> {
  const name = requireArg('--name', 'tenant name')
  const slug = requireArg('--slug', 'tenant slug')
  const plan = requireArg('--plan', 'plan tier') as PlanTier
  const adminName = requireArg('--admin-name', 'admin display name')
  const adminEmail = requireArg('--admin-email', 'admin email')

  const validPlans: PlanTier[] = ['starter', 'professional', 'enterprise']
  if (!validPlans.includes(plan)) {
    throw new Error(`Invalid plan tier "${plan}". Must be one of: ${validPlans.join(', ')}`)
  }

  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }

  const db = createDb(connectionString)

  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM core.tenant WHERE slug = ${slug} LIMIT 1`,
  )

  if (existing.rowCount > 0) {
    console.log(
      `[provision] Tenant "${slug}" already exists (id: ${existing.rows[0]?.id}). Skipping.`,
    )
    process.exit(0)
  }

  const tenantId = uuidv7()
  const botActorId = uuidv7()
  const adminActorId = uuidv7()
  const adminIdentityId = uuidv7()
  const adminGrantId = uuidv7()

  console.log(`[provision] Creating tenant "${name}" (${slug})...`)

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO core.tenant (id, name, slug, status, plan_tier, created_at, updated_at)
          VALUES (${tenantId}, ${name}, ${slug}, 'active', ${plan}, NOW(), NOW())`,
    )

    await tx.execute(
      sql`INSERT INTO core.actor (id, tenant_id, type, display_name, status, created_at, updated_at)
          VALUES (${botActorId}, ${tenantId}, 'system', ${`${slug}-platform-bot`}, 'active', NOW(), NOW())`,
    )

    await tx.execute(
      sql`INSERT INTO core.actor (id, tenant_id, type, display_name, status, created_at, updated_at)
          VALUES (${adminActorId}, ${tenantId}, 'person', ${adminName}, 'invited', NOW(), NOW())`,
    )

    await tx.execute(
      sql`INSERT INTO core.user_identity (id, tenant_id, actor_id, email, sso_subject, provider, status, created_at)
          VALUES (${adminIdentityId}, ${tenantId}, ${adminActorId}, ${adminEmail}, ${'pending-sso-' + adminActorId}, 'microsoft', 'active', NOW())`,
    )

    await tx.execute(
      sql`INSERT INTO core.role_grant (id, tenant_id, actor_id, role_key, scope_type, scope_id, granted_by, valid_from)
          VALUES (${adminGrantId}, ${tenantId}, ${adminActorId}, 'tenant_admin', 'global', NULL, ${botActorId}, NOW())`,
    )
  })

  console.log('[provision] Done.')
  console.log(`  tenant_id:         ${tenantId}`)
  console.log(`  bot_actor_id:      ${botActorId}`)
  console.log(`  admin_actor_id:    ${adminActorId}`)
  console.log(`  admin_identity_id: ${adminIdentityId}`)
  console.log(`  admin_grant_id:    ${adminGrantId}`)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error('[provision] Error:', message)
  process.exit(1)
})
