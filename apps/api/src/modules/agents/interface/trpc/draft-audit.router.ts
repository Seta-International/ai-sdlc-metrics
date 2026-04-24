import * as z from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { PERMISSIONS } from '../../../../common/auth/permissions'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'

let draftRepository: IDraftRepository | undefined

export function setDraftRepository(repo: IDraftRepository): void {
  draftRepository = repo
}

function repo(): IDraftRepository {
  if (!draftRepository) throw new Error('draftRepository not wired — boot failure')
  return draftRepository
}

const DraftAuditQueryInput = z.object({
  initiatorUserId: z.string().uuid().optional(),
  approverUserId: z.string().uuid().optional(),
  tier: z.enum(['low_risk_auto', 'high_risk_approval_required']).optional(),
  statuses: z
    .array(
      z.enum([
        'pending',
        'approved',
        'rejected',
        'expired',
        'executed',
        'execution_failed',
        'cancelled',
      ]),
    )
    .optional(),
  domainKind: z.string().optional(),
  approvedAtFrom: z.coerce.date().optional(),
  approvedAtTo: z.coerce.date().optional(),
  taintAtDraftTime: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

export const draftAuditRouter = router({
  list: publicProcedure
    .meta({ permission: PERMISSIONS.AGENT_DRAFT_AUDIT_READ })
    .input(DraftAuditQueryInput)
    .query(({ input, ctx }) => {
      return repo().listAuditDrafts({
        tenantId: ctx.tenantId ?? '',
        initiatorUserId: input.initiatorUserId,
        approverUserId: input.approverUserId,
        tier: input.tier,
        statuses: input.statuses,
        domainKind: input.domainKind,
        approvedAtFrom: input.approvedAtFrom,
        approvedAtTo: input.approvedAtTo,
        taintAtDraftTime: input.taintAtDraftTime,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),
})
