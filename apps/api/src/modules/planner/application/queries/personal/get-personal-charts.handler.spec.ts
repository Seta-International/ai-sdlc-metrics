import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryBus } from '@nestjs/cqrs'
import { GetPersonalChartsHandler } from './get-personal-charts.handler'
import { GetPersonalChartsQuery } from './get-personal-charts.query'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'

describe('GetPersonalChartsHandler', () => {
  const actorId = 'a1'
  const tenantId = 't1'
  let handler: GetPersonalChartsHandler
  let queryBus: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queryBus = { execute: vi.fn() }
    handler = new GetPersonalChartsHandler(queryBus as unknown as QueryBus)
  })

  it('delegates to ListTasksForActorQuery with includeCompleted=true (charts count done)', async () => {
    queryBus.execute.mockResolvedValue([])
    await handler.execute(new GetPersonalChartsQuery(actorId, tenantId))
    const called = queryBus.execute.mock.calls[0]![0] as ListTasksForActorQuery
    expect(called).toBeInstanceOf(ListTasksForActorQuery)
    expect(called.options.includeCompleted).toBe(true)
    expect(called.actorId).toBe(actorId)
    expect(called.tenantId).toBe(tenantId)
  })

  it('computes PlannerChartsData from the returned tasks', async () => {
    queryBus.execute.mockResolvedValue([
      {
        id: '1',
        planId: 'p1',
        planName: 'P',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'B',
        bucketOrderHint: '0|a:',
        title: 't',
        progress: 'in-progress',
        priority: 'urgent',
        startDate: null,
        dueDate: null,
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        attachmentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
    const data = await handler.execute(new GetPersonalChartsQuery(actorId, tenantId))
    expect(data.progress['in-progress']).toBe(1)
    expect(data.priority.urgent).toBe(1)
  })
})
