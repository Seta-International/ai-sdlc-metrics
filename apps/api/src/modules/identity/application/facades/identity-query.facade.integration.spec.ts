/**
 * Integration test for the new IdentityQueryFacade methods that delegate to
 * KernelQueryFacade. Exercises the wiring from facade → KernelQueryFacade → handler → DB.
 *
 * The kernel-layer handler is exercised directly here to avoid importing kernel
 * infrastructure from the identity module. KernelQueryFacade is the only
 * permitted cross-module import.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  createTestDb,
  migrateForTest,
  seedActor,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { uuidv7 } from 'uuidv7'
import { QueryBus } from '@nestjs/cqrs'
import { vi } from 'vitest'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { GetUserIdentityByActorIdHandler } from '../../../kernel/application/queries/get-user-identity-by-actor-id.handler'
import { GetUserIdentityByActorIdQuery } from '../../../kernel/application/queries/get-user-identity-by-actor-id.query'
import { GetUserIdentityBySsoSubjectQuery } from '../../../kernel/application/queries/get-user-identity-by-sso-subject.query'
import { IdentityQueryFacade } from './identity-query.facade'

const TENANT = '01900000-0000-7fff-8000-000000000070'

async function seedUserIdentity(
  db: ReturnType<typeof createTestDb>,
  data: {
    tenantId: string
    actorId: string
    email: string
    ssoSubject: string
    provider?: string
  },
): Promise<{ id: string }> {
  const id = uuidv7()
  await db.execute(
    sql`INSERT INTO core.user_identity
        (id, tenant_id, actor_id, email, sso_subject, provider, status, created_at)
        VALUES (
          ${id},
          ${data.tenantId},
          ${data.actorId},
          ${data.email},
          ${data.ssoSubject},
          ${data.provider ?? 'microsoft'},
          'active',
          NOW()
        )`,
  )
  return { id }
}

describe('IdentityQueryFacade — getExternalUserId / getActorIdByExternalUserId (integration)', () => {
  const db = createTestDb()
  let facade: IdentityQueryFacade
  let actorId: string

  const SSO_SUBJECT = 'aad-oid-facade-integration-test-001'

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT, slug: 'facade-integration-tenant' })
    await setTenantContext(db, TENANT)

    const actor = await seedActor(db, { tenantId: TENANT, type: 'person' })
    actorId = actor.id

    await seedUserIdentity(db, {
      tenantId: TENANT,
      actorId,
      email: 'facade-test@example.com',
      ssoSubject: SSO_SUBJECT,
    })

    // Wire up the real GetUserIdentityByActorIdHandler directly.
    // The repository is constructed inline (not imported from kernel/infrastructure/) to
    // respect the module boundary rule — identity tests must not import kernel infra paths.
    const inlineRepo = {
      findByActorId: async (actorId: string, tenantId: string) => {
        const rows = await db.execute(
          sql`SELECT id, tenant_id, actor_id, email, sso_subject, provider, status, last_login_at, created_at
              FROM core.user_identity
              WHERE actor_id = ${actorId} AND tenant_id = ${tenantId}
              LIMIT 1`,
        )
        const row = rows.rows[0] as
          | {
              id: string
              tenant_id: string
              actor_id: string
              email: string
              sso_subject: string
              provider: string
              status: string
              last_login_at: Date | null
              created_at: Date
            }
          | undefined
        if (!row) return null
        return {
          id: row.id,
          tenantId: row.tenant_id,
          actorId: row.actor_id,
          email: row.email,
          ssoSubject: row.sso_subject,
          provider: row.provider as 'microsoft' | 'google' | 'local',
          status: row.status as 'active' | 'suspended' | 'deprovisioned',
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at,
        }
      },
    }
    const actorIdHandler = new GetUserIdentityByActorIdHandler(inlineRepo as never)

    const queryBus = {
      execute: vi.fn().mockImplementation(async (query) => {
        if (query instanceof GetUserIdentityByActorIdQuery) {
          return actorIdHandler.execute(query)
        }
        if (query instanceof GetUserIdentityBySsoSubjectQuery) {
          // Query DB inline — importing DrizzleUserIdentityRepository would violate the kernel/infrastructure/ boundary rule (CLAUDE.md)
          const rows = await db.execute(
            sql`SELECT actor_id FROM core.user_identity
                WHERE sso_subject = ${query.ssoSubject}
                  AND tenant_id = ${query.tenantId}
                LIMIT 1`,
          )
          const row = rows.rows[0] as { actor_id: string } | undefined
          if (!row) return null
          return {
            actorId: row.actor_id,
            ssoSubject: query.ssoSubject,
            tenantId: query.tenantId,
          }
        }
        return null
      }),
    } as unknown as QueryBus

    const kernelQueryFacade = new KernelQueryFacade(queryBus)

    const identityQueryBus = { execute: vi.fn() } as unknown as QueryBus
    facade = new IdentityQueryFacade(identityQueryBus, kernelQueryFacade)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  describe('getExternalUserId', () => {
    it('returns the ssoSubject for a known actor', async () => {
      await setTenantContext(db, TENANT)
      const result = await facade.getExternalUserId(actorId, TENANT)
      expect(result).toBe(SSO_SUBJECT)
    })

    it('returns null for an unknown actor', async () => {
      await setTenantContext(db, TENANT)
      const result = await facade.getExternalUserId('00000000-0000-0000-0000-000000000000', TENANT)
      expect(result).toBeNull()
    })
  })

  describe('getActorIdByExternalUserId', () => {
    it('returns actorId for a known SSO subject', async () => {
      await setTenantContext(db, TENANT)
      const result = await facade.getActorIdByExternalUserId(SSO_SUBJECT, TENANT)
      expect(result).toBe(actorId)
    })

    it('returns null for an unknown SSO subject', async () => {
      await setTenantContext(db, TENANT)
      const result = await facade.getActorIdByExternalUserId('unknown-oid', TENANT)
      expect(result).toBeNull()
    })
  })
})
