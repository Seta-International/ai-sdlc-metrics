import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { TEST_GROUP_ID } from './_harness'

const BASE = 'https://graph.microsoft.com/v1.0'

export const TEST_TASK_ID = 'test-task-001'
export const TEST_PLAN_ID = 'test-plan-001'

export const mswPlanner = setupServer(
  http.get(`${BASE}/planner/tasks/:id`, ({ params }) => {
    const id = params.id as string
    return HttpResponse.json({
      '@odata.etag': `W/"etag-${id}-v1"`,
      id,
      title: `Task ${id}`,
      percentComplete: 0,
      planId: TEST_PLAN_ID,
      assignees: {},
    })
  }),

  http.patch(`${BASE}/planner/tasks/:id`, ({ params }) => {
    const id = params.id as string
    return HttpResponse.json({
      '@odata.etag': `W/"etag-${id}-v2"`,
      id,
      title: `Task ${id} (updated)`,
      percentComplete: 0,
    })
  }),

  http.post(`${BASE}/planner/tasks`, async ({ request }) => {
    const body = (await request.json()) as { title: string; planId: string }
    return HttpResponse.json(
      {
        '@odata.etag': 'W/"etag-new-task-v1"',
        id: 'new-task-id',
        title: body.title,
        planId: body.planId,
        percentComplete: 0,
      },
      { status: 201 },
    )
  }),

  http.post(`${BASE}/$batch`, async ({ request }) => {
    const body = (await request.json()) as {
      requests: Array<{ id: string; method: string; url: string }>
    }
    const responses = body.requests.map((req) => ({
      id: req.id,
      status: 200,
      body: {
        '@odata.etag': `W/"etag-batch-${req.id}"`,
        id: req.id,
        title: `Task ${req.id} (batched)`,
      },
    }))
    return HttpResponse.json({ responses })
  }),

  http.get(`${BASE}/me/planner/tasks`, () => {
    return HttpResponse.json({
      value: [
        {
          '@odata.etag': 'W/"et1"',
          id: 'my-task-1',
          title: 'My Task 1',
          percentComplete: 0,
          planId: TEST_PLAN_ID,
        },
      ],
    })
  }),

  http.get(`${BASE}/planner/plans/:id`, ({ params }) => {
    const id = params.id as string
    return HttpResponse.json({
      '@odata.etag': `W/"plan-etag-${id}"`,
      id,
      title: `Plan ${id}`,
      owner: TEST_GROUP_ID,
    })
  }),

  http.post(`${BASE}/planner/plans`, async ({ request }) => {
    const body = (await request.json()) as { owner: string; title: string }
    return HttpResponse.json(
      {
        '@odata.etag': 'W/"plan-new-v1"',
        id: 'new-plan-id',
        title: body.title,
        owner: body.owner,
      },
      { status: 201 },
    )
  }),

  http.get(`${BASE}/planner/plans/:id/tasks`, ({ params }) => {
    const planId = params.id as string
    return HttpResponse.json({
      value: [
        {
          '@odata.etag': 'W/"et-plan-task-1"',
          id: TEST_TASK_ID,
          title: 'Plan Task 1',
          percentComplete: 0,
          planId,
        },
      ],
    })
  }),

  http.get(`${BASE}/planner/plans/:id/buckets`, ({ params }) => {
    const planId = params.id as string
    return HttpResponse.json({
      value: [
        {
          '@odata.etag': 'W/"bucket-etag-1"',
          id: 'bucket-001',
          name: 'Default Bucket',
          planId,
          orderHint: ' !',
        },
      ],
    })
  }),

  http.post(`${BASE}/planner/tasks/:id/details`, ({ params }) => {
    const id = params.id as string
    return HttpResponse.json({
      '@odata.etag': `W/"details-etag-${id}"`,
      id,
      description: '',
      checklist: {},
      references: {},
    })
  }),
)
