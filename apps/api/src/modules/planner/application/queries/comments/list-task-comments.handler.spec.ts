import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListTaskCommentsHandler } from './list-task-comments.handler'
import { ListTaskCommentsQuery } from './list-task-comments.query'
import { TaskComment } from '../../../domain/entities/task-comment.entity'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import type { ITaskCommentRepository } from '../../../domain/repositories/task-comment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'

const TENANT_ID = 'tenant-1'
const PLAN_ID = 'plan-1'
const TASK_ID = 'task-1'
const ACTOR_ID = 'actor-1'

function makeComment(id: string, deletedAt: Date | null = null) {
  return TaskComment.reconstitute({
    id,
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    authorActorId: ACTOR_ID,
    body: `Comment ${id}`,
    postedAt: new Date(),
    deletedAt,
    msThreadId: null,
    msPostId: null,
    msPostEtag: null,
  })
}

describe('ListTaskCommentsHandler', () => {
  let handler: ListTaskCommentsHandler
  let commentRepo: { listByTask: ReturnType<typeof vi.fn> }
  let authSvc: { assertCanEditPlan: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    commentRepo = { listByTask: vi.fn().mockResolvedValue([]) }
    authSvc = { assertCanEditPlan: vi.fn().mockResolvedValue(undefined) }
    handler = new ListTaskCommentsHandler(
      commentRepo as unknown as ITaskCommentRepository,
      authSvc as unknown as PlanAuthorizationService,
    )
  })

  it('returns mapped comment DTOs for active comments', async () => {
    const comments = [makeComment('c1'), makeComment('c2')]
    commentRepo.listByTask.mockResolvedValue(comments)

    const query = new ListTaskCommentsQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, undefined, 20)
    const result = await handler.execute(query)

    expect(authSvc.assertCanEditPlan).toHaveBeenCalledWith(ACTOR_ID, PLAN_ID, TENANT_ID)
    expect(commentRepo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID, {
      cursor: undefined,
      limit: 20,
    })
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
    expect(result.items[0]).toMatchObject({
      id: 'c1',
      taskId: TASK_ID,
      tenantId: TENANT_ID,
      authorActorId: ACTOR_ID,
      body: 'Comment c1',
      deleted: false,
    })
    expect(result.items[0]!.postedAt).toBeInstanceOf(Date)
  })

  it('includes tombstoned comments with deleted: true', async () => {
    const deletedComment = makeComment('c-deleted', new Date())
    const activeComment = makeComment('c-active')
    commentRepo.listByTask.mockResolvedValue([activeComment, deletedComment])

    const query = new ListTaskCommentsQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, undefined, 20)
    const result = await handler.execute(query)

    expect(result.items).toHaveLength(2)
    const deleted = result.items.find((c) => c.id === 'c-deleted')
    const active = result.items.find((c) => c.id === 'c-active')
    expect(deleted!.deleted).toBe(true)
    expect(active!.deleted).toBe(false)
  })

  it('passes cursor to repository', async () => {
    const query = new ListTaskCommentsQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, 'cursor-id', 10)
    await handler.execute(query)

    expect(commentRepo.listByTask).toHaveBeenCalledWith(TASK_ID, TENANT_ID, {
      cursor: 'cursor-id',
      limit: 10,
    })
  })

  it('returns empty items and null nextCursor when no comments exist', async () => {
    commentRepo.listByTask.mockResolvedValue([])
    const query = new ListTaskCommentsQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, undefined, 20)
    const result = await handler.execute(query)
    expect(result).toEqual({ items: [], nextCursor: null })
  })

  it('sets nextCursor when repo returns limit+1 rows', async () => {
    // repo returns 3 rows for limit=2 → hasMore=true, nextCursor = rows[1].id = 'c2'
    const comments = [makeComment('c1'), makeComment('c2'), makeComment('c3')]
    commentRepo.listByTask.mockResolvedValue(comments)

    const query = new ListTaskCommentsQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, undefined, 2)
    const result = await handler.execute(query)

    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBe('c2')
  })

  it('throws UnauthorizedPlanAccessException when actor lacks plan access', async () => {
    authSvc.assertCanEditPlan.mockRejectedValue(
      new UnauthorizedPlanAccessException(ACTOR_ID, PLAN_ID),
    )
    const query = new ListTaskCommentsQuery(TENANT_ID, PLAN_ID, TASK_ID, ACTOR_ID, undefined, 20)

    await expect(handler.execute(query)).rejects.toThrow(UnauthorizedPlanAccessException)
    expect(commentRepo.listByTask).not.toHaveBeenCalled()
  })
})
