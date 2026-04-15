import { z } from 'zod'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'
import { devProtectedProcedure } from '../../../../common/trpc/procedures'
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
import { ListPeriodicReviewsQuery } from '../../application/queries/list-periodic-reviews.query'
import { PeopleTrpcService } from './people-trpc.service'
import {
  futureListQuerySchema,
  futureExportQuerySchema,
} from '../../../../common/list/future-list.contract'
import { listPeopleDirectory } from '../../application/queries/list-people-directory.query'
import { exportPeopleDirectory } from '../../application/queries/export-people-directory.query'
import {
  EMPLOYMENT_STATUS_VALUES,
  WORKER_TYPE_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  WORK_ARRANGEMENT_VALUES,
  JOB_ASSIGNMENT_EVENT_TYPE_VALUES,
} from '../../domain/value-objects/employment-status'
import { NAME_DISPLAY_ORDER_VALUES } from '../../domain/value-objects/name-display-order'

const svc = () => PeopleTrpcService.getInstance()

export function createPeopleRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionProtectedProcedure: any,
  peopleFacade: PeopleQueryFacade,
  _kernelFacade: KernelQueryFacade,
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

    // ── Directory ─────────────────────────────────────────────────────────
    directory: router({
      list: devProtectedProcedure
        .input(futureListQuerySchema)
        .query(({ input }) => listPeopleDirectory(input)),
      export: devProtectedProcedure
        .input(futureExportQuerySchema)
        .query(({ input }) => exportPeopleDirectory(input)),
    }),
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

  // ── Directory ─────────────────────────────────────────────────────────

  directory: router({
    list: devProtectedProcedure
      .input(futureListQuerySchema)
      .query(({ input }) => listPeopleDirectory(input)),
    export: devProtectedProcedure
      .input(futureExportQuerySchema)
      .query(({ input }) => exportPeopleDirectory(input)),
  }),
})
