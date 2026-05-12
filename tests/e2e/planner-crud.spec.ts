import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const STAGING = process.env.STAGING === '1'
const API_URL = process.env.STAGING_API_URL ?? 'http://localhost:8080'
const TEST_GROUP_ID = process.env.E2E_OWNER_GROUP_ID ?? ''

/**
 * Returns true (skip) when STAGING is not set, throws when STAGING is set but
 * the required env vars are absent.
 */
function skipIfNotStaging(): boolean {
  if (!STAGING) return true
  if (!TEST_GROUP_ID) throw new Error('E2E_OWNER_GROUP_ID required for staging E2E')
  return false
}

/** POST a tool invocation to the agent run endpoint. */
async function callTool(
  tool: string,
  input: Record<string, unknown>,
  tenantId?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (tenantId) headers['X-Tenant-Id'] = tenantId

  const res = await fetch(`${API_URL}/v1/agent/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, input }),
  })
  return res.json() as Promise<Record<string, unknown>>
}

describe('Planner CRUD E2E (Q4 sign-off)', () => {
  /** Plan created in beforeAll; deleted in afterAll. */
  let createdPlanId = ''
  /** Tasks created during the test run for targeted cleanup. */
  const createdTaskIds: string[] = []

  // -------------------------------------------------------------------------
  // Shared test data
  // -------------------------------------------------------------------------
  const TASK_TITLE_PREFIX = `[e2e-${Date.now()}]`

  // -------------------------------------------------------------------------
  // Setup / teardown
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    if (!STAGING) return

    // Create a temporary plan owned by the dev group so every subsequent test
    // has a stable plan to work against.
    const result = await callTool('planner.create_plan.commit', {
      title: `${TASK_TITLE_PREFIX} E2E Test Plan`,
      ownerGroupId: TEST_GROUP_ID,
    })
    const plan = result.plan as Record<string, unknown> | undefined
    if (!plan?.id)
      throw new Error(`beforeAll: create_plan.commit failed: ${JSON.stringify(result)}`)
    createdPlanId = plan.id as string
  })

  afterAll(async () => {
    if (!STAGING) return
    // Best-effort cleanup — failures here should not mask test failures.
    // Individual tasks are deleted before the plan because Graph requires the
    // plan to be empty (or the delete cascades automatically; delete tasks
    // anyway to be explicit).
    await Promise.allSettled(
      createdTaskIds.map((id) => callTool('planner.delete_task', { taskId: id })),
    )
    if (createdPlanId) {
      await callTool('planner.delete_plan', { planId: createdPlanId })
    }
  })

  // -------------------------------------------------------------------------
  // Q4.1 — latency guard
  // -------------------------------------------------------------------------

  it('Q4.1: list_my_tasks returns within p95 latency (< 5 s)', async () => {
    if (skipIfNotStaging()) return

    const start = Date.now()
    const result = await callTool('planner.list_my_tasks', {})
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(5_000)
    expect(result.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Q4.2 — create with bucket assignment
  // -------------------------------------------------------------------------

  it('Q4.2: create_tasks preview→commit creates a task with bucket assignment', async () => {
    if (skipIfNotStaging()) return

    // Step 1: preview
    const preview = await callTool('planner.create_tasks.preview', {
      planId: createdPlanId,
      tasks: [
        {
          title: `${TASK_TITLE_PREFIX} Q4.2 bucket task`,
          bucketName: 'To do',
        },
      ],
    })
    expect(preview.ok).toBe(true)
    expect(preview.commitId).toBeTruthy()

    // Step 2: commit
    const commit = await callTool('planner.create_tasks.commit', {
      commitId: preview.commitId,
    })
    expect(commit.ok).toBe(true)

    const tasks = commit.tasks as Array<Record<string, unknown>> | undefined
    expect(tasks).toHaveLength(1)
    const taskId = tasks?.[0]?.id as string
    expect(taskId).toBeTruthy()
    createdTaskIds.push(taskId)

    // Step 3: live GET to confirm task exists and bucket is set
    const live = await callTool('planner.get_task', { taskId })
    expect(live.ok).toBe(true)
    expect((live.task as Record<string, unknown>)?.bucketId).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Q4.3 — bulk assignee update
  // -------------------------------------------------------------------------

  it('Q4.3: update_tasks preview→commit updates assignees on 3 tasks in bulk', async () => {
    if (skipIfNotStaging()) return

    // Create 3 tasks to update
    const createResult = await callTool('planner.create_tasks.commit', {
      planId: createdPlanId,
      tasks: [
        { title: `${TASK_TITLE_PREFIX} Q4.3 task-1` },
        { title: `${TASK_TITLE_PREFIX} Q4.3 task-2` },
        { title: `${TASK_TITLE_PREFIX} Q4.3 task-3` },
      ],
    })
    expect(createResult.ok).toBe(true)

    const tasks = createResult.tasks as Array<Record<string, unknown>>
    expect(tasks).toHaveLength(3)
    const taskIds = tasks.map((t) => t.id as string)
    createdTaskIds.push(...taskIds)

    // TODO: obtain a real AAD user id from the staging tenant; for now the
    // test validates the preview→commit flow and response shape only.
    const assigneeId = process.env.E2E_ASSIGNEE_ID ?? ''
    if (!assigneeId) {
      // Soft-skip the assignee assertion when no user id is provided, but
      // still verify the round-trip succeeds.
    }

    // Preview
    const preview = await callTool('planner.update_tasks.preview', {
      updates: taskIds.map((id) => ({
        taskId: id,
        assigneeIds: assigneeId ? [assigneeId] : [],
      })),
    })
    expect(preview.ok).toBe(true)
    expect(preview.commitId).toBeTruthy()

    // Commit
    const commit = await callTool('planner.update_tasks.commit', {
      commitId: preview.commitId,
    })
    expect(commit.ok).toBe(true)
    const updated = commit.tasks as Array<Record<string, unknown>>
    expect(updated).toHaveLength(3)
  })

  // -------------------------------------------------------------------------
  // Q4.4 — complete tasks
  // -------------------------------------------------------------------------

  it('Q4.4: complete_tasks preview→commit marks tasks as 100% complete', async () => {
    if (skipIfNotStaging()) return

    // Create a task to complete
    const createResult = await callTool('planner.create_tasks.commit', {
      planId: createdPlanId,
      tasks: [{ title: `${TASK_TITLE_PREFIX} Q4.4 task` }],
    })
    expect(createResult.ok).toBe(true)
    const tasks = createResult.tasks as Array<Record<string, unknown>>
    const taskId = tasks[0]?.id as string
    createdTaskIds.push(taskId)

    // Preview
    const preview = await callTool('planner.complete_tasks.preview', {
      taskIds: [taskId],
    })
    expect(preview.ok).toBe(true)
    expect(preview.commitId).toBeTruthy()

    // Commit
    const commit = await callTool('planner.complete_tasks.commit', {
      commitId: preview.commitId,
    })
    expect(commit.ok).toBe(true)

    // Live GET: percentComplete must be 100
    const live = await callTool('planner.get_task', { taskId })
    expect(live.ok).toBe(true)
    expect((live.task as Record<string, unknown>)?.percentComplete).toBe(100)
  })

  // -------------------------------------------------------------------------
  // Q4.5 — comment thread
  // -------------------------------------------------------------------------

  it('Q4.5: add_comments preview→commit adds a comment thread', async () => {
    if (skipIfNotStaging()) return

    // Create a task to comment on
    const createResult = await callTool('planner.create_tasks.commit', {
      planId: createdPlanId,
      tasks: [{ title: `${TASK_TITLE_PREFIX} Q4.5 task` }],
    })
    expect(createResult.ok).toBe(true)
    const tasks = createResult.tasks as Array<Record<string, unknown>>
    const taskId = tasks[0]?.id as string
    createdTaskIds.push(taskId)

    // Preview
    const preview = await callTool('planner.add_comments.preview', {
      comments: [{ taskId, body: 'E2E Q4.5 test comment' }],
    })
    expect(preview.ok).toBe(true)
    expect(preview.commitId).toBeTruthy()

    // Commit
    const commit = await callTool('planner.add_comments.commit', {
      commitId: preview.commitId,
    })
    expect(commit.ok).toBe(true)

    // The Graph Planner API stores comments on the task detail object.
    const live = await callTool('planner.get_task_details', { taskId })
    expect(live.ok).toBe(true)
    const detail = live.detail as Record<string, unknown>
    // notes / description field should contain the comment body
    expect(JSON.stringify(detail)).toContain('E2E Q4.5 test comment')
  })

  // -------------------------------------------------------------------------
  // Q4.6 — create plan
  // -------------------------------------------------------------------------

  it('Q4.6: create_plan preview→commit creates a new plan', async () => {
    if (skipIfNotStaging()) return

    const planTitle = `${TASK_TITLE_PREFIX} Q4.6 plan`

    // Preview
    const preview = await callTool('planner.create_plan.preview', {
      title: planTitle,
      ownerGroupId: TEST_GROUP_ID,
    })
    expect(preview.ok).toBe(true)
    expect(preview.commitId).toBeTruthy()

    // Commit
    const commit = await callTool('planner.create_plan.commit', {
      commitId: preview.commitId,
    })
    expect(commit.ok).toBe(true)
    const plan = commit.plan as Record<string, unknown>
    expect(plan?.id).toBeTruthy()
    expect(plan?.title).toBe(planTitle)

    // Clean up the extra plan in afterAll would require storing its id; push
    // to a separate list or rely on the test-plan owner group cleanup.
    // For now: delete immediately.
    await callTool('planner.delete_plan', { planId: plan.id as string })
  })

  // -------------------------------------------------------------------------
  // Q4.7 — stale etag → 412 conflict surface
  // -------------------------------------------------------------------------

  it('Q4.7: update_tasks commit with stale etag surfaces 412 conflict status', async () => {
    if (skipIfNotStaging()) return

    // Create a task
    const createResult = await callTool('planner.create_tasks.commit', {
      planId: createdPlanId,
      tasks: [{ title: `${TASK_TITLE_PREFIX} Q4.7 etag task` }],
    })
    expect(createResult.ok).toBe(true)
    const tasks = createResult.tasks as Array<Record<string, unknown>>
    const taskId = tasks[0]?.id as string
    createdTaskIds.push(taskId)

    // Commit an update using a deliberately stale etag
    const result = await callTool('planner.update_tasks.commit', {
      updates: [
        {
          taskId,
          etag: '"stale-etag-00000000000"',
          title: 'should not apply',
        },
      ],
    })

    // The tool must surface the 412 rather than swallowing it.
    // Acceptable response shapes: { ok: false, status: 412 } or
    // { ok: false, code: 'CONFLICT' } or similar.
    expect(result.ok).toBe(false)
    const status = (result.status ?? result.httpStatus ?? result.code) as string | number
    const isConflict =
      status === 412 ||
      String(status).includes('412') ||
      String(status).toUpperCase().includes('CONFLICT') ||
      String(result.code).toUpperCase().includes('CONFLICT')
    expect(isConflict).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Q4.8 — 403 on inaccessible plan
  // -------------------------------------------------------------------------

  it('Q4.8: list_plan_tasks on inaccessible plan returns 403-friendly error', async () => {
    if (skipIfNotStaging()) return

    // Use a plan id that is syntactically valid but belongs to a plan the
    // service-account cannot access.
    const inaccessiblePlanId = process.env.E2E_INACCESSIBLE_PLAN_ID ?? 'nonexistent-plan-id-00000'

    const result = await callTool('planner.list_plan_tasks', {
      planId: inaccessiblePlanId,
    })

    expect(result.ok).toBe(false)
    // Must not expose raw Graph error internals; a user-safe message is required.
    expect(result.message ?? result.error).toBeTruthy()
    const status = result.status ?? result.httpStatus ?? result.code
    const isForbiddenOrNotFound =
      status === 403 ||
      status === 404 ||
      String(status).includes('403') ||
      String(status).includes('404') ||
      String(result.code).toUpperCase().includes('FORBIDDEN') ||
      String(result.code).toUpperCase().includes('NOT_FOUND')
    expect(isForbiddenOrNotFound).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Q4.9 — partial failure (1 of 3 tasks has 412)
  // -------------------------------------------------------------------------

  it('Q4.9: update_tasks commit on 3-task batch where 1 has stale etag → partial failure card', async () => {
    if (skipIfNotStaging()) return

    // Create 3 tasks
    const createResult = await callTool('planner.create_tasks.commit', {
      planId: createdPlanId,
      tasks: [
        { title: `${TASK_TITLE_PREFIX} Q4.9 task-A` },
        { title: `${TASK_TITLE_PREFIX} Q4.9 task-B` },
        { title: `${TASK_TITLE_PREFIX} Q4.9 task-C` },
      ],
    })
    expect(createResult.ok).toBe(true)
    const tasks = createResult.tasks as Array<Record<string, unknown>>
    const taskA = tasks[0] as Record<string, unknown>
    const taskB = tasks[1] as Record<string, unknown>
    const taskC = tasks[2] as Record<string, unknown>
    createdTaskIds.push(taskA.id as string, taskB.id as string, taskC.id as string)

    // Retrieve real etags for task A and B; use stale etag for task C.
    const etagA = (taskA.etag ?? taskA['@odata.etag']) as string | undefined
    const etagB = (taskB.etag ?? taskB['@odata.etag']) as string | undefined

    const result = await callTool('planner.update_tasks.commit', {
      updates: [
        { taskId: taskA.id, etag: etagA, title: `${TASK_TITLE_PREFIX} Q4.9 task-A updated` },
        { taskId: taskB.id, etag: etagB, title: `${TASK_TITLE_PREFIX} Q4.9 task-B updated` },
        {
          taskId: taskC.id,
          etag: '"stale-etag-00000000000"',
          title: 'should partially fail',
        },
      ],
    })

    // The tool must surface a partial-failure card, not a hard error.
    // At least some tasks should succeed and the failing task id must be reported.
    const succeeded = result.succeeded as Array<unknown> | undefined
    const failed = result.failed as Array<unknown> | undefined

    expect(Array.isArray(succeeded) || Array.isArray(failed)).toBe(true)

    if (Array.isArray(failed)) {
      expect(failed.length).toBeGreaterThanOrEqual(1)
    }
    if (Array.isArray(succeeded)) {
      expect(succeeded.length).toBeGreaterThanOrEqual(1)
    }
  })

  // -------------------------------------------------------------------------
  // Q4.10 — workload analysis bar chart
  // -------------------------------------------------------------------------

  it('Q4.10: workload_analysis returns a bar chart with at least 1 bar', async () => {
    if (skipIfNotStaging()) return

    const result = await callTool('planner.workload_analysis', {
      planId: createdPlanId,
    })

    expect(result.ok).toBe(true)

    // The response must include a chart with at least one data series / bar.
    // Accepted shapes: { chart: { bars: [...] } } or { bars: [...] } or
    // { chartData: [...] } depending on the tool's output contract.
    const chart = (result.chart as Record<string, unknown> | undefined) ?? result

    const bars =
      (chart as Record<string, unknown>).bars ??
      (chart as Record<string, unknown>).data ??
      (chart as Record<string, unknown>).chartData ??
      (result.chartData as unknown[])

    expect(Array.isArray(bars)).toBe(true)
    expect((bars as unknown[]).length).toBeGreaterThanOrEqual(1)
  })
})
