import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { GetGraphCredentialQuery } from '../../../identity/application/queries/get-graph-credential.query'
import { ConnectMsSyncCommand } from '../../application/commands/ms-sync/connect-ms-sync.command'
import { DisconnectMsSyncCommand } from '../../application/commands/ms-sync/disconnect-ms-sync.command'
import { LinkMsGroupCommand } from '../../application/commands/ms-sync/link-ms-group.command'
import { UnlinkMsGroupCommand } from '../../application/commands/ms-sync/unlink-ms-group.command'
import { MintMsRosterCommand } from '../../application/commands/ms-sync/mint-ms-roster.command'
import { LinkExistingRosterCommand } from '../../application/commands/ms-sync/link-existing-roster.command'
import { UnlinkRosterCommand } from '../../application/commands/ms-sync/unlink-roster.command'
import { ForceResyncTaskCommand } from '../../application/commands/ms-sync/force-resync-task.command'
import { ListAvailableGroupsQuery } from '../../application/queries/ms-sync/list-available-groups.query'
import { ListLinkedGroupsQuery } from '../../application/queries/ms-sync/list-linked-groups.query'
import { ListLinkedRostersQuery } from '../../application/queries/ms-sync/list-linked-rosters.query'
import { ListConflictsQuery } from '../../application/queries/ms-sync/list-conflicts.query'
import { RetryConflictCommand } from '../../application/commands/ms-sync/retry-conflict.command'
import { AcceptMsStateForConflictCommand } from '../../application/commands/ms-sync/accept-ms-state-for-conflict.command'
import { GetTenantSyncHealthQuery } from '../../application/queries/ms-sync/get-tenant-sync-health.query'
import { PlannerRouterService } from './planner-router.service'
import { toPlannerTrpcError } from './planner-trpc-error'

function svc() {
  return PlannerRouterService.getInstance()
}

const msSyncBaseInput = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().uuid(),
})

