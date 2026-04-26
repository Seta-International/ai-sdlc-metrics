import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OnTaskAssignedHandler } from './on-task-assigned.handler'
import { TaskAssignedEvent } from '@future/event-contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { SendNotificationCommand } from '../../../notifications/application/commands/send-notification.command'
import type { ITaskRepository } from '../../domain/repositories/task.repository'
import type { IPlanRepository } from '../../domain/repositories/plan.repository'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { Task } from '../../domain/entities/task.entity'
import { Plan } from '../../domain/entities/plan.entity'
import { PlanContainer } from '../../domain/value-objects/plan-container.vo'

const mockCommandBus = { execute: vi.fn().mockResolvedValue('notif-1') } as unknown as CommandBus

function makeTaskRepo(task: Task | null = null): ITaskRepository {
  return { findById: vi.fn().mockResolvedValue(task) } as unknown as ITaskRepository
}

function makePlanRepo(plan: Plan | null = null): IPlanRepository {
  return { findById: vi.fn().mockResolvedValue(plan) } as unknown as IPlanRepository
}

function makeKernelFacade(
  actorMap: Map<string, { displayName: string }> = new Map(),
): KernelQueryFacade {
  return { getActorsByIds: vi.fn().mockResolvedValue(actorMap) } as unknown as KernelQueryFacade
}

describe('OnTaskAssignedHandler', () => {
  let handler: OnTaskAssignedHandler

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches SendNotificationCommand to the assignee with enriched title and body', async () => {
    const task = Task.create({
      id: 'task-42',
      tenantId: 'tenant-1',
      planId: 'plan-7',
      bucketId: 'bucket-1',
      title: 'Implement OAuth',
      orderHint: '1|a:',
      createdBy: 'actor-1',
    })
    const plan = Plan.create({
      id: 'plan-7',
      tenantId: 'tenant-1',
      name: 'Q3 Sprint',
      container: PlanContainer.of({ type: 'future_only' }),
      createdBy: 'actor-1',
      ownerActorId: 'actor-1',
    })
    const actorMap = new Map([['actor-1', { displayName: 'Alice Nguyen' }]])

    handler = new OnTaskAssignedHandler(
      mockCommandBus,
      makeTaskRepo(task),
      makePlanRepo(plan),
      makeKernelFacade(actorMap),
    )

    const event = new TaskAssignedEvent('tenant-1', 'actor-1', 'task-42', 'plan-7', 'assignee-99')

    await handler.handle(event)

    expect(mockCommandBus.execute).toHaveBeenCalledOnce()
    expect(mockCommandBus.execute).toHaveBeenCalledWith(expect.any(SendNotificationCommand))

    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand

    expect(cmd.tenantId).toBe('tenant-1')
    expect(cmd.recipientId).toBe('assignee-99')
    expect(cmd.senderId).toBe('actor-1')
    expect(cmd.category).toBe('assignment')
    expect(cmd.title).toBe('Alice Nguyen assigned you to Implement OAuth')
    expect(cmd.body).toContain('Alice Nguyen')
    expect(cmd.body).toContain('Q3 Sprint')
    expect(cmd.body).toContain('Implement OAuth')
    expect(cmd.resourceType).toBe('task')
    expect(cmd.resourceId).toBe('task-42')
    expect(cmd.resourceUrl).toBe('/plans/plan-7/board/tasks/task-42')
  })

  it('falls back gracefully when task, plan and actor are not found', async () => {
    handler = new OnTaskAssignedHandler(
      mockCommandBus,
      makeTaskRepo(null),
      makePlanRepo(null),
      makeKernelFacade(new Map()),
    )

    const event = new TaskAssignedEvent('tenant-1', 'actor-1', 'task-42', 'plan-7', 'assignee-99')

    await handler.handle(event)

    expect(mockCommandBus.execute).toHaveBeenCalledOnce()
    const cmd = vi.mocked(mockCommandBus.execute).mock.calls[0][0] as SendNotificationCommand

    expect(cmd.title).toBe('A teammate assigned you to a task')
    expect(cmd.body).toContain('Assigned by: A teammate')
    expect(cmd.body).toContain('Task: a task')
    expect(cmd.body).not.toContain('Plan:')
    expect(cmd.resourceUrl).toBe('/plans/plan-7/board/tasks/task-42')
  })
})
