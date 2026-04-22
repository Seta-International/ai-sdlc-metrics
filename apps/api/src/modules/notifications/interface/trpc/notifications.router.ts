import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import { NotificationsRouterService } from './notifications-router.service'
import { MarkReadCommand, MarkAllReadCommand } from '../../application/commands/mark-read.command'
import { ArchiveNotificationCommand } from '../../application/commands/archive-notification.command'
import { UpdatePreferenceCommand } from '../../application/commands/update-preference.command'
import { ListNotificationsQuery } from '../../application/queries/list-notifications.query'
import { UnreadCountQuery } from '../../application/queries/unread-count.query'
import { GetPreferencesQuery } from '../../application/queries/get-preferences.query'

function svc() {
  return NotificationsRouterService.getInstance()
}

const categoryEnum = z.enum(['approval', 'mention', 'assignment', 'system'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNotificationsRouter(protectedProcedure: any) {
  return router({
    list: protectedProcedure
      .input(
        z.object({
          category: categoryEnum.optional(),
          unreadOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(({ ctx, input }: { ctx: AuthContext; input: any }) =>
        svc().query(
          new ListNotificationsQuery(ctx.tenantId, ctx.actorId, {
            category: input.category,
            unreadOnly: input.unreadOnly,
            limit: input.limit,
            offset: input.offset,
          }),
        ),
      ),

    unreadCount: protectedProcedure.query(({ ctx }: { ctx: AuthContext }) =>
      svc().query(new UnreadCountQuery(ctx.tenantId, ctx.actorId)),
    ),

    markRead: protectedProcedure
      .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
      .mutation(({ ctx, input }: { ctx: AuthContext; input: { ids: string[] } }) =>
        svc().command(new MarkReadCommand(ctx.tenantId, input.ids)),
      ),

    markAllRead: protectedProcedure.mutation(({ ctx }: { ctx: AuthContext }) =>
      svc().command(new MarkAllReadCommand(ctx.tenantId, ctx.actorId)),
    ),

    archive: protectedProcedure
      .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
      .mutation(({ ctx, input }: { ctx: AuthContext; input: { ids: string[] } }) =>
        svc().command(new ArchiveNotificationCommand(ctx.tenantId, input.ids)),
      ),

    preferences: router({
      get: protectedProcedure.query(({ ctx }: { ctx: AuthContext }) =>
        svc().query(new GetPreferencesQuery(ctx.tenantId, ctx.actorId)),
      ),

      update: protectedProcedure
        .input(
          z.object({
            category: categoryEnum,
            inApp: z.boolean(),
            email: z.boolean(),
          }),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mutation(({ ctx, input }: { ctx: AuthContext; input: any }) =>
          svc().command(
            new UpdatePreferenceCommand(
              ctx.tenantId,
              ctx.actorId,
              input.category,
              input.inApp,
              input.email,
            ),
          ),
        ),
    }),
  })
}

// Static default for type inference — replaced at runtime by TrpcModule
export const notificationsRouter = router({
  list: publicProcedure.input(z.object({})).query(() => []),
  unreadCount: publicProcedure.query(() => 0),
  markRead: publicProcedure.input(z.object({})).mutation(() => null),
  markAllRead: publicProcedure.mutation(() => null),
  archive: publicProcedure.input(z.object({})).mutation(() => null),
  preferences: router({
    get: publicProcedure.query(() => []),
    update: publicProcedure.input(z.object({})).mutation(() => null),
  }),
})
