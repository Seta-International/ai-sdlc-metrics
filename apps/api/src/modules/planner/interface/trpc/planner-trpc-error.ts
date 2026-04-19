import { TRPCError } from '@trpc/server'
import { UnauthorizedPlanAccessException } from '../../domain/exceptions/unauthorized-plan-access.exception'
import { PlanNotFoundException } from '../../domain/exceptions/plan-not-found.exception'
import { BucketNotFoundException } from '../../domain/exceptions/bucket-not-found.exception'
import { PlanConflictException } from '../../domain/exceptions/plan-conflict.exception'
import { ConcurrentModificationException } from '../../domain/exceptions/concurrent-modification.exception'
import { LastOwnerRemovalException } from '../../domain/exceptions/last-owner-removal.exception'
import { DescriptionTooLongException } from '../../domain/exceptions/description-too-long.exception'
import { LabelLimitReachedException } from '../../domain/exceptions/label-limit-reached.exception'
import { TaskNotFoundException } from '../../domain/exceptions/task-not-found.exception'
import { AssigneeLimitReachedException } from '../../domain/exceptions/assignee-limit-reached.exception'
import { LabelSlotNotDefinedException } from '../../domain/exceptions/label-slot-not-defined.exception'
import { TitleRequiredException } from '../../domain/exceptions/title-required.exception'
import { TitleTooLongException } from '../../domain/exceptions/title-too-long.exception'
import { ChecklistLimitReachedException } from '../../domain/exceptions/checklist-limit-reached.exception'
import { CommentNotFoundException } from '../../domain/exceptions/comment-not-found.exception'
import { CommentBodyTooLongException } from '../../domain/exceptions/comment-body-too-long.exception'

export function toPlannerTrpcError(error: unknown): TRPCError {
  if (error instanceof UnauthorizedPlanAccessException)
    return new TRPCError({ code: 'FORBIDDEN', message: error.message })
  if (error instanceof PlanNotFoundException)
    return new TRPCError({ code: 'NOT_FOUND', message: error.message })
  if (error instanceof BucketNotFoundException)
    return new TRPCError({ code: 'NOT_FOUND', message: error.message })
  if (error instanceof TaskNotFoundException)
    return new TRPCError({ code: 'NOT_FOUND', message: error.message })
  if (error instanceof PlanConflictException)
    return new TRPCError({ code: 'CONFLICT', message: error.message })
  if (error instanceof ConcurrentModificationException)
    return new TRPCError({ code: 'CONFLICT', message: error.message })
  if (error instanceof LastOwnerRemovalException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof DescriptionTooLongException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof LabelLimitReachedException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof AssigneeLimitReachedException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof LabelSlotNotDefinedException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof TitleRequiredException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof TitleTooLongException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof ChecklistLimitReachedException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  if (error instanceof CommentNotFoundException)
    return new TRPCError({ code: 'NOT_FOUND', message: error.message })
  if (error instanceof CommentBodyTooLongException)
    return new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  const msg = error instanceof Error ? error.message : 'Internal error'
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg })
}
