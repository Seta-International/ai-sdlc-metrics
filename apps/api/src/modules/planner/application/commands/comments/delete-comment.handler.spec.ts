import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { DeleteCommentHandler } from './delete-comment.handler'
import { DeleteCommentCommand } from './delete-comment.command'
import { TaskComment } from '../../../domain/entities/task-comment.entity'
import { TaskCommentDeletedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { CommentNotFoundException } from '../../../domain/exceptions/comment-not-found.exception'
import type { ITaskCommentRepository } from '../../../domain/repositories/task-comment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const OTHER_ACTOR_ID = 'actor-2'
const COMMENT_ID = 'comment-1'

function makeComment(overrides?: Partial<Parameters<typeof TaskComment.reconstitute>[0]>) {
  return TaskComment.reconstitute({
    id: COMMENT_ID,
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    authorActorId: ACTOR_ID,
    body: 'Hello world',
    postedAt: new Date(),
    deletedAt: null,
    msThreadId: null,
    msPostId: null,
    msPostEtag: null,
    ...overrides,
  })
}

describe('DeleteCommentHandler', () => {
  let handler: DeleteCommentHandler
  let commentRepo: {
    findById: ReturnType<typeof vi.fn>
    softDelete: ReturnType<typeof vi.fn>
  }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commentRepo = {
      findById: vi.fn().mockResolvedValue(makeComment()),
      softDelete: vi.fn().mockResolvedValue(undefined),
    }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DeleteCommentHandler(
      commentRepo as unknown as ITaskCommentRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('soft-deletes the comment and emits TaskCommentDeletedEvent', async () => {
    const command = new DeleteCommentCommand(TENANT_ID, PLAN_ID, TASK_ID, COMMENT_ID, ACTOR_ID)

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(commentRepo.findById).toHaveBeenCalledWith(COMMENT_ID, TENANT_ID)
    expect(commentRepo.softDelete).toHaveBeenCalledWith(COMMENT_ID, TENANT_ID, expect.any(Date))
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskCommentDeletedEvent))
    const event: TaskCommentDeletedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.commentId).toBe(COMMENT_ID)
    expect(event.taskId).toBe(TASK_ID)
    expect(event.actorId).toBe(ACTOR_ID)
  })

  it('throws CommentNotFoundException when comment does not exist', async () => {
    commentRepo.findById.mockResolvedValue(null)
    const command = new DeleteCommentCommand(TENANT_ID, PLAN_ID, TASK_ID, COMMENT_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(CommentNotFoundException)
    expect(commentRepo.softDelete).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws CommentNotFoundException when comment belongs to a different task', async () => {
    commentRepo.findById.mockResolvedValue(makeComment({ taskId: 'other-task' }))
    const command = new DeleteCommentCommand(TENANT_ID, PLAN_ID, TASK_ID, COMMENT_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(CommentNotFoundException)
    expect(commentRepo.softDelete).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor is not the author', async () => {
    commentRepo.findById.mockResolvedValue(makeComment({ authorActorId: OTHER_ACTOR_ID }))
    const command = new DeleteCommentCommand(TENANT_ID, PLAN_ID, TASK_ID, COMMENT_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(commentRepo.softDelete).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks plan edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new DeleteCommentCommand(TENANT_ID, PLAN_ID, TASK_ID, COMMENT_ID, ACTOR_ID)

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(commentRepo.softDelete).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
