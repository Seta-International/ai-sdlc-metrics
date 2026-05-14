import { createAuditWriter } from '@seta/audit'
import { createPool } from '@seta/db'
import { createGraphFetch } from '@seta/ms-graph'
import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDispatch, DATABASE_URL, TEST_TENANT_ID, truncatePlannerData } from './_harness'
import { mswPlanner, TEST_PLAN_ID, TEST_TASK_ID } from './_msw-planner'

describe('update_tasks: preview → commit round trip', () => {
  const sql = createPool(DATABASE_URL)
  let capturedBatchRequests: Array<{
    id: string
    method: string
    url: string
    headers?: Record<string, string>
  }> = []

  beforeAll(() => mswPlanner.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => mswPlanner.resetHandlers())
  afterAll(async () => {
    mswPlanner.close()
    await sql.end()
  })

  beforeEach(async () => {
    await truncatePlannerData(sql)
    capturedBatchRequests = []
  })

  it('preview mints token; commit PATCHes with If-Match; cache + audit updated', async () => {
    // 1. Seed task in cache
    await sql`
      INSERT INTO connector_ms365_planner.planner_tasks_cache
        (tenant_id, graph_task_id, plan_id, title, percent_complete, etag, raw, synced_at)
      VALUES (
        ${TEST_TENANT_ID}, ${TEST_TASK_ID}, ${TEST_PLAN_ID},
        'Original Title', 0, 'W/"etag-init"',
        ${{ id: TEST_TASK_ID, title: 'Original Title' }}::jsonb,
        NOW()
      )
    `

    // 2. Override $batch handler to capture sub-request headers and return new etag
    mswPlanner.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', async ({ request }) => {
        const body = (await request.json()) as {
          requests: Array<{
            id: string
            method: string
            url: string
            headers?: Record<string, string>
          }>
        }
        capturedBatchRequests = body.requests

        const responses = body.requests.map((req) => ({
          id: req.id,
          status: 200,
          body: {
            '@odata.etag': 'W/"etag-updated"',
            id: req.id,
            title: 'Updated Title',
            percentComplete: 0,
          },
        }))
        return HttpResponse.json({ responses })
      }),
    )

    const audit = createAuditWriter(sql)
    const graph = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })
    const dispatch = createDispatch(graph, sql)

    // 3. Preview
    const previewResult = (await dispatch('planner.update_tasks.preview', {
      updates: [{ taskId: TEST_TASK_ID, title: 'Updated Title' }],
    })) as { ok: boolean; value?: { token: string; card: unknown; ttlMinutes: number } }

    expect(previewResult.ok).toBe(true)
    expect(previewResult.value?.token).toBeTruthy()
    const token = previewResult.value?.token as string

    // Assert continuation row exists and is unconsumed
    const [contRow] = await sql`
      SELECT consumed_at FROM agent.write_continuations WHERE token = ${token}
    `
    expect(contRow).toBeDefined()
    expect(contRow.consumed_at).toBeNull()

    // 4. Commit
    const commitResult = (await dispatch('planner.update_tasks.commit', { token })) as {
      ok: boolean
      value?: {
        results: Array<{ taskId: string; status: string }>
        summary: { succeeded: number; failed: number }
      }
    }

    expect(commitResult.ok).toBe(true)
    expect(commitResult.value?.results[0]?.status).toBe('ok')

    // Assert $batch was called with a PATCH sub-request that carries If-Match header
    const patchReq = capturedBatchRequests.find(
      (r) => r.method === 'PATCH' && r.url === `/planner/tasks/${TEST_TASK_ID}`,
    )
    expect(patchReq).toBeDefined()
    expect(patchReq?.headers?.['If-Match']).toBe('W/"etag-init"')

    // Assert cache was updated with new etag
    const [cacheRow] = await sql`
      SELECT etag, title FROM connector_ms365_planner.planner_tasks_cache
      WHERE tenant_id = ${TEST_TENANT_ID} AND graph_task_id = ${TEST_TASK_ID}
    `
    expect(cacheRow?.etag).toBe('W/"etag-updated"')

    // Assert continuation consumed
    const [contRowAfter] = await sql`
      SELECT consumed_at FROM agent.write_continuations WHERE token = ${token}
    `
    expect(contRowAfter?.consumed_at).not.toBeNull()

    // Assert audit rows exist (at least one for the graph PATCH via $batch)
    const [{ count }] = await sql`
      SELECT COUNT(*) AS count FROM audit.audit_log WHERE tenant_id = ${TEST_TENANT_ID}
    `
    expect(Number(count)).toBeGreaterThanOrEqual(2)
  })
})
