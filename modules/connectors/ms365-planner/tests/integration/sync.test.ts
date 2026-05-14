import { createPool } from '@seta/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPlannerSyncWorker } from '../../src/sync'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL required for integration tests')

const TENANT = '10000000-0000-0000-0000-000000000001'

let db: ReturnType<typeof createPool>
let raw: ReturnType<typeof createPool>

beforeAll(async () => {
  db = createPool(DATABASE_URL, { max: 2 })
  raw = createPool(DATABASE_URL, { max: 1 })
  await raw`DELETE FROM connector_ms365_planner.plan_members WHERE tenant_id = ${TENANT}::uuid`
  await raw`DELETE FROM connector_ms365_planner.planner_tasks_cache WHERE tenant_id = ${TENANT}::uuid`
  await raw`DELETE FROM connector_ms365_planner.planner_plans_cache WHERE tenant_id = ${TENANT}::uuid`
  await raw`DELETE FROM connector_ms365_planner.sync_watermarks WHERE tenant_id = ${TENANT}::uuid`
})

afterAll(async () => {
  await db.end()
  await raw.end()
})

describe('PlannerSyncWorker integration', () => {
  it('syncTenant: persists plan, task, member, and watermark rows', async () => {
    const stubGraph = {
      call: vi.fn().mockResolvedValue({
        data: {
          value: [
            {
              id: 'T-INTEG-1',
              planId: 'P-INTEG-1',
              assignments: { U1: {} },
              percentComplete: 0,
              priority: 1,
              title: 'Integration task',
            },
          ],
          '@odata.deltaLink':
            'https://graph.microsoft.com/v1.0/planner/plans/P-INTEG-1/tasks/delta?$deltatoken=integ-tok',
        },
        etag: null,
        status: 200,
      }),
      batch: vi.fn(),
      paginate: vi.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === '/planner/plans') {
          return (async function* () {
            yield { id: 'P-INTEG-1', owner: 'G-INTEG-1', title: 'Integration Plan' }
          })()
        }
        if (path === '/groups/G-INTEG-1/members') {
          return (async function* () {
            yield { id: 'U1', displayName: 'Test User' }
          })()
        }
        return (async function* () {})()
      }),
    }

    const worker = createPlannerSyncWorker({
      db,
      graph: stubGraph as never,
      getAppToken: async () => 'test-token',
    })

    await worker.syncTenant(TENANT)

    const plans = await raw`
      SELECT graph_plan_id, title FROM connector_ms365_planner.planner_plans_cache
      WHERE tenant_id = ${TENANT}::uuid
    `
    expect(plans).toHaveLength(1)
    expect(plans[0]?.graph_plan_id).toBe('P-INTEG-1')

    const tasks = await raw`
      SELECT graph_task_id, title, assignee_ids FROM connector_ms365_planner.planner_tasks_cache
      WHERE tenant_id = ${TENANT}::uuid
    `
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.graph_task_id).toBe('T-INTEG-1')
    expect(tasks[0]?.assignee_ids).toContain('U1')

    const members = await raw`
      SELECT user_id FROM connector_ms365_planner.plan_members
      WHERE tenant_id = ${TENANT}::uuid AND plan_id = 'P-INTEG-1'
    `
    expect(members).toHaveLength(1)
    expect(members[0]?.user_id).toBe('U1')

    const watermarks = await raw`
      SELECT delta_token FROM connector_ms365_planner.sync_watermarks
      WHERE tenant_id = ${TENANT}::uuid AND scope_kind = 'tasks' AND scope_id = 'P-INTEG-1'
    `
    expect(watermarks[0]?.delta_token).toBe('integ-tok')
  })

  it('syncTenant: uses stored delta token on second run', async () => {
    const callSpy = vi.fn().mockResolvedValue({
      data: {
        value: [],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/planner/plans/P-INTEG-1/tasks/delta?$deltatoken=integ-tok2',
      },
      etag: null,
      status: 200,
    })
    const stubGraph = {
      call: callSpy,
      batch: vi.fn(),
      paginate: vi.fn().mockImplementation(({ path }: { path: string }) => {
        if (path === '/planner/plans') {
          return (async function* () {
            yield { id: 'P-INTEG-1', owner: 'G-INTEG-1', title: 'Integration Plan' }
          })()
        }
        return (async function* () {})()
      }),
    }

    const worker = createPlannerSyncWorker({
      db,
      graph: stubGraph as never,
      getAppToken: async () => 'test-token',
    })
    await worker.syncTenant(TENANT)

    expect(callSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('$deltatoken=integ-tok'),
      }),
    )
  })
})