export const msSyncRouter = router({
  connect: publicProcedure
    .input(
      msSyncBaseInput.extend({
        tenantAdId: z.string().uuid('Tenant (directory) ID must be a UUID'),
        clientId: z.string().uuid('Application (client) ID must be a UUID'),
        clientSecret: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await svc()
        .command(
          new ConnectMsSyncCommand(input.tenantId, input.actorId, {
            tenantAdId: input.tenantAdId,
            clientId: input.clientId,
            clientSecret: input.clientSecret,
          }),
        )
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

  disconnect: router({
    pause: publicProcedure.input(msSyncBaseInput).mutation(async ({ input }) => {
      await svc()
        .command(new DisconnectMsSyncCommand(input.tenantId, input.actorId, 'pause'))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),

    destroy: publicProcedure.input(msSyncBaseInput).mutation(async ({ input }) => {
      await svc()
        .command(new DisconnectMsSyncCommand(input.tenantId, input.actorId, 'destroy'))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
  }),

  groups: router({
    listAvailable: publicProcedure
      .input(z.object({ tenantId: z.string().uuid() }))
      .query(async ({ input }) => {
        return svc()
          .query(new ListAvailableGroupsQuery(input.tenantId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    link: publicProcedure
      .input(msSyncBaseInput.extend({ msGroupId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const result = await svc()
          .command(new LinkMsGroupCommand(input.tenantId, input.actorId, input.msGroupId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
        const r = result as { id: string; backfillJobId: string }
        return { linkedGroupId: r.id, backfillJobId: r.backfillJobId }
      }),

    unlink: publicProcedure
      .input(msSyncBaseInput.extend({ msGroupId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await svc()
          .command(new UnlinkMsGroupCommand(input.tenantId, input.actorId, input.msGroupId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    listLinked: publicProcedure
      .input(z.object({ tenantId: z.string().uuid() }))
      .query(async ({ input }) => {
        return svc()
          .query(new ListLinkedGroupsQuery(input.tenantId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),
  }),

  status: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const credential = await svc()
        .query(new GetGraphCredentialQuery(input.tenantId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })

      if (!credential) {
        return {
          connected: false,
          status: null,
          tenantAdId: null,
          clientId: null,
          connectedAt: null,
          lastError: null,
        }
      }

      const c = credential as {
        status: 'active' | 'invalid' | 'paused'
        tenantAdId: string
        clientId: string
        consentedAt: Date
        lastError: string | null
      }

      return {
        connected: true,
        status: c.status,
        tenantAdId: c.tenantAdId,
        clientId: c.clientId,
        connectedAt: c.consentedAt.toISOString(),
        lastError: c.lastError,
      }
    }),

  rosters: router({
    listLinked: publicProcedure
      .input(z.object({ tenantId: z.string().uuid() }))
      .query(async ({ input }) => {
        await svc().assertRostersEnabled(input.tenantId)
        return svc()
          .query(new ListLinkedRostersQuery(input.tenantId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    mint: publicProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          actorId: z.string().uuid(),
          displayName: z.string().min(1),
          initialMemberActorIds: z.array(z.string().uuid()).default([]),
        }),
      )
      .mutation(async ({ input }) => {
        await svc().assertRostersEnabled(input.tenantId)
        return svc()
          .command(
            new MintMsRosterCommand(
              input.tenantId,
              input.actorId,
              input.displayName,
              input.initialMemberActorIds,
            ),
          )
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    linkExisting: publicProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          actorId: z.string().uuid(),
          msRosterId: z.string().min(1),
          displayName: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await svc().assertRostersEnabled(input.tenantId)
        await svc()
          .command(
            new LinkExistingRosterCommand(
              input.tenantId,
              input.actorId,
              input.msRosterId,
              input.displayName ?? null,
            ),
          )
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    unlink: publicProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          actorId: z.string().uuid(),
          msRosterId: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        await svc().assertRostersEnabled(input.tenantId)
        await svc()
          .command(new UnlinkRosterCommand(input.tenantId, input.actorId, input.msRosterId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),
  }),

  flags: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const flags = await svc()
        .getPlannerViewFlags(input.tenantId)
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
      return {
        msSyncAttachmentsEnabled: flags.msSyncAttachmentsEnabled,
        msSyncRostersEnabled: flags.msSyncRostersEnabled,
      }
    }),

  tenantSyncHealth: publicProcedure.query(async () => {
    return svc()
      .query(new GetTenantSyncHealthQuery())
      .catch((e) => {
        throw toPlannerTrpcError(e)
      })
  }),

  conflicts: router({
    list: publicProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          resolved: z.enum(['open', 'all']).default('open'),
          limit: z.number().int().min(1).max(200).default(100),
          cursor: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        return svc()
          .query(
            new ListConflictsQuery(input.tenantId, {
              resolved: input.resolved,
              limit: input.limit,
              cursor: input.cursor,
            }),
          )
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    retry: publicProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          actorId: z.string().uuid(),
          conflictId: z.string().uuid(),
        }),
      )
      .mutation(async ({ input }) => {
        await svc()
          .command(new RetryConflictCommand(input.tenantId, input.actorId, input.conflictId))
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),

    acceptMsState: publicProcedure
      .input(
        z.object({
          tenantId: z.string().uuid(),
          actorId: z.string().uuid(),
          conflictId: z.string().uuid(),
        }),
      )
      .mutation(async ({ input }) => {
        await svc()
          .command(
            new AcceptMsStateForConflictCommand(input.tenantId, input.actorId, input.conflictId),
          )
          .catch((e) => {
            throw toPlannerTrpcError(e)
          })
      }),
  }),

  forceResyncTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        taskId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      await svc()
        .command(new ForceResyncTaskCommand(input.tenantId, input.actorId, input.taskId))
        .catch((e) => {
          throw toPlannerTrpcError(e)
        })
    }),
})
