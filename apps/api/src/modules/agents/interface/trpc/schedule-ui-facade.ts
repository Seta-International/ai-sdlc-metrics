import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import type { ScheduleRepository } from '../../application/services/schedule-repository'
import type { DelegationLifecycle } from '../../application/services/delegation-lifecycle'
import type { KernelDelegationFacade } from '../../../kernel/application/facades/kernel-delegation.facade'
import type { IScheduleRunRepository } from '../../domain/repositories/schedule-run.repository'

// ─── Handler types ────────────────────────────────────────────────────────────

export type ScheduleHandlers = {
  scheduleRepository: Pick<
    ScheduleRepository,
    'listForTenant' | 'listForUser' | 'create' | 'pause' | 'resume' | 'delete' | 'update'
  >
  delegationLifecycle: Pick<DelegationLifecycle, 'listActive' | 'revoke'>
  kernelDelegationFacade: Pick<KernelDelegationFacade, 'revokeDelegation'>
  scheduleRunRepository: Pick<IScheduleRunRepository, 'updateOutcome'>
}

// ─── Module-level handler slot ────────────────────────────────────────────────

let handlers: ScheduleHandlers | undefined

export function setScheduleHandlers(h: ScheduleHandlers): void {
  handlers = h
}

function h(): ScheduleHandlers {
  if (!handlers) throw new Error('scheduleHandlers not wired — boot failure')
  return handlers
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const createScheduleInput = z.object({
  kind: z.enum(['personal', 'tenant_wide']),
  ownerUserId: z.string().uuid().optional(),
  triggerKind: z.enum(['cron', 'event']),
  cronExpression: z.string().optional(),
  eventSubscription: z.object({ eventType: z.string(), filter: z.unknown() }).optional(),
  prompt: z.string().min(1).max(2000),
  delegationScope: z.object({
    permitted_tools: z.array(z.string()).optional(),
    permitted_domains: z.array(z.string()).optional(),
    notes: z.string().optional(),
    admin_approved_by: z.string().uuid().optional(),
  }),
  costCeilingDailyUsd: z.number().positive().max(100),
  invocationCeilingDaily: z.number().int().positive().max(1000),
  failureAlertPolicy: z.enum(['owner', 'owner_and_admin', 'admin_only', 'silent']).optional(),
})

const pauseScheduleInput = z.object({
  scheduleId: z.string().uuid(),
  reason: z.string().optional(),
})

const resumeOrDeleteInput = z.object({
  scheduleId: z.string().uuid(),
})

const updateScheduleInput = z.object({
  scheduleId: z.string().uuid(),
  prompt: z.string().min(1).max(2000).optional(),
  cronExpression: z.string().optional(),
  costCeilingDailyUsd: z.number().positive().max(100).optional(),
  invocationCeilingDaily: z.number().int().positive().max(1000).optional(),
  failureAlertPolicy: z.enum(['owner', 'owner_and_admin', 'admin_only', 'silent']).optional(),
})

const cancelRunInput = z.object({
  scheduleId: z.string().uuid(),
  runId: z.string().uuid(),
})

const listDelegationsInput = z.object({
  userId: z.string().uuid(),
})

const revokeDelegationInput = z.object({
  delegationId: z.string().uuid(),
})

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * ScheduleUiFacade — tRPC procedures for schedule CRUD and delegation management.
 *
 * Permission gates (canDo checks) are deferred to a future task. Currently all
 * procedures require a valid tenant context but do not enforce role-level gates.
 * MVP: use publicProcedure (same pattern as existing routers in this directory).
 */
export const scheduleUiRouter = router({
  // ── list ──────────────────────────────────────────────────────────────────

  list: publicProcedure.query(({ ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().scheduleRepository.listForTenant({ tenantId: ctx.tenantId })
  }),

  // ── create ────────────────────────────────────────────────────────────────

  create: publicProcedure.input(createScheduleInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId || !ctx.actorId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant or actor context' })
    }
    return h().scheduleRepository.create({
      tenantId: ctx.tenantId,
      createdBy: ctx.actorId,
      kind: input.kind,
      ownerUserId: input.ownerUserId,
      triggerKind: input.triggerKind,
      cronExpression: input.cronExpression,
      eventSubscription: input.eventSubscription,
      prompt: input.prompt,
      delegationScope: input.delegationScope,
      costCeilingDailyUsd: input.costCeilingDailyUsd,
      invocationCeilingDaily: input.invocationCeilingDaily,
      failureAlertPolicy: input.failureAlertPolicy,
    })
  }),

  // ── pause ─────────────────────────────────────────────────────────────────

  pause: publicProcedure.input(pauseScheduleInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().scheduleRepository.pause({
      tenantId: ctx.tenantId,
      scheduleId: input.scheduleId,
      reason: input.reason,
    })
  }),

  // ── resume ────────────────────────────────────────────────────────────────

  resume: publicProcedure.input(resumeOrDeleteInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().scheduleRepository.resume({
      tenantId: ctx.tenantId,
      scheduleId: input.scheduleId,
    })
  }),

  // ── delete ────────────────────────────────────────────────────────────────

  delete: publicProcedure.input(resumeOrDeleteInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().scheduleRepository.delete({
      tenantId: ctx.tenantId,
      scheduleId: input.scheduleId,
    })
  }),

  // ── update ────────────────────────────────────────────────────────────────

  update: publicProcedure.input(updateScheduleInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().scheduleRepository.update({
      tenantId: ctx.tenantId,
      scheduleId: input.scheduleId,
      prompt: input.prompt,
      cronExpression: input.cronExpression,
      costCeilingDailyUsd: input.costCeilingDailyUsd,
      invocationCeilingDaily: input.invocationCeilingDaily,
      failureAlertPolicy: input.failureAlertPolicy,
    })
  }),

  // ── cancelRun ─────────────────────────────────────────────────────────────

  cancelRun: publicProcedure.input(cancelRunInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().scheduleRunRepository.updateOutcome({
      tenantId: ctx.tenantId,
      runId: input.runId,
      outcome: 'cancelled_per_run',
      endedAt: new Date(),
    })
  }),

  // ── listDelegations ───────────────────────────────────────────────────────

  listDelegations: publicProcedure.input(listDelegationsInput).query(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().delegationLifecycle.listActive({
      tenantId: ctx.tenantId,
      userId: input.userId,
    })
  }),

  // ── revokeDelegation ──────────────────────────────────────────────────────

  revokeDelegation: publicProcedure.input(revokeDelegationInput).mutation(({ input, ctx }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing tenant context' })
    }
    return h().kernelDelegationFacade.revokeDelegation({
      tenantId: ctx.tenantId,
      delegationId: input.delegationId,
      reason: 'user_revoked',
    })
  }),
})
