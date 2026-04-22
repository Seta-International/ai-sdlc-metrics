import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PlannerRouterService } from './planner-router.service'
import { PostCommentCommand } from '../../application/commands/comments/post-comment.command'
import { DeleteCommentCommand } from '../../application/commands/comments/delete-comment.command'
import { ListTaskCommentsQuery } from '../../application/queries/comments/list-task-comments.query'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

export const commentRouter = router({
  post: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        commentId: z.string().uuid(),
        actorId: z.string().uuid(),
        body: z.string().max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new PostCommentCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.commentId,
            input.actorId,
            input.body,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  delete: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        commentId: z.string().uuid(),
        actorId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .command(
          new DeleteCommentCommand(
            input.tenantId,
            input.planId,
            input.taskId,
            input.commentId,
            input.actorId,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  list: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        planId: z.string().uuid(),
        taskId: z.string().uuid(),
        actorId: z.string().uuid(),
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
      }),
    )
    .query(async ({ input }) => {
      await svc().assertPlannerEnabled(input.tenantId)
      return svc()
        .query(
          new ListTaskCommentsQuery(
            input.tenantId,
            input.planId,
            input.taskId,
            input.actorId,
            input.cursor,
            input.limit,
          ),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
