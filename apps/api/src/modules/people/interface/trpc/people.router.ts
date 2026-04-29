import * as z from 'zod'
import { TRPCError } from '@trpc/server'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import type { AuthContext } from '../../../../common/trpc/auth-middleware'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { PeopleQueryFacade } from '../../application/facades/people-query.facade'
// New commands
import { CreatePersonProfileCommand } from '../../application/commands/create-person-profile.command'
import { CreateEmploymentCommand } from '../../application/commands/create-employment.command'
import { CreateJobAssignmentCommand } from '../../application/commands/create-job-assignment.command'
import { CreateJobFamilyCommand } from '../../application/commands/create-job-family.command'
import { CreateJobProfileCommand } from '../../application/commands/create-job-profile.command'
import { UpdateEmploymentDetailCommand } from '../../application/commands/update-employment-detail.command'
// Lifecycle commands
import { ActivateEmploymentCommand } from '../../application/commands/activate-employment.command'
import { StartLeaveCommand } from '../../application/commands/start-leave.command'
import { ReturnFromLeaveCommand } from '../../application/commands/return-from-leave.command'
import { SuspendEmploymentCommand } from '../../application/commands/suspend-employment.command'
import { ReinstateSuspensionCommand } from '../../application/commands/reinstate-suspension.command'
import { GiveNoticeCommand } from '../../application/commands/give-notice.command'
import { TerminateEmploymentCommand } from '../../application/commands/terminate-employment.command'
import { CompleteTerminationCommand } from '../../application/commands/complete-termination.command'
import { RehireEmploymentCommand } from '../../application/commands/rehire-employment.command'
// Probation commands
import { ConfirmProbationCommand } from '../../application/commands/confirm-probation.command'
import { ExtendProbationCommand } from '../../application/commands/extend-probation.command'
import { FailProbationCommand } from '../../application/commands/fail-probation.command'
// Contract commands
import { CreateContractVersionCommand } from '../../application/commands/create-contract-version.command'
// Settings commands
import { CreateCustomFieldDefinitionCommand } from '../../application/commands/create-custom-field-definition.command'
import { UpdateCustomFieldDefinitionCommand } from '../../application/commands/update-custom-field-definition.command'
// Legacy commands (still functional)
import { RequestProfileChangeCommand } from '../../application/commands/request-profile-change.command'
import { ApproveProfileChangeCommand } from '../../application/commands/approve-profile-change.command'
import { RejectProfileChangeCommand } from '../../application/commands/reject-profile-change.command'
import { TriggerOffboardingCommand } from '../../application/commands/trigger-offboarding.command'
import { ApproveOffboardingCommand } from '../../application/commands/approve-offboarding.command'
import { RejectOffboardingCommand } from '../../application/commands/reject-offboarding.command'
import { CompleteOffboardingCommand } from '../../application/commands/complete-offboarding.command'
import { CompleteTaskCommand } from '../../application/commands/complete-task.command'
// New queries
import { GetPersonProfileQuery } from '../../application/queries/get-person-profile.query'
import { GetEmploymentQuery } from '../../application/queries/get-employment.query'
import { GetCurrentJobAssignmentQuery } from '../../application/queries/get-current-job-assignment.query'
import { ListEmploymentsQuery } from '../../application/queries/list-employments.query'
import { ListJobProfilesQuery } from '../../application/queries/list-job-profiles.query'
// Legacy queries (still functional)
import { ListProfileChangeRequestsQuery } from '../../application/queries/list-profile-change-requests.query'
import { ListOnboardingTasksQuery } from '../../application/queries/list-onboarding-tasks.query'
import { ListTemplatesQuery } from '../../application/queries/list-templates.query'
import { ListContractVersionsQuery } from '../../application/queries/list-contract-versions.query'
import { GetJobHistoryQuery } from '../../application/queries/get-job-history.query'
import { GetDirectReportsQuery } from '../../application/queries/get-direct-reports.query'
import { GetActivityFeedQuery } from '../../application/queries/get-activity-feed.query'
import { GetOrgChartContextQuery } from '../../application/queries/get-org-chart-context.query'
import { GetOrgChartChildrenQuery } from '../../application/queries/get-org-chart-children.query'
import { GetOrgChartTreeQuery } from '../../application/queries/get-org-chart-tree.query'
import { ORG_CHART_NODE_NOT_FOUND } from '../../application/services/org-chart-query.service'

import { UpdatePersonalProfileCommand } from '../../application/commands/update-personal-profile.command'
import { PeopleTrpcService } from './people-trpc.service'
import {
  futureListQuerySchema,
  futureExportQuerySchema,
} from '../../../../common/list/future-list.contract'
import type {
  FutureListQuery,
  FutureExportQuery,
} from '../../../../common/list/future-list.contract'
import type { ExportResult } from '../../application/queries/export-directory.handler'
import {
  EMPLOYMENT_STATUS_VALUES,
  WORKER_TYPE_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  WORK_ARRANGEMENT_VALUES,
  JOB_ASSIGNMENT_EVENT_TYPE_VALUES,
  TERMINATION_REASON_VALUES,
} from '../../domain/value-objects/employment-status'
import { NAME_DISPLAY_ORDER_VALUES } from '../../domain/value-objects/name-display-order'
// Probation queries
import { GetProbationRecordQuery } from '../../application/queries/get-probation-record.query'
// Plan 04 — change request commands
import { RequestProfileChangesCommand } from '../../application/commands/request-profile-changes.command'
import { BatchApproveChangesCommand } from '../../application/commands/batch-approve-changes.command'
import { BatchRejectChangesCommand } from '../../application/commands/batch-reject-changes.command'
// Plan 04 — document commands
import { UploadEmployeeDocumentCommand } from '../../application/commands/upload-employee-document.command'
import { AcknowledgePolicyCommand } from '../../application/commands/acknowledge-policy.command'
// Plan 04 — document & completeness queries
import { ListExpiringDocumentsQuery } from '../../application/queries/list-expiring-documents.query'
import { GetProfileCompletenessQuery } from '../../application/queries/get-profile-completeness.query'
import { ListIncompleteProfilesQuery } from '../../application/queries/list-incomplete-profiles.query'
// Plan 05 — directory queries
import { SearchDirectoryQuery } from '../../application/queries/search-directory.query'
import { ListDirectoryQuery } from '../../application/queries/list-directory.query'
import type { DirectorySearchIndexFilters } from '../../domain/repositories/directory-search-index.repository'
import type { DirectorySearchIndex } from '../../domain/entities/directory-search-index.entity'
import { ExportDirectoryQuery } from '../../application/queries/export-directory.query'
import { GetSharedProfileQuery } from '../../application/queries/get-shared-profile.query'
// Plan 05 — directory & utility commands
import { GenerateCompanyEmailCommand } from '../../application/commands/generate-company-email.command'
import { GenerateShareLinkCommand } from '../../application/commands/generate-share-link.command'
import { RevokeShareLinkCommand } from '../../application/commands/revoke-share-link.command'
import { BulkUpdateDepartmentCommand } from '../../application/commands/bulk-update-department.command'
import { UploadImportFileCommand } from '../../application/commands/upload-import-file.command'
import { MapImportColumnsCommand } from '../../application/commands/map-import-columns.command'
import { ValidateImportCommand } from '../../application/commands/validate-import.command'
import { CommitImportCommand } from '../../application/commands/commit-import.command'
import { ImportStagedMsUserCommand } from '../../application/commands/import-staged-ms-user.command'
import { SkipStagedMsUserCommand } from '../../application/commands/skip-staged-ms-user.command'
import { ResetStagedMsUserCommand } from '../../application/commands/reset-staged-ms-user.command'
import { ListStagedMsUsersQuery } from '../../application/queries/list-staged-ms-users.query'
import { GetMsSyncStatusQuery } from '../../application/queries/get-ms-sync-status.query'

