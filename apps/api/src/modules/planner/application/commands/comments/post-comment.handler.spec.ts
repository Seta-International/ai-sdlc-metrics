import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventBus } from '@nestjs/cqrs'
import { PostCommentHandler } from './post-comment.handler'
import { PostCommentCommand } from './post-comment.command'
import { TaskComment } from '../../../domain/entities/task-comment.entity'
import { TaskCommentPostedEvent } from '@future/event-contracts'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { CommentBodyTooLongException } from '../../../domain/exceptions/comment-body-too-long.exception'
import type { ITaskCommentRepository } from '../../../domain/repositories/task-comment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'
const COMMENT_ID = 'comment-1'

describe('PostCommentHandler', () => {
  let handler: PostCommentHandler
  let commentRepo: { add: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commentRepo = { add: vi.fn().mockResolvedValue(undefined) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new PostCommentHandler(
      commentRepo as unknown as ITaskCommentRepository,
      authSvc as unknown as PlanAuthorizationService,
      eventBus as unknown as EventBus,
    )
  })

  it('creates a comment and emits TaskCommentPostedEvent', async () => {
    const command = new PostCommentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      COMMENT_ID,
      ACTOR_ID,
      'Hello world',
    )

    await handler.execute(command)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(commentRepo.add).toHaveBeenCalledOnce()
    const saved: TaskComment = commentRepo.add.mock.calls[0][0]
    expect(saved.id).toBe(COMMENT_ID)
    expect(saved.taskId).toBe(TASK_ID)
    expect(saved.tenantId).toBe(TENANT_ID)
    expect(saved.authorActorId).toBe(ACTOR_ID)
    expect(saved.body).toBe('Hello world')
    expect(saved.deletedAt).toBeNull()

    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TaskCommentPostedEvent))
    const event: TaskCommentPostedEvent = eventBus.publish.mock.calls[0][0]
    expect(event.commentId).toBe(COMMENT_ID)
    expect(event.taskId).toBe(TASK_ID)
    expect(event.body).toBe('Hello world')
  })

  it('throws CommentBodyTooLongException when body exceeds 4000 characters', async () => {
    const command = new PostCommentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      COMMENT_ID,
      ACTOR_ID,
      'x'.repeat(4001),
    )

    await expect(handler.execute(command)).rejects.toThrow(CommentBodyTooLongException)
    expect(commentRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedPlanAccessException when actor lacks edit permission', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const command = new PostCommentCommand(
      TENANT_ID,
      PLAN_ID,
      TASK_ID,
      COMMENT_ID,
      ACTOR_ID,
      'some comment',
    )

    await expect(handler.execute(command)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(commentRepo.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
