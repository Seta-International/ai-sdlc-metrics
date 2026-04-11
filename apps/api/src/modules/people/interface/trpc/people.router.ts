import { z } from 'zod'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import type { TrpcContext } from '../../../../common/trpc/trpc-init'
import { checkPermission } from '../../../../common/auth/check-permission'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { IAuditLogger } from '../../../../common/auth/audit-logger.interface'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
import { CreateEmploymentProfileCommand } from '../../application/commands/create-employment-profile.command'
import { UpdateProfileDirectCommand } from '../../application/commands/update-profile-direct.command'
import { RequestProfileChangeCommand } from '../../application/commands/request-profile-change.command'
import { ApproveProfileChangeCommand } from '../../application/commands/approve-profile-change.command'
import { RejectProfileChangeCommand } from '../../application/commands/reject-profile-change.command'
import { TriggerOffboardingCommand } from '../../application/commands/trigger-offboarding.command'
import { ApproveOffboardingCommand } from '../../application/commands/approve-offboarding.command'
import { RejectOffboardingCommand } from '../../application/commands/reject-offboarding.command'
import { CompleteOffboardingCommand } from '../../application/commands/complete-offboarding.command'
import { CompleteTaskCommand } from '../../application/commands/complete-task.command'
import { GetProfileQuery } from '../../application/queries/get-profile.query'
import { ListEmployeesQuery } from '../../application/queries/list-employees.query'
import { ListProfileChangeRequestsQuery } from '../../application/queries/list-profile-change-requests.query'
import { ListOnboardingTasksQuery } from '../../application/queries/list-onboarding-tasks.query'
import { ListTemplatesQuery } from '../../application/queries/list-templates.query'
import { ListContractVersionsQuery } from '../../application/queries/list-contract-versions.query'
import { ListPeriodicReviewsQuery } from '../../application/queries/list-periodic-reviews.query'
import { PeopleTrpcService } from './people-trpc.service'

/**
 * Factory creating permission-aware people procedures.
 * Demonstrates middleware-level (getProfile, getOwnProfile) and handler-level (updateProfile) checks.
 * The existing peopleRouter export is kept for backward compatibility.
 */