const svc = () => PeopleTrpcService.getInstance()

export function createPeopleRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  peopleFacade: PeopleQueryFacade,
  kernelFacade: KernelQueryFacade,
  _auditFacade: KernelAuditFacade,
) {
  return router({
    // ── Profile queries ────────────────────────────────────────────────────
    getProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ actorId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { actorId: string } }) => {
        return peopleFacade.getPersonProfile(input.actorId, ctx.tenantId)
      }),

    getOwnProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:self:read' })
      .query(async ({ ctx }: { ctx: AuthContext }) => {
        return peopleFacade.getPersonProfile(ctx.actorId, ctx.tenantId)
      }),

    getEmployment: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ employmentId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { employmentId: string } }) => {
        return peopleFacade.getEmployment(ctx.tenantId, input.employmentId)
      }),

    getProfilePermissions: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ employmentId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { employmentId: string } }) => {
        const employment = await peopleFacade.getEmployment(ctx.tenantId, input.employmentId)
        const isSelf = employment?.personProfile?.actorId === ctx.actorId
        const perms = await kernelFacade.getEffectivePermissions(ctx.actorId, ctx.tenantId)
        const has = (p: string) => perms.includes(p)
        const isAdmin = has('people:admin')

        return {
          canEdit: isAdmin || has('people:profile:update'),
          canManage: isAdmin,
          isSelf,
          canEditPersonal: isAdmin || has('people:profile:update'),
          canEditEmployment: isAdmin || has('people:profile:update'),
          canEditBank: isAdmin || has('people:profile:update'),
          canUploadDocuments: isAdmin || has('people:profile:update'),
          canCreateContract: isAdmin || has('people:profile:update'),
          canViewSalary: isSelf || isAdmin || has('people:salary:read'),
          canApproveChanges: isAdmin,
        }
      }),

    listEmployments: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
          status: z.enum(EMPLOYMENT_STATUS_VALUES as [string, ...string[]]).optional(),
          countryCode: z.string().optional(),
        }),
      )
      .query(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            limit: number
            offset: number
            status?: string
            countryCode?: string
          }
        }) => {
          return peopleFacade.listEmployments(
            ctx.tenantId,
            input.limit,
            input.offset,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            input.status as any,
            input.countryCode,
          )
        },
      ),

    getCurrentAssignment: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ employmentId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { employmentId: string } }) => {
        return peopleFacade.getCurrentJobAssignment(ctx.tenantId, input.employmentId)
      }),

    getJobHistory: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ profileId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { profileId: string } }) => {
        return svc().query(new GetJobHistoryQuery(input.profileId, ctx.tenantId))
      }),

    getDirectReports: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(z.object({ employmentId: z.string().uuid() }))
      .query(async ({ ctx, input }: { ctx: AuthContext; input: { employmentId: string } }) => {
        return svc().query(new GetDirectReportsQuery(input.employmentId, ctx.tenantId))
      }),

    getActivityFeed: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(
        z.object({
          employmentId: z.string().uuid(),
          limit: z.number().int().min(1).max(50).default(20),
          cursor: z.string().optional(),
        }),
      )
      .query(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: { employmentId: string; limit: number; cursor?: string }
        }) => {
          return svc().query(
            new GetActivityFeedQuery(input.employmentId, ctx.tenantId, input.limit, input.cursor),
          )
        },
      ),

    listJobProfiles: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(
        z.object({
          familyId: z.string().uuid().optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .query(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: { familyId?: string; isActive?: boolean }
        }) => {
          return peopleFacade.listJobProfiles(ctx.tenantId, input.familyId, input.isActive)
        },
      ),

    listJobFamilies: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .query(async ({ ctx }: { ctx: AuthContext }) => {
        // Job families listed through svc (QueryBus) — no facade method needed
        return svc().query({ tenantId: ctx.tenantId })
      }),

    // ── Profile mutations ──────────────────────────────────────────────────
    createPersonProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:create' })
      .input(
        z.object({
          actorId: z.string().uuid(),
          familyName: z.string(),
          givenName: z.string(),
          middleName: z.string().nullable().optional(),
          nameDisplayOrder: z.enum(NAME_DISPLAY_ORDER_VALUES as [string, ...string[]]),
          dateOfBirth: z.coerce.date().nullable().optional(),
          gender: z.enum(['male', 'female', 'other', 'undisclosed']).nullable().optional(),
          nationality: z.string().nullable().optional(),
          preferredName: z.string().nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            actorId: string
            familyName: string
            givenName: string
            middleName?: string | null
            nameDisplayOrder: string
            dateOfBirth?: Date | null
            gender?: 'male' | 'female' | 'other' | 'undisclosed' | null
            nationality?: string | null
            preferredName?: string | null
          }
        }) => {
          return svc().command(
            new CreatePersonProfileCommand(
              ctx.tenantId,
              input.actorId,
              input.familyName,
              input.givenName,
              input.middleName ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input.nameDisplayOrder as any,
              ctx.actorId,
              input.dateOfBirth,
              input.gender,
              input.nationality,
              input.preferredName,
            ),
          )
        },
      ),

    createEmployment: permissionProtectedProcedure
      .meta({ permission: 'people:profile:create' })
      .input(
        z.object({
          personProfileId: z.string().uuid(),
          workerType: z.enum(WORKER_TYPE_VALUES as [string, ...string[]]),
          employmentType: z.enum(EMPLOYMENT_TYPE_VALUES as [string, ...string[]]),
          countryCode: z.string(),
          hireDate: z.coerce.date(),
          employeeCode: z.string().nullable().optional(),
          companyEmail: z.string().nullable().optional(),
          originalHireDate: z.coerce.date().nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            personProfileId: string
            workerType: string
            employmentType: string
            countryCode: string
            hireDate: Date
            employeeCode?: string | null
            companyEmail?: string | null
            originalHireDate?: Date | null
          }
        }) => {
          return svc().command(
            new CreateEmploymentCommand(
              ctx.tenantId,
              input.personProfileId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input.workerType as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input.employmentType as any,
              input.countryCode,
              input.hireDate,
              ctx.actorId,
              input.employeeCode,
              input.companyEmail,
              input.originalHireDate,
            ),
          )
        },
      ),

    createJobAssignment: permissionProtectedProcedure
      .meta({ permission: 'people:profile:update' })
      .input(
        z.object({
          employmentId: z.string().uuid(),
          jobProfileId: z.string().uuid(),
          effectiveFrom: z.coerce.date(),
          eventType: z.enum(JOB_ASSIGNMENT_EVENT_TYPE_VALUES as [string, ...string[]]),
          departmentId: z.string().uuid().nullable().optional(),
          locationId: z.string().uuid().nullable().optional(),
          costCenterId: z.string().uuid().nullable().optional(),
          workArrangement: z
            .enum(WORK_ARRANGEMENT_VALUES as [string, ...string[]])
            .nullable()
            .optional(),
          managerId: z.string().uuid().nullable().optional(),
          reason: z.string().nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            employmentId: string
            jobProfileId: string
            effectiveFrom: Date
            eventType: string
            departmentId?: string | null
            locationId?: string | null
            costCenterId?: string | null
            workArrangement?: string | null
            managerId?: string | null
            reason?: string | null
          }
        }) => {
          return svc().command(
            new CreateJobAssignmentCommand(
              ctx.tenantId,
              input.employmentId,
              input.jobProfileId,
              input.effectiveFrom,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input.eventType as any,
              ctx.actorId,
              input.departmentId,
              input.locationId,
              input.costCenterId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              input.workArrangement as any,
              input.managerId,
              input.reason,
            ),
          )
        },
      ),

    createJobFamily: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(
        z.object({
          name: z.string(),
          description: z.string().nullable().optional(),
          parentId: z.string().uuid().nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: { name: string; description?: string | null; parentId?: string | null }
        }) => {
          return svc().command(
            new CreateJobFamilyCommand(
              ctx.tenantId,
              input.name,
              ctx.actorId,
              input.description,
              input.parentId,
            ),
          )
        },
      ),

    createJobProfile: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(
        z.object({
          jobFamilyId: z.string().uuid(),
          title: z.string(),
          level: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            jobFamilyId: string
            title: string
            level?: string | null
            description?: string | null
          }
        }) => {
          return svc().command(
            new CreateJobProfileCommand(
              ctx.tenantId,
              input.jobFamilyId,
              input.title,
              ctx.actorId,
              input.level,
              input.description,
            ),
          )
        },
      ),

    updateEmploymentDetail: permissionProtectedProcedure
      .meta({ permission: 'people:profile:update' })
      .input(
        z.object({
          employmentId: z.string().uuid(),
          nationalId: z.string().nullable().optional(),
          nationalIdType: z.string().nullable().optional(),
          nationalIdIssuedDate: z.coerce.date().nullable().optional(),
          nationalIdExpiryDate: z.coerce.date().nullable().optional(),
          taxId: z.string().nullable().optional(),
          socialInsuranceId: z.string().nullable().optional(),
          passportNumber: z.string().nullable().optional(),
          passportExpiryDate: z.coerce.date().nullable().optional(),
          bankAccountNumber: z.string().nullable().optional(),
          bankName: z.string().nullable().optional(),
          bankBranch: z.string().nullable().optional(),
          bankAccountHolder: z.string().nullable().optional(),
          bankSwiftCode: z.string().nullable().optional(),
          personalEmail: z.string().nullable().optional(),
          personalPhone: z.string().nullable().optional(),
          permanentAddress: z.record(z.string(), z.unknown()).nullable().optional(),
          currentAddress: z.record(z.string(), z.unknown()).nullable().optional(),
          emergencyContacts: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
          countryData: z.record(z.string(), z.unknown()).nullable().optional(),
          customFields: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            employmentId: string
            nationalId?: string | null
            nationalIdType?: string | null
            nationalIdIssuedDate?: Date | null
            nationalIdExpiryDate?: Date | null
            taxId?: string | null
            socialInsuranceId?: string | null
            passportNumber?: string | null
            passportExpiryDate?: Date | null
            bankAccountNumber?: string | null
            bankName?: string | null
            bankBranch?: string | null
            bankAccountHolder?: string | null
            bankSwiftCode?: string | null
            personalEmail?: string | null
            personalPhone?: string | null
            permanentAddress?: Record<string, unknown> | null
            currentAddress?: Record<string, unknown> | null
            emergencyContacts?: Array<Record<string, unknown>> | null
            countryData?: Record<string, unknown> | null
            customFields?: Record<string, unknown> | null
          }
        }) => {
          return svc().command(
            new UpdateEmploymentDetailCommand(
              ctx.tenantId,
              input.employmentId,
              ctx.actorId,
              input.nationalId,
              input.nationalIdType,
              input.nationalIdIssuedDate,
              input.nationalIdExpiryDate,
              input.taxId,
              input.socialInsuranceId,
              input.passportNumber,
              input.passportExpiryDate,
              input.bankAccountNumber,
              input.bankName,
              input.bankBranch,
              input.bankAccountHolder,
              input.bankSwiftCode,
              input.personalEmail,
              input.personalPhone,
              input.permanentAddress,
              input.currentAddress,
              input.emergencyContacts,
              input.countryData,
              input.customFields,
            ),
          )
        },
      ),

    // ── Org chart ────────────────────────────────────────────────────────
    orgChart: router({
      context: permissionProtectedProcedure
        .meta({ permission: 'people:org:read' })
        .query(async ({ ctx }: { ctx: AuthContext }) => {
          return svc().query(new GetOrgChartContextQuery(ctx.tenantId, ctx.actorId))
        }),

      children: permissionProtectedProcedure
        .meta({ permission: 'people:org:read' })
        .input(z.object({ employmentId: z.string().uuid() }))
        .query(async ({ ctx, input }: { ctx: AuthContext; input: { employmentId: string } }) => {
          try {
            return await svc().query(new GetOrgChartChildrenQuery(ctx.tenantId, input.employmentId))
          } catch (error) {
            if (error instanceof Error && error.message === ORG_CHART_NODE_NOT_FOUND) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Org chart node not found' })
            }

            throw error
          }
        }),

      tree: permissionProtectedProcedure
        .meta({ permission: 'people:org:read' })
        .input(
          z.object({
            depth: z.number().int().min(1).max(5).default(3),
            teamId: z.string().uuid().nullable().optional(),
          }),
        )
        .query(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: { depth: number; teamId?: string | null }
          }) => {
            return svc().query(
              new GetOrgChartTreeQuery(
                ctx.tenantId,
                ctx.actorId,
                input.teamId ?? null,
                input.depth,
              ),
            )
          },
        ),
    }),

    // ── Directory ─────────────────────────────────────────────────────────
    directory: router({
      list: permissionProtectedProcedure
        .meta({ permission: 'people:directory:read' })
        .input(futureListQuerySchema)
        .query(async ({ input, ctx }: { input: FutureListQuery; ctx: AuthContext }) => {
          const { pageIndex, pageSize } = input.pagination
          const offset = pageIndex * pageSize

          // Map futureListQuery filters to DirectorySearchIndexFilters
          const filters: DirectorySearchIndexFilters = {}
          for (const f of input.filters) {
            if (f.operator === 'in' || f.operator === 'not_in') {
              const arr = (f.value as Array<string | number | boolean>).map(String)
              if (f.field === 'employmentStatus') filters.employmentStatus = arr
              else if (f.field === 'workArrangement') filters.workArrangement = arr
              else if (f.field === 'countryCode') filters.countryCode = arr
            } else {
              const val = String(f.value)
              if (f.field === 'departmentId') filters.departmentId = val
              else if (f.field === 'employmentStatus') filters.employmentStatus = val
              else if (f.field === 'workArrangement') filters.workArrangement = val
              else if (f.field === 'countryCode') filters.countryCode = val
              else if (f.field === 'locationId') filters.locationId = val
              else if (f.field === 'managerId') filters.managerId = val
              else if (f.field === 'jobProfileId') filters.jobProfileId = val
              else if (f.field === 'jobFamilyId') filters.jobFamilyId = val
              else if (f.field === 'hiredAfter') filters.hiredAfter = new Date(val)
              else if (f.field === 'hireDateTo') filters.hiredBefore = new Date(val)
            }
          }

          let items: DirectorySearchIndex[]
          let total: number

          if (input.search.trim()) {
            const result = (await svc().query(
              new SearchDirectoryQuery(ctx.tenantId, input.search, filters, pageSize, offset),
            )) as { items: DirectorySearchIndex[]; total: number }
            items = result.items
            total = result.total
          } else {
            const result = (await svc().query(
              new ListDirectoryQuery(ctx.tenantId, filters, pageSize, offset),
            )) as { items: DirectorySearchIndex[]; total: number }
            items = result.items
            total = result.total
          }

          const rows = items.map((item) => ({
            id: item.employmentId,
            personProfileId: item.employmentId,
            avatarUrl: null,
            fullName: item.fullName,
            preferredName: null,
            jobTitle: item.jobTitle ?? '',
            jobLevel: item.jobLevel ?? null,
            department: item.departmentName ?? '',
            departmentId: '',
            location: item.locationName ?? null,
            countryCode: item.countryCode,
            companyEmail: item.companyEmail,
            employmentStatus: item.employmentStatus,
            employmentType: 'permanent',
            workerType: 'employee',
            workArrangement: item.workArrangement ?? null,
            managerId: null,
            managerName: item.managerName ?? null,
            hireDate: item.hireDate ? item.hireDate.toISOString().split('T')[0] : '',
          }))

          return {
            rows,
            totalCount: total,
            pageCount: Math.ceil(total / pageSize),
            pageIndex,
            pageSize,
            facets: { departments: [], jobFamilies: [], countries: [], locations: [] },
          }
        }),

      export: permissionProtectedProcedure
        .meta({ permission: 'people:directory:read' })
        .input(futureExportQuerySchema)
        .query(async ({ input, ctx }: { input: FutureExportQuery; ctx: AuthContext }) => {
          const filters: DirectorySearchIndexFilters = {}
          for (const f of input.filters) {
            if (f.operator === 'in' || f.operator === 'not_in') {
              const arr = (f.value as Array<string | number | boolean>).map(String)
              if (f.field === 'employmentStatus') filters.employmentStatus = arr
              else if (f.field === 'workArrangement') filters.workArrangement = arr
              else if (f.field === 'countryCode') filters.countryCode = arr
            } else {
              const val = String(f.value)
              if (f.field === 'departmentId') filters.departmentId = val
              else if (f.field === 'employmentStatus') filters.employmentStatus = val
              else if (f.field === 'workArrangement') filters.workArrangement = val
              else if (f.field === 'countryCode') filters.countryCode = val
              else if (f.field === 'locationId') filters.locationId = val
              else if (f.field === 'managerId') filters.managerId = val
              else if (f.field === 'hiredAfter') filters.hiredAfter = new Date(val)
              else if (f.field === 'hireDateTo') filters.hiredBefore = new Date(val)
            }
          }
          const result = (await svc().query(
            new ExportDirectoryQuery(ctx.tenantId, ctx.actorId, filters, 'csv', input.columns),
          )) as ExportResult
          return {
            filename: result.filename,
            csv: result.data.toString('utf-8').replace(/^\uFEFF/, ''),
          }
        }),

      // ── Plan 05: new CQRS-backed directory endpoints ─────────────────
      search: permissionProtectedProcedure
        .meta({ permission: 'people:directory:read' })
        .input(
          z.object({
            query: z.string(),
            filters: z
              .object({
                departmentId: z.string().uuid().optional(),
                jobProfileId: z.string().uuid().optional(),
                jobFamilyId: z.string().uuid().optional(),
                jobLevel: z.string().optional(),
                managerId: z.string().uuid().optional(),
                employmentStatus: z.string().optional(),
                employmentType: z.string().optional(),
                workerType: z.string().optional(),
                workArrangement: z.string().optional(),
                locationId: z.string().uuid().optional(),
                countryCode: z.string().optional(),
                hiredAfter: z.date().optional(),
                hiredBefore: z.date().optional(),
              })
              .default({}),
            limit: z.number().int().min(1).max(100).default(25),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .query(
          ({
            input,
            ctx,
          }: {
            input: {
              query: string
              filters: Record<string, unknown>
              limit: number
              offset: number
            }
            ctx: AuthContext
          }) =>
            svc().query(
              new SearchDirectoryQuery(
                ctx.tenantId,
                input.query,
                input.filters as never,
                input.limit,
                input.offset,
              ),
            ),
        ),

      listDirectory: permissionProtectedProcedure
        .meta({ permission: 'people:directory:read' })
        .input(
          z.object({
            filters: z
              .object({
                departmentId: z.string().uuid().optional(),
                jobProfileId: z.string().uuid().optional(),
                jobFamilyId: z.string().uuid().optional(),
                jobLevel: z.string().optional(),
                managerId: z.string().uuid().optional(),
                employmentStatus: z.string().optional(),
                employmentType: z.string().optional(),
                workerType: z.string().optional(),
                workArrangement: z.string().optional(),
                locationId: z.string().uuid().optional(),
                countryCode: z.string().optional(),
                hiredAfter: z.date().optional(),
                hiredBefore: z.date().optional(),
              })
              .default({}),
            limit: z.number().int().min(1).max(100).default(25),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .query(
          ({
            input,
            ctx,
          }: {
            input: { filters: Record<string, unknown>; limit: number; offset: number }
            ctx: AuthContext
          }) =>
            svc().query(
              new ListDirectoryQuery(
                ctx.tenantId,
                input.filters as never,
                input.limit,
                input.offset,
              ),
            ),
        ),

      exportDirectory: permissionProtectedProcedure
        .meta({ permission: 'people:directory:export' })
        .input(
          z.object({
            filters: z
              .object({
                departmentId: z.string().uuid().optional(),
                jobProfileId: z.string().uuid().optional(),
                jobFamilyId: z.string().uuid().optional(),
                jobLevel: z.string().optional(),
                managerId: z.string().uuid().optional(),
                employmentStatus: z.string().optional(),
                employmentType: z.string().optional(),
                workerType: z.string().optional(),
                workArrangement: z.string().optional(),
                locationId: z.string().uuid().optional(),
                countryCode: z.string().optional(),
                hiredAfter: z.date().optional(),
                hiredBefore: z.date().optional(),
              })
              .default({}),
            format: z.enum(['csv', 'xlsx']).default('csv'),
            columns: z.array(z.string()).optional(),
          }),
        )
        .mutation(
          ({
            input,
            ctx,
          }: {
            input: { filters: Record<string, unknown>; format: 'csv' | 'xlsx'; columns?: string[] }
            ctx: AuthContext
          }) =>
            svc().query(
              new ExportDirectoryQuery(
                ctx.tenantId,
                ctx.actorId,
                input.filters as never,
                input.format,
                input.columns,
              ),
            ),
        ),
    }),

    // ── Share Links ────────────────────────────────────────────────────────
    shareLink: router({
      generate: permissionProtectedProcedure
        .meta({ permission: 'people:shareLink:create' })
        .input(
          z.object({
            employmentId: z.string().uuid(),
            expiresInDays: z.number().int().min(1).max(90).default(7),
            maxViews: z.number().int().min(1).optional(),
          }),
        )
        .mutation(
          ({
            input,
            ctx,
          }: {
            input: { employmentId: string; expiresInDays: number; maxViews?: number }
            ctx: AuthContext
          }) =>
            svc().command(
              new GenerateShareLinkCommand(
                ctx.tenantId,
                input.employmentId,
                ctx.actorId,
                input.expiresInDays,
                input.maxViews,
              ),
            ),
        ),

      getShared: publicProcedure
        .input(z.object({ token: z.string() }))
        .query(({ input }: { input: { token: string } }) =>
          svc().query(new GetSharedProfileQuery(input.token)),
        ),

      revoke: permissionProtectedProcedure
        .meta({ permission: 'people:shareLink:revoke' })
        .input(z.object({ shareLinkId: z.string().uuid() }))
        .mutation(({ input, ctx }: { input: { shareLinkId: string }; ctx: AuthContext }) =>
          svc().command(new RevokeShareLinkCommand(ctx.tenantId, input.shareLinkId, ctx.actorId)),
        ),
    }),

    // ── Email Generation ───────────────────────────────────────────────────
    email: router({
      generate: permissionProtectedProcedure
        .meta({ permission: 'people:email:generate' })
        .input(
          z.object({
            employmentId: z.string().uuid(),
            overrideEmail: z.string().email().optional(),
          }),
        )
        .mutation(
          ({
            input,
            ctx,
          }: {
            input: { employmentId: string; overrideEmail?: string }
            ctx: AuthContext
          }) =>
            svc().command(
              new GenerateCompanyEmailCommand(
                ctx.tenantId,
                input.employmentId,
                input.overrideEmail,
              ),
            ),
        ),
    }),

    // ── Bulk Operations ────────────────────────────────────────────────────
    bulk: router({
      updateDepartment: permissionProtectedProcedure
        .meta({ permission: 'people:bulk:write' })
        .input(
          z.object({
            employmentIds: z.array(z.string().uuid()).min(1),
            newDepartmentId: z.string().uuid(),
            effectiveFrom: z.date(),
            reason: z.string(),
          }),
        )
        .mutation(
          ({
            input,
            ctx,
          }: {
            input: {
              employmentIds: string[]
              newDepartmentId: string
              effectiveFrom: Date
              reason: string
            }
            ctx: AuthContext
          }) =>
            svc().command(
              new BulkUpdateDepartmentCommand(
                ctx.tenantId,
                input.employmentIds,
                input.newDepartmentId,
                input.effectiveFrom,
                input.reason,
                ctx.actorId,
              ),
            ),
        ),
    }),

    // ── Import ─────────────────────────────────────────────────────────────
    import: router({
      upload: permissionProtectedProcedure
        .meta({ permission: 'people:import:write' })
        .input(
          z.object({
            fileDocumentId: z.string().uuid(),
            fileName: z.string(),
            rowCount: z.number().int().positive(),
          }),
        )
        .mutation(
          ({
            input,
            ctx,
          }: {
            input: { fileDocumentId: string; fileName: string; rowCount: number }
            ctx: AuthContext
          }) =>
            svc().command(
              new UploadImportFileCommand(
                ctx.tenantId,
                input.fileDocumentId,
                input.fileName,
                input.rowCount,
                ctx.actorId,
              ),
            ),
        ),

      mapColumns: permissionProtectedProcedure
        .meta({ permission: 'people:import:write' })
        .input(
          z.object({
            importJobId: z.string().uuid(),
            columnMapping: z.record(z.string(), z.string()),
            saveMappingProfile: z.string().optional(),
          }),
        )
        .mutation(
          ({
            input,
            ctx,
          }: {
            input: {
              importJobId: string
              columnMapping: Record<string, string>
              saveMappingProfile?: string
            }
            ctx: AuthContext
          }) =>
            svc().command(
              new MapImportColumnsCommand(
                ctx.tenantId,
                input.importJobId,
                input.columnMapping,
                input.saveMappingProfile,
              ),
            ),
        ),

      validate: permissionProtectedProcedure
        .meta({ permission: 'people:import:write' })
        .input(z.object({ importJobId: z.string().uuid() }))
        .mutation(({ input, ctx }: { input: { importJobId: string }; ctx: AuthContext }) =>
          svc().command(new ValidateImportCommand(ctx.tenantId, input.importJobId)),
        ),

      commit: permissionProtectedProcedure
        .meta({ permission: 'people:import:write' })
        .input(z.object({ importJobId: z.string().uuid() }))
        .mutation(({ input, ctx }: { input: { importJobId: string }; ctx: AuthContext }) =>
          svc().command(new CommitImportCommand(ctx.tenantId, input.importJobId, ctx.actorId)),
        ),
    }),

    // ── Settings ──────────────────────────────────────────────────────────
    settings: router({
      getCountryFieldConfigs: permissionProtectedProcedure
        .meta({ permission: 'people:settings:read' })
        .input(z.object({ countryCode: z.string().length(2) }))
        .query(async ({ ctx, input }: { ctx: AuthContext; input: { countryCode: string } }) => {
          return peopleFacade.getCountryFieldConfigs(input.countryCode, ctx.tenantId)
        }),

      listCustomFieldDefinitions: permissionProtectedProcedure
        .meta({ permission: 'people:settings:read' })
        .query(async ({ ctx }: { ctx: AuthContext }) => {
          return peopleFacade.listCustomFieldDefinitions(ctx.tenantId)
        }),

      createCustomFieldDefinition: permissionProtectedProcedure
        .meta({ permission: 'people:settings:write' })
        .input(
          z.object({
            fieldKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
            label: z.string().min(1),
            fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select', 'multi_select']),
            fieldGroup: z.string().optional(),
            isRequired: z.boolean().default(false),
            isSearchable: z.boolean().default(false),
            isFilterable: z.boolean().default(false),
            sortOrder: z.number().int().default(0),
            validation: z.record(z.string(), z.unknown()).optional(),
            options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
            visibilityTier: z.enum(['public', 'restricted', 'confidential']).default('public'),
          }),
        )
        .mutation(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: {
              fieldKey: string
              label: string
              fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select'
              fieldGroup?: string
              isRequired: boolean
              isSearchable: boolean
              isFilterable: boolean
              sortOrder: number
              validation?: Record<string, unknown>
              options?: Array<{ value: string; label: string }>
              visibilityTier: 'public' | 'restricted' | 'confidential'
            }
          }) => {
            return svc().command(
              new CreateCustomFieldDefinitionCommand(
                ctx.tenantId,
                input.fieldKey,
                input.label,
                input.fieldType,
                ctx.actorId,
                input.fieldGroup,
                input.isRequired,
                input.isSearchable,
                input.isFilterable,
                input.sortOrder,
                input.validation,
                input.options,
                input.visibilityTier,
              ),
            )
          },
        ),

      updateCustomFieldDefinition: permissionProtectedProcedure
        .meta({ permission: 'people:settings:write' })
        .input(
          z.object({
            id: z.string().uuid(),
            label: z.string().optional(),
            fieldGroup: z.string().nullable().optional(),
            isRequired: z.boolean().optional(),
            isSearchable: z.boolean().optional(),
            isFilterable: z.boolean().optional(),
            sortOrder: z.number().int().optional(),
            validation: z.record(z.string(), z.unknown()).nullable().optional(),
            options: z
              .array(z.object({ value: z.string(), label: z.string() }))
              .nullable()
              .optional(),
            visibilityTier: z.enum(['public', 'restricted', 'confidential']).optional(),
            isActive: z.boolean().optional(),
          }),
        )
        .mutation(
          async ({
            ctx,
            input,
          }: {
            ctx: AuthContext
            input: {
              id: string
              label?: string
              fieldGroup?: string | null
              isRequired?: boolean
              isSearchable?: boolean
              isFilterable?: boolean
              sortOrder?: number
              validation?: Record<string, unknown> | null
              options?: Array<{ value: string; label: string }> | null
              visibilityTier?: 'public' | 'restricted' | 'confidential'
              isActive?: boolean
            }
          }) => {
            return svc().command(
              new UpdateCustomFieldDefinitionCommand(
                ctx.tenantId,
                input.id,
                ctx.actorId,
                input.label,
                input.fieldGroup,
                input.isRequired,
                input.isSearchable,
                input.isFilterable,
                input.sortOrder,
                input.validation,
                input.options,
                input.visibilityTier,
                input.isActive,
              ),
            )
          },
        ),

      listFieldVisibilityConfigs: permissionProtectedProcedure
        .meta({ permission: 'people:settings:read' })
        .query(async ({ ctx }: { ctx: AuthContext }) => {
          return peopleFacade.listFieldVisibilityConfigs(ctx.tenantId)
        }),

      listFieldEditPolicies: permissionProtectedProcedure
        .meta({ permission: 'people:settings:read' })
        .query(async ({ ctx }: { ctx: AuthContext }) => {
          return peopleFacade.listFieldEditPolicies(ctx.tenantId)
        }),
    }),

    // ── MS staged import routes ────────────────────────────────────────────
    getMsSyncStatus: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .query(async ({ ctx }: { ctx: AuthContext }) => {
        return svc().query(new GetMsSyncStatusQuery(ctx.tenantId))
      }),

    listStagedMsUsers: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(
        z.object({
          status: z.enum(['pending', 'imported', 'skipped']).default('pending'),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: { status: 'pending' | 'imported' | 'skipped'; limit: number; offset: number }
        }) => {
          return svc().query(
            new ListStagedMsUsersQuery(ctx.tenantId, input.status, input.limit, input.offset),
          )
        },
      ),

    importStagedMsUser: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { id: string } }) => {
        return svc().command(new ImportStagedMsUserCommand(ctx.tenantId, input.id, ctx.actorId))
      }),

    skipStagedMsUser: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { id: string } }) => {
        return svc().command(new SkipStagedMsUserCommand(ctx.tenantId, input.id))
      }),

    bulkImportStagedMsUsers: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }))
      .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { ids: string[] } }) => {
        const results: Array<{ id: string; employmentId?: string; error?: string }> = []
        for (const id of input.ids) {
          try {
            const employmentId = (await svc().command(
              new ImportStagedMsUserCommand(ctx.tenantId, id, ctx.actorId),
            )) as string
            results.push({ id, employmentId })
          } catch (err) {
            results.push({ id, error: (err as Error).message })
          }
        }
        return results
      }),

    bulkSkipStagedMsUsers: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }))
      .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { ids: string[] } }) => {
        const results: Array<{ id: string; error?: string }> = []
        for (const id of input.ids) {
          try {
            await svc().command(new SkipStagedMsUserCommand(ctx.tenantId, id))
            results.push({ id })
          } catch (err) {
            results.push({ id, error: (err as Error).message })
          }
        }
        return results
      }),

    resetStagedMsUser: permissionProtectedProcedure
      .meta({ permission: 'people:admin' })
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }: { ctx: AuthContext; input: { id: string } }) => {
        return svc().command(new ResetStagedMsUserCommand(ctx.tenantId, input.id))
      }),

    // ── Update personal profile mutation ──────────────────────────────────
    updatePersonalProfile: permissionProtectedProcedure
      .meta({ permission: 'people:profile:read' })
      .input(
        z.object({
          employmentId: z.string().uuid(),
          preferredName: z.string().nullable().optional(),
          dateOfBirth: z.string().date().nullable().optional(),
          gender: z
            .enum(['male', 'female', 'non_binary', 'prefer_not_to_say'])
            .nullable()
            .optional(),
          nationality: z.string().nullable().optional(),
          maritalStatus: z
            .enum(['single', 'married', 'divorced', 'widowed', 'separated'])
            .nullable()
            .optional(),
          nameDisplayOrder: z.enum(['family_first', 'given_first']).optional(),
          personalEmail: z.string().email().nullable().optional(),
          personalPhone: z.string().nullable().optional(),
          permanentAddress: z.record(z.string(), z.unknown()).nullable().optional(),
          currentAddress: z.record(z.string(), z.unknown()).nullable().optional(),
          nationalId: z.string().nullable().optional(),
          nationalIdType: z.string().nullable().optional(),
          nationalIdIssuedDate: z.string().date().nullable().optional(),
          nationalIdExpiryDate: z.string().date().nullable().optional(),
          passportNumber: z.string().nullable().optional(),
          passportExpiryDate: z.string().date().nullable().optional(),
          bankAccountNumber: z.string().nullable().optional(),
          bankName: z.string().nullable().optional(),
          bankBranch: z.string().nullable().optional(),
          bankSwiftCode: z.string().nullable().optional(),
          bankAccountHolder: z.string().nullable().optional(),
          emergencyContacts: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            employmentId: string
            preferredName?: string | null
            dateOfBirth?: string | null
            gender?: string | null
            nationality?: string | null
            maritalStatus?: string | null
            nameDisplayOrder?: 'family_first' | 'given_first'
            personalEmail?: string | null
            personalPhone?: string | null
            permanentAddress?: Record<string, unknown> | null
            currentAddress?: Record<string, unknown> | null
            nationalId?: string | null
            nationalIdType?: string | null
            nationalIdIssuedDate?: string | null
            nationalIdExpiryDate?: string | null
            passportNumber?: string | null
            passportExpiryDate?: string | null
            bankAccountNumber?: string | null
            bankName?: string | null
            bankBranch?: string | null
            bankSwiftCode?: string | null
            bankAccountHolder?: string | null
            emergencyContacts?: Array<Record<string, unknown>> | null
          }
        }) => {
          const employment = await peopleFacade.getEmployment(ctx.tenantId, input.employmentId)
          const isSelf = employment?.personProfile?.actorId === ctx.actorId
          const perms = await kernelFacade.getEffectivePermissions(ctx.actorId, ctx.tenantId)
          const has = (p: string) => perms.includes(p)
          const isAdmin = has('people:admin')
          const canEdit = isAdmin || has('people:profile:update')
          const canEditBank = isAdmin || has('people:profile:update')

          const hasBankFields =
            input.bankAccountNumber !== undefined ||
            input.bankName !== undefined ||
            input.bankBranch !== undefined ||
            input.bankSwiftCode !== undefined ||
            input.bankAccountHolder !== undefined

          if (hasBankFields && !canEditBank) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot edit bank details' })
          }

          if (!isSelf && !canEdit) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot edit this profile' })
          }

          const toDate = (s: string | null | undefined) => (s ? new Date(s) : s)

          return svc().command(
            new UpdatePersonalProfileCommand(
              ctx.tenantId,
              input.employmentId,
              ctx.actorId,
              input.preferredName,
              toDate(input.dateOfBirth) as Date | null | undefined,
              input.gender,
              input.nationality,
              input.maritalStatus,
              input.nameDisplayOrder,
              input.personalEmail,
              input.personalPhone,
              input.permanentAddress,
              input.currentAddress,
              input.nationalId,
              input.nationalIdType,
              toDate(input.nationalIdIssuedDate) as Date | null | undefined,
              toDate(input.nationalIdExpiryDate) as Date | null | undefined,
              input.passportNumber,
              toDate(input.passportExpiryDate) as Date | null | undefined,
              input.bankAccountNumber,
              input.bankName,
              input.bankBranch,
              input.bankSwiftCode,
              input.bankAccountHolder,
              input.emergencyContacts,
            ),
          )
        },
      ),

    // ── Lifecycle mutations ────────────────────────────────────────────────
    rehire: permissionProtectedProcedure
      .meta({ permission: 'people:employment:rehire' })
      .input(
        z.object({
          previousProfileId: z.string().uuid(),
          rehireDate: z.coerce.date(),
          workerType: z.enum(['employee', 'contingent']),
          employmentType: z.enum(['permanent', 'fixed_term', 'intern']),
          countryCode: z.string().min(2).max(3),
          jobTitle: z.string().nullable().optional(),
          departmentId: z.string().uuid().nullable().optional(),
          managerProfileId: z.string().uuid().nullable().optional(),
        }),
      )
      .mutation(
        async ({
          ctx,
          input,
        }: {
          ctx: AuthContext
          input: {
            previousProfileId: string
            rehireDate: Date
            workerType: 'employee' | 'contingent'
            employmentType: 'permanent' | 'fixed_term' | 'intern'
            countryCode: string
            jobTitle?: string | null
            departmentId?: string | null
            managerProfileId?: string | null
          }
        }) =>
          svc().command(
            new RehireEmploymentCommand(
              ctx.tenantId,
              input.previousProfileId,
              input.rehireDate,
              input.workerType,
              input.employmentType,
              input.countryCode,
              input.jobTitle ?? null,
              input.departmentId ?? null,
              input.managerProfileId ?? null,
              ctx.actorId,
            ),
          ),
      ),
  })
}

