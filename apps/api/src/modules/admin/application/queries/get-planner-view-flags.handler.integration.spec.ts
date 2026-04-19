import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest'
import { uuidv7 } from 'uuidv7'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { GetPlannerViewFlagsHandler } from './get-planner-view-flags.handler'
import { GetPlannerViewFlagsQuery } from './get-planner-view-flags.query'

const TENANT_ID = '01900000-ff03-7fff-8000-000000003001'

async function truncateAdminSettings(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE admin.tenant_settings RESTART IDENTITY CASCADE`)
}

describe('GetPlannerViewFlagsHandler — integration', () => {
  const db = createTestDb() as Db
  let handler: GetPlannerViewFlagsHandler

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_ID, slug: 'view-flags-test-tenant' })
    handler = new GetPlannerViewFlagsHandler(db as never)
  })

  afterAll(async () => {
    await truncateAdminSettings(db)
    await truncateCoreSchema(db)
  })

  beforeEach(async () => {
    await truncateAdminSettings(db)
  })

  describe('when tenant_settings row exists with planner_views_enabled = true', () => {
    it('returns viewsEnabled=true and all other view flags false', async () => {
      await db.execute(
        sql`INSERT INTO admin.tenant_settings (id, tenant_id, planner_core_enabled, planner_views_enabled, planner_grid_enabled, planner_schedule_enabled, planner_charts_enabled, created_at, updated_at)
            VALUES (${uuidv7()}, ${TENANT_ID}, false, true, false, false, false, NOW(), NOW())`,
      )

      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))

      expect(result.viewsEnabled).toBe(true)
      expect(result.gridEnabled).toBe(false)
      expect(result.scheduleEnabled).toBe(false)
      expect(result.chartsEnabled).toBe(false)
    })
  })

  describe('when no tenant_settings row exists', () => {
    it('returns all flags as false', async () => {
      const result = await handler.execute(new GetPlannerViewFlagsQuery(TENANT_ID))

      expect(result.viewsEnabled).toBe(false)
      expect(result.gridEnabled).toBe(false)
      expect(result.scheduleEnabled).toBe(false)
      expect(result.chartsEnabled).toBe(false)
    })
  })
})