export function createPeopleRouter(
  permissionProtectedProcedure: ReturnType<typeof publicProcedure.use>,
  peopleFacade: PeopleQueryFacade,
  kernelFacade: KernelQueryFacade,
  auditRepo: IAuditLogger,
) {
  type AuthCtx = TrpcContext & { actorId: string; tenantId: string }

  return router({
    getProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(({ ctx, input }) => {
        const { actorId: _actorId, tenantId } = ctx as unknown as AuthCtx
        return peopleFacade.getProfile(input.actorId, tenantId)
      }),

    getOwnProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:self:read' })
      .query(({ ctx }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        return peopleFacade.getOwnProfile(actorId, tenantId)
      }),

    updateProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:update' })
      .input(z.object({ actorId: z.string().uuid(), displayName: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { actorId, tenantId } = ctx as unknown as AuthCtx
        const profile = await peopleFacade.getProfile(input.actorId, tenantId)
        await checkPermission(kernelFacade, auditRepo, {
          actorId,
          tenantId,
          permission: 'people:profile:update',
          scopeType: 'department',
          scopeId: (profile as unknown as { departmentId: string }).departmentId,
        })
        return { success: true }
      }),
  })
}

const svc = () => PeopleTrpcService.getInstance()

export const peopleRouter = router({
  // ── Queries ────────────────────────────────────────────────────────────

  getProfile: publicProcedure
    .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new GetProfileQuery(input.actorId, input.tenantId))),

  listEmployees: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      svc().query(new ListEmployeesQuery(input.tenantId, input.limit, input.offset)),
    ),

  listProfileChangeRequests: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListProfileChangeRequestsQuery(input.tenantId))),

  listOnboardingTasks: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), caseId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListOnboardingTasksQuery(input.tenantId, input.caseId))),

  listOnboardingTemplates: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListTemplatesQuery(input.tenantId, 'onboarding'))),

  listOffboardingTemplates: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListTemplatesQuery(input.tenantId, 'offboarding'))),

  listContractVersions: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), profileId: z.string().uuid() }))
    .query(({ input }) =>
      svc().query(new ListContractVersionsQuery(input.tenantId, input.profileId)),
    ),

  listPeriodicReviews: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListPeriodicReviewsQuery(input.tenantId))),

  // ── Profile mutations ──────────────────────────────────────────────────

  createProfile: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        employeeCode: z.string().nullable(),
        companyEmail: z.string().nullable(),
        employmentType: z.enum(['permanent', 'fixed_term', 'contractor', 'intern']),
        hireDate: z.coerce.date(),
        jobTitle: z.string().nullable(),
        createdBy: z.string().uuid(),
        jobLevel: z.string().optional(),
        costCenter: z.string().optional(),
        workArrangement: z.enum(['onsite', 'hybrid', 'remote']).optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateEmploymentProfileCommand(
          input.tenantId,
          input.actorId,
          input.employeeCode,
          input.companyEmail,
          input.employmentType,
          input.hireDate,
          input.jobTitle,
          input.createdBy,
          input.jobLevel,
          input.costCenter,
          input.workArrangement,
        ),
      ),
    ),

  updateProfileDirect: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
        updatedBy: z.string().uuid(),
        fields: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new UpdateProfileDirectCommand(
          input.tenantId,
          input.profileId,
          input.updatedBy,
          input.fields,
        ),
      ),
    ),

  requestProfileChange: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
        requestedBy: z.string().uuid(),
        fieldPath: z.string(),
        oldValue: z.unknown(),
        newValue: z.unknown(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RequestProfileChangeCommand(
          input.tenantId,
          input.profileId,
          input.requestedBy,
          input.fieldPath,
          input.oldValue,
          input.newValue,
        ),
      ),
    ),

  approveProfileChange: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        changeRequestId: z.string().uuid(),
        approvedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ApproveProfileChangeCommand(input.tenantId, input.changeRequestId, input.approvedBy),
      ),
    ),

  rejectProfileChange: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        changeRequestId: z.string().uuid(),
        rejectedBy: z.string().uuid(),
        comment: z.string(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RejectProfileChangeCommand(
          input.tenantId,
          input.changeRequestId,
          input.rejectedBy,
          input.comment,
        ),
      ),
    ),

  // ── Offboarding mutations ──────────────────────────────────────────────

  triggerOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        profileId: z.string().uuid(),
        reason: z.string(),
        reasonCategory: z
          .enum(['voluntary', 'involuntary', 'redundancy', 'end_of_contract'])
          .nullable(),
        requestedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new TriggerOffboardingCommand(
          input.tenantId,
          input.profileId,
          input.reason,
          input.reasonCategory,
          input.requestedBy,
        ),
      ),
    ),

  approveOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        offboardingCaseId: z.string().uuid(),
        approvedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ApproveOffboardingCommand(input.tenantId, input.offboardingCaseId, input.approvedBy),
      ),
    ),

  rejectOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        offboardingCaseId: z.string().uuid(),
        rejectedBy: z.string().uuid(),
        comment: z.string(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RejectOffboardingCommand(
          input.tenantId,
          input.offboardingCaseId,
          input.rejectedBy,
          input.comment,
        ),
      ),
    ),

  completeOffboarding: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        offboardingCaseId: z.string().uuid(),
        completedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CompleteOffboardingCommand(input.tenantId, input.offboardingCaseId, input.completedBy),
      ),
    ),

  // ── Task completion ────────────────────────────────────────────────────

  completeTask: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        taskId: z.string().uuid(),
        taskType: z.enum(['onboarding', 'offboarding']),
        completedBy: z.string().uuid(),
        evidenceUrl: z.string().nullable(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CompleteTaskCommand(
          input.tenantId,
          input.taskId,
          input.taskType,
          input.completedBy,
          input.evidenceUrl,
        ),
      ),
    ),
})
