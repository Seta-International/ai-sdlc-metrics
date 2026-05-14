import { createAuditWriter } from '@seta/audit'
import { createPool } from '@seta/db'
import { createGraphFetch } from '@seta/ms-graph'
import { HttpResponse, http } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDispatch, DATABASE_URL, TEST_TENANT_ID, truncatePlannerData } from './_harness'
import { mswPlanner, TEST_PLAN_ID } from './_msw-planner'

describe('update_tasks: partial failure + idempotent re-commit + token tamper', () => {
  const sql = createPool(DATABASE_URL)

  beforeAll(() => mswPlanner.listen({ onUnhandledRequest: 'warn' }))
  afterEach(() => mswPlanner.resetHandlers())
  afterAll(async () => {
    mswPlanner.close()
    await sql.end()
  })

  beforeEach(async () => {
    await truncatePlannerData(sql)
  })

  async function seedTask(taskId: string, etag: string): Promise<void> {
    await sql`
      INSERT INTO connector_ms365_planner.planner_tasks_cache
        (tenant_id, graph_task_id, plan_id, title, percent_complete, etag, raw, synced_at)
      VALUES (
        ${TEST_TENANT_ID}, ${taskId}, ${TEST_PLAN_ID},
        ${`Task ${taskId}`}, 0, ${etag},
        ${{ id: taskId }}::jsonb,
        NOW()
      )
    `
  }

  it('partial batch failure: 412 on 2nd task classifies correctly, 2/3 cache rows updated', async () => {
    // Seed 3 tasks in planner_tasks_cache
    await seedTask('task-A', 'W/"etag-A-v1"')
    await seedTask('task-B', 'W/"etag-B-v1"')
    await seedTask('task-C', 'W/"etag-C-v1"')

    // Override $batch handler: 200 for task-A, 412 for task-B, 200 for task-C
    mswPlanner.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', async ({ request }) => {
        const body = (await request.json()) as { requests: Array<{ id: string }> }
        const responses = body.requests.map((req) => {
          if (req.id === 'task-B') {
            return { id: req.id, status: 412, body: {} }
          }
          return {
            id: req.id,
            status: 200,
            body: { '@odata.etag': `W/"etag-${req.id}-v2"`, id: req.id, title: 'Updated' },
          }
        })
        return HttpResponse.json({ responses })
      }),
    )

    const audit = createAuditWriter(sql)
    const graph = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })
    const dispatch = createDispatch(graph, sql)

    // Preview all 3 tasks
    const previewResult = (await dispatch('planner.update_tasks.preview', {
      updates: [
        { taskId: 'task-A', title: 'Updated A' },
        { taskId: 'task-B', title: 'Updated B' },
        { taskId: 'task-C', title: 'Updated C' },
      ],
    })) as { ok: boolean; value?: { token: string } }

    expect(previewResult.ok).toBe(true)
    const token = previewResult.value?.token as string

    // Commit with the token
    const commitResult = (await dispatch('planner.update_tasks.commit', { token })) as {
      ok: boolean
      value?: {
        results: Array<{ taskId: string; status: string }>
        summary: { succeeded: number; failed: number }
      }
    }

    // Partial success is still ok
    expect(commitResult.ok).toBe(true)
    const results = commitResult.value?.results ?? []

    // Find results by taskId (order may vary)
    const resultA = results.find((r) => r.taskId === 'task-A')
    const resultB = results.find((r) => r.taskId === 'task-B')
    const resultC = results.find((r) => r.taskId === 'task-C')

    expect(resultA?.status).toBe('ok')
    expect(resultB?.status).toBe('conflict')
    expect(resultC?.status).toBe('ok')

    // Cache row for task-A has etag updated
    const [rowA] = await sql`
      SELECT etag FROM connector_ms365_planner.planner_tasks_cache
      WHERE tenant_id = ${TEST_TENANT_ID} AND graph_task_id = 'task-A'
    `
    expect(rowA?.etag).toBe('W/"etag-task-A-v2"')

    // Cache row for task-C has etag updated
    const [rowC] = await sql`
      SELECT etag FROM connector_ms365_planner.planner_tasks_cache
      WHERE tenant_id = ${TEST_TENANT_ID} AND graph_task_id = 'task-C'
    `
    expect(rowC?.etag).toBe('W/"etag-task-C-v2"')

    // Cache row for task-B etag is still the original (no update since 412)
    const [rowB] = await sql`
      SELECT etag FROM connector_ms365_planner.planner_tasks_cache
      WHERE tenant_id = ${TEST_TENANT_ID} AND graph_task_id = 'task-B'
    `
    expect(rowB?.etag).toBe('W/"etag-B-v1"')
  })

  it('idempotent re-commit: second commit returns cached result, msw called only once', async () => {
    await seedTask('task-X', 'W/"etag-X-v1"')

    let batchCallCount = 0
    mswPlanner.use(
      http.post('https://graph.microsoft.com/v1.0/$batch', async ({ request }) => {
        batchCallCount++
        const body = (await request.json()) as { requests: Array<{ id: string }> }
        const responses = body.requests.map((req) => ({
          id: req.id,
          status: 200,
          body: { '@odata.etag': `W/"etag-${req.id}-v2"`, id: req.id, title: 'Updated' },
        }))
        return HttpResponse.json({ responses })
      }),
    )

    const audit = createAuditWriter(sql)
    const graph = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })
    const dispatch = createDispatch(graph, sql)

    // Preview and get token
    const previewResult = (await dispatch('planner.update_tasks.preview', {
      updates: [{ taskId: 'task-X', title: 'Updated X' }],
    })) as { ok: boolean; value?: { token: string } }

    expect(previewResult.ok).toBe(true)
    const token = previewResult.value?.token as string

    // First commit
    const firstCommit = (await dispatch('planner.update_tasks.commit', { token })) as {
      ok: boolean
      value?: { card: unknown; results: Array<{ taskId: string; status: string }> }
    }
    expect(firstCommit.ok).toBe(true)
    expect(batchCallCount).toBe(1)

    // Second commit with the SAME token
    const secondCommit = (await dispatch('planner.update_tasks.commit', { token })) as {
      ok: boolean
      value?: { card: unknown; results: Array<{ taskId: string; status: string }> }
    }

    // Second commit should succeed (idempotent)
    expect(secondCommit.ok).toBe(true)

    // msw received only 1 batch call total (not 2)
    expect(batchCallCount).toBe(1)

    // Second commit returns the cached result card
    expect(secondCommit.value?.card).toEqual(firstCommit.value?.card)
  })

  it('token tamper: altered HMAC is rejected with ContinuationBadHmac', async () => {
    await seedTask('task-Y', 'W/"etag-Y-v1"')

    const audit = createAuditWriter(sql)
    const graph = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })
    const dispatch = createDispatch(graph, sql)

    // Preview and get a valid token
    const previewResult = (await dispatch('planner.update_tasks.preview', {
      updates: [{ taskId: 'task-Y', title: 'Updated Y' }],
    })) as { ok: boolean; value?: { token: string } }

    expect(previewResult.ok).toBe(true)
    const token = previewResult.value?.token as string

    // Alter the token: the token format is <uuid>.<hmacSig>
    // Split on the last dot to get the HMAC segment and tamper it
    const dotIdx = token.lastIndexOf('.')
    const uuidPart = token.slice(0, dotIdx)
    const hmacPart = token.slice(dotIdx + 1)
    const tamperedHmac = hmacPart[0] === 'x' ? 'y' + hmacPart.slice(1) : 'x' + hmacPart.slice(1)
    const tamperedToken = `${uuidPart}.${tamperedHmac}`

    // Commit with the tampered token
    const commitResult = (await dispatch('planner.update_tasks.commit', {
      token: tamperedToken,
    })) as {
      ok: boolean
      error?: { name: string; message: string }
    }

    expect(commitResult.ok).toBe(false)
    // ContinuationBadHmac constructor message is 'continuation signature invalid'
    expect(commitResult.error?.message).toBe('continuation signature invalid')
  })
})