export const peopleRouter = router({
  // ── Queries ────────────────────────────────────────────────────────────

  getPersonProfile: publicProcedure
    .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new GetPersonProfileQuery(input.actorId, input.tenantId))),

  getEmployment: publicProcedure
    .input(z.object({ employmentId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new GetEmploymentQuery(input.employmentId, input.tenantId))),

  listEmployments: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        status: z.enum(EMPLOYMENT_STATUS_VALUES as [string, ...string[]]).optional(),
        countryCode: z.string().optional(),
      }),
    )
    .query(({ input }) =>
      svc().query(
        new ListEmploymentsQuery(
          input.tenantId,
          input.limit,
          input.offset,
          input.status as never,
          input.countryCode,
        ),
      ),
    ),

  getCurrentAssignment: publicProcedure
    .input(z.object({ employmentId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) =>
      svc().query(new GetCurrentJobAssignmentQuery(input.employmentId, input.tenantId)),
    ),

  listJobProfiles: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        familyId: z.string().uuid().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .query(({ input }) =>
      svc().query(new ListJobProfilesQuery(input.tenantId, input.familyId, input.isActive)),
    ),

  listProfileChangeRequests: publicProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListProfileChangeRequestsQuery(input.tenantId))),

  listOnboardingTasks: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), caseId: z.string().uuid() }))
    .query(({ input }) => svc().query(new ListOnboardingTasksQuery(input.tenantId, input.caseId))),

  listOnboardingTemplates: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        countryCode: z.string().optional(),
        workerType: z.enum(WORKER_TYPE_VALUES as [string, ...string[]]).optional(),
        employmentType: z.enum(EMPLOYMENT_TYPE_VALUES as [string, ...string[]]).optional(),
      }),
    )
    .query(({ input }) => svc().query(new ListTemplatesQuery(input.tenantId, 'onboarding'))),

  listOffboardingTemplates: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        countryCode: z.string().optional(),
        terminationReason: z.enum(TERMINATION_REASON_VALUES as [string, ...string[]]).optional(),
      }),
    )
    .query(({ input }) => svc().query(new ListTemplatesQuery(input.tenantId, 'offboarding'))),

  onboarding: router({
    getCase: publicProcedure
      .input(z.object({ tenantId: z.string().uuid(), employmentId: z.string().uuid() }))
      // No GetOnboardingCaseByEmploymentIdQuery handler yet; returns null until implemented.

      .query((_ctx) => null),
  }),

  offboarding: router({
    getCase: publicProcedure
      .input(z.object({ tenantId: z.string().uuid(), employmentId: z.string().uuid() }))
      // No GetOffboardingCaseByEmploymentIdQuery handler yet; returns null until implemented.

      .query((_ctx) => null),
  }),

  // listPeriodicReviews: removed — periodic reviews feature removed per spec (Plan 06)

  profile: router({
    // Stub — returns empty until GetEmployeeDocumentsQuery is implemented.
    documents: publicProcedure
      .input(z.object({ employmentId: z.string().uuid() }))
      .query(() => ({ documents: [], requirements: [] })),
  }),

  // ── Profile mutations ──────────────────────────────────────────────────

  createPersonProfile: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        actorId: z.string().uuid(),
        familyName: z.string(),
        givenName: z.string(),
        middleName: z.string().nullable().optional(),
        nameDisplayOrder: z.enum(NAME_DISPLAY_ORDER_VALUES as [string, ...string[]]),
        createdBy: z.string().uuid(),
        dateOfBirth: z.coerce.date().nullable().optional(),
        gender: z.enum(['male', 'female', 'other', 'undisclosed']).nullable().optional(),
        nationality: z.string().nullable().optional(),
        preferredName: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreatePersonProfileCommand(
          input.tenantId,
          input.actorId,
          input.familyName,
          input.givenName,
          input.middleName ?? null,
          input.nameDisplayOrder as never,
          input.createdBy,
          input.dateOfBirth,
          input.gender,
          input.nationality,
          input.preferredName,
        ),
      ),
    ),

  createEmployment: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        personProfileId: z.string().uuid(),
        workerType: z.enum(WORKER_TYPE_VALUES as [string, ...string[]]),
        employmentType: z.enum(EMPLOYMENT_TYPE_VALUES as [string, ...string[]]),
        countryCode: z.string(),
        hireDate: z.coerce.date(),
        createdBy: z.string().uuid(),
        employeeCode: z.string().nullable().optional(),
        companyEmail: z.string().nullable().optional(),
        originalHireDate: z.coerce.date().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateEmploymentCommand(
          input.tenantId,
          input.personProfileId,
          input.workerType as never,
          input.employmentType as never,
          input.countryCode,
          input.hireDate,
          input.createdBy,
          input.employeeCode,
          input.companyEmail,
          input.originalHireDate,
        ),
      ),
    ),

  createJobAssignment: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        jobProfileId: z.string().uuid(),
        effectiveFrom: z.coerce.date(),
        eventType: z.enum(JOB_ASSIGNMENT_EVENT_TYPE_VALUES as [string, ...string[]]),
        createdBy: z.string().uuid(),
        departmentId: z.string().uuid().nullable().optional(),
        locationId: z.string().uuid().nullable().optional(),
        costCenterId: z.string().uuid().nullable().optional(),
        workArrangement: z
          .enum(WORK_ARRANGEMENT_VALUES as [string, ...string[]])
          .nullable()
          .optional(),
        managerId: z.string().uuid().nullable().optional(),
        reason: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateJobAssignmentCommand(
          input.tenantId,
          input.employmentId,
          input.jobProfileId,
          input.effectiveFrom,
          input.eventType as never,
          input.createdBy,
          input.departmentId,
          input.locationId,
          input.costCenterId,
          input.workArrangement as never,
          input.managerId,
          input.reason,
        ),
      ),
    ),

  createJobFamily: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        name: z.string(),
        createdBy: z.string().uuid(),
        description: z.string().nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateJobFamilyCommand(
          input.tenantId,
          input.name,
          input.createdBy,
          input.description,
          input.parentId,
        ),
      ),
    ),

  createJobProfile: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        jobFamilyId: z.string().uuid(),
        title: z.string(),
        createdBy: z.string().uuid(),
        level: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateJobProfileCommand(
          input.tenantId,
          input.jobFamilyId,
          input.title,
          input.createdBy,
          input.level,
          input.description,
        ),
      ),
    ),

  updateEmploymentDetail: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        updatedBy: z.string().uuid(),
        nationalId: z.string().nullable().optional(),
        nationalIdType: z.string().nullable().optional(),
        nationalIdIssuedDate: z.coerce.date().nullable().optional(),
        nationalIdExpiryDate: z.coerce.date().nullable().optional(),
        taxId: z.string().nullable().optional(),
        socialInsuranceId: z.string().nullable().optional(),
        passportNumber: z.string().nullable().optional(),
        passportExpiryDate: z.coerce.date().nullable().optional(),
        bankAccountNumber: z.string().nullable().optional(),
        bankName: z.string().nullable().optional(),
        bankBranch: z.string().nullable().optional(),
        bankAccountHolder: z.string().nullable().optional(),
        bankSwiftCode: z.string().nullable().optional(),
        personalEmail: z.string().nullable().optional(),
        personalPhone: z.string().nullable().optional(),
        permanentAddress: z.record(z.string(), z.unknown()).nullable().optional(),
        currentAddress: z.record(z.string(), z.unknown()).nullable().optional(),
        emergencyContacts: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
        countryData: z.record(z.string(), z.unknown()).nullable().optional(),
        customFields: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new UpdateEmploymentDetailCommand(
          input.tenantId,
          input.employmentId,
          input.updatedBy,
          input.nationalId,
          input.nationalIdType,
          input.nationalIdIssuedDate,
          input.nationalIdExpiryDate,
          input.taxId,
          input.socialInsuranceId,
          input.passportNumber,
          input.passportExpiryDate,
          input.bankAccountNumber,
          input.bankName,
          input.bankBranch,
          input.bankAccountHolder,
          input.bankSwiftCode,
          input.personalEmail,
          input.personalPhone,
          input.permanentAddress,
          input.currentAddress,
          input.emergencyContacts,
          input.countryData,
          input.customFields,
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
        employmentId: z.string().uuid(),
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
          input.employmentId,
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

  // ── Lifecycle mutations ────────────────────────────────────────────────

  activateEmployment: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        activatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ActivateEmploymentCommand(input.tenantId, input.employmentId, input.activatedBy),
      ),
    ),

  startLeave: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        leaveType: z.string(),
        expectedReturnDate: z.coerce.date(),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new StartLeaveCommand(
          input.tenantId,
          input.employmentId,
          input.leaveType,
          input.expectedReturnDate,
          input.initiatedBy,
        ),
      ),
    ),

  returnFromLeave: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        actualReturnDate: z.coerce.date(),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ReturnFromLeaveCommand(
          input.tenantId,
          input.employmentId,
          input.actualReturnDate,
          input.initiatedBy,
        ),
      ),
    ),

  suspendEmployment: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        reason: z.string(),
        reviewDate: z.coerce.date(),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new SuspendEmploymentCommand(
          input.tenantId,
          input.employmentId,
          input.reason,
          input.reviewDate,
          input.initiatedBy,
        ),
      ),
    ),

  reinstateSuspension: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        reason: z.string(),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ReinstateSuspensionCommand(
          input.tenantId,
          input.employmentId,
          input.reason,
          input.initiatedBy,
        ),
      ),
    ),

  giveNotice: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        lastWorkingDay: z.coerce.date(),
        noticeType: z.enum(['resignation', 'employer']),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new GiveNoticeCommand(
          input.tenantId,
          input.employmentId,
          input.lastWorkingDay,
          input.noticeType,
          input.initiatedBy,
        ),
      ),
    ),

  terminateEmployment: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        terminationReason: z.enum(TERMINATION_REASON_VALUES as [string, ...string[]]),
        terminationDate: z.coerce.date(),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new TerminateEmploymentCommand(
          input.tenantId,
          input.employmentId,
          input.terminationReason as never,
          input.terminationDate,
          input.initiatedBy,
        ),
      ),
    ),

  completeTermination: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        terminationDate: z.coerce.date(),
        initiatedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CompleteTerminationCommand(
          input.tenantId,
          input.employmentId,
          input.terminationDate,
          input.initiatedBy,
        ),
      ),
    ),

  // ── Probation mutations ────────────────────────────────────────────────

  confirmProbation: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        confirmedBy: z.string().uuid(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ConfirmProbationCommand(
          input.tenantId,
          input.employmentId,
          input.confirmedBy,
          input.note,
        ),
      ),
    ),

  extendProbation: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        newEndDate: z.coerce.date(),
        extendedBy: z.string().uuid(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new ExtendProbationCommand(
          input.tenantId,
          input.employmentId,
          input.newEndDate,
          input.extendedBy,
          input.note,
        ),
      ),
    ),

  failProbation: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        failedBy: z.string().uuid(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new FailProbationCommand(input.tenantId, input.employmentId, input.failedBy, input.note),
      ),
    ),

  // ── Probation queries ──────────────────────────────────────────────────

  getProbationRecord: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), employmentId: z.string().uuid() }))
    .query(({ input }) =>
      svc().query(new GetProbationRecordQuery(input.tenantId, input.employmentId)),
    ),

  // ── Contract mutations ─────────────────────────────────────────────────

  createContractVersion: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        contractType: z.enum([
          'indefinite',
          'fixed_term',
          'seasonal',
          'probation',
          'internship',
          'consultancy',
        ]),
        startDate: z.coerce.date(),
        createdBy: z.string().uuid(),
        endDate: z.coerce.date().nullable().optional(),
        baseSalary: z.string().nullable().optional(),
        salaryCurrency: z.string().nullable().optional(),
        salaryFrequency: z.enum(['monthly', 'biweekly', 'weekly', 'annual']).nullable().optional(),
        noticePeriodDays: z.number().int().nullable().optional(),
        workHoursPerWeek: z.string().nullable().optional(),
        probationEndDate: z.coerce.date().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new CreateContractVersionCommand(
          input.tenantId,
          input.employmentId,
          input.contractType,
          input.startDate,
          input.createdBy,
          input.endDate,
          input.baseSalary,
          input.salaryCurrency,
          input.salaryFrequency as never,
          input.noticePeriodDays,
          input.workHoursPerWeek,
          input.probationEndDate,
          input.note,
        ),
      ),
    ),

  // ── Contract queries ───────────────────────────────────────────────────

  listContractVersions: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), employmentId: z.string().uuid() }))
    .query(({ input }) =>
      svc().query(new ListContractVersionsQuery(input.tenantId, input.employmentId)),
    ),

  // ── Directory ─────────────────────────────────────────────────────────
  // Type-anchor only; the real, permission-checked implementations live in
  // createPeopleRouter() and are wired by TrpcModule.onModuleInit().
  directory: router({
    list: publicProcedure.input(futureListQuerySchema).query((_ctx) =>
      Promise.resolve({
        rows: [] as Record<string, unknown>[],
        totalCount: 0,
        pageCount: 0,
        pageIndex: 0,
        pageSize: 25,
        facets: { departments: [], jobFamilies: [], countries: [], locations: [] },
      }),
    ),
    export: publicProcedure
      .input(futureExportQuerySchema)
      .query((_ctx) => Promise.resolve({ filename: '', csv: '' })),
  }),

  // ── Change requests ────────────────────────────────────────────────────

  requestProfileChanges: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        changes: z.array(
          z.object({
            fieldPath: z.string(),
            oldValue: z.unknown().nullable(),
            newValue: z.unknown(),
            effectiveDate: z.coerce.date().optional(),
          }),
        ),
        requestedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new RequestProfileChangesCommand(
          input.tenantId,
          input.employmentId,
          input.changes,
          input.requestedBy,
        ),
      ),
    ),

  batchApproveChanges: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        batchId: z.string().uuid(),
        approvedBy: z.string().uuid(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new BatchApproveChangesCommand(input.tenantId, input.batchId, input.approvedBy, input.note),
      ),
    ),

  batchRejectChanges: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        batchId: z.string().uuid(),
        rejectedBy: z.string().uuid(),
        note: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new BatchRejectChangesCommand(input.tenantId, input.batchId, input.rejectedBy, input.note),
      ),
    ),

  // ── Documents ──────────────────────────────────────────────────────────

  uploadEmployeeDocument: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
        documentId: z.string().uuid(),
        category: z.enum([
          'identity',
          'contract',
          'tax',
          'insurance',
          'certificate',
          'visa',
          'policy_ack',
          'health_check',
          'background_check',
          'other',
        ]),
        title: z.string().min(1),
        uploadedBy: z.string().uuid(),
        subcategory: z.string().optional(),
        expiryDate: z.coerce.date().optional(),
        isConfidential: z.boolean().default(false),
        requiresAcknowledgment: z.boolean().default(false),
        parentDocumentId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new UploadEmployeeDocumentCommand(
          input.tenantId,
          input.employmentId,
          input.documentId,
          input.category,
          input.title,
          input.uploadedBy,
          input.subcategory,
          input.expiryDate,
          input.isConfidential,
          input.requiresAcknowledgment,
          input.parentDocumentId,
        ),
      ),
    ),

  acknowledgePolicy: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employeeDocumentId: z.string().uuid(),
        acknowledgedBy: z.string().uuid(),
      }),
    )
    .mutation(({ input }) =>
      svc().command(
        new AcknowledgePolicyCommand(
          input.tenantId,
          input.employeeDocumentId,
          input.acknowledgedBy,
        ),
      ),
    ),

  listExpiringDocuments: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        daysAhead: z.number().int().default(30),
      }),
    )
    .query(({ input }) =>
      svc().query(new ListExpiringDocumentsQuery(input.tenantId, input.daysAhead)),
    ),

  // ── Completeness ───────────────────────────────────────────────────────

  getProfileCompleteness: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        employmentId: z.string().uuid(),
      }),
    )
    .query(({ input }) =>
      svc().query(new GetProfileCompletenessQuery(input.tenantId, input.employmentId)),
    ),

  listIncompleteProfiles: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        threshold: z.number().default(80),
      }),
    )
    .query(({ input }) =>
      svc().query(new ListIncompleteProfilesQuery(input.tenantId, input.threshold)),
    ),
})
