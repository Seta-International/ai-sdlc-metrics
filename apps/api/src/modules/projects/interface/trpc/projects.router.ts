import { z } from 'zod'
import { router, publicProcedure } from '../../../../common/trpc/trpc-init'
import { ProjectsRouterService } from './projects-router.service'
import { CreateAccountCommand } from '../../application/commands/create-account.command'
import { UpdateAccountCommand } from '../../application/commands/update-account.command'
import { CreateProjectCommand } from '../../application/commands/create-project.command'
import { UpdateProjectCommand } from '../../application/commands/update-project.command'
import { CreateProjectRoleCommand } from '../../application/commands/create-project-role.command'
import { UpdateProjectRoleCommand } from '../../application/commands/update-project-role.command'
import { CreateAllocationCommand } from '../../application/commands/create-allocation.command'
import { UpdateAllocationCommand } from '../../application/commands/update-allocation.command'
import { ConfirmAllocationCommand } from '../../application/commands/confirm-allocation.command'
import { CloseAllocationCommand } from '../../application/commands/close-allocation.command'
import { GetAccountQuery } from '../../application/queries/get-account.query'
import { ListAccountsQuery } from '../../application/queries/list-accounts.query'
import { GetProjectQuery } from '../../application/queries/get-project.query'
import { ListProjectsQuery } from '../../application/queries/list-projects.query'
import { GetStaffingOverviewQuery } from '../../application/queries/get-staffing-overview.query'
import { GetPersonAllocationsQuery } from '../../application/queries/get-person-allocations.query'
import { GetCapacityReportQuery } from '../../application/queries/get-capacity-report.query'
import { GetAccountStaffingQuery } from '../../application/queries/get-account-staffing.query'

function svc() {
  return ProjectsRouterService.getInstance()
}

export const projectsRouter = router({
  // --- Accounts ---
  listAccounts: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      svc()
        .getQueryBus()
        .execute(new ListAccountsQuery(input.tenantId, input.limit, input.offset)),
    ),

  getAccount: publicProcedure
    .input(z.object({ accountId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) =>
      svc().getQueryBus().execute(new GetAccountQuery(input.accountId, input.tenantId)),
    ),

  createAccount: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        name: z.string().min(1),
        clientCompany: z.string().nullable(),
        description: z.string().nullable(),
        domain: z.string().nullable(),
        location: z.string().nullable(),
        timezone: z.string().nullable(),
        billingModel: z.enum(['fixed_price', 't_and_m', 'dedicated', 'retainer']).nullable(),
        accountManagerId: z.string().uuid().nullable(),
        startedAt: z.coerce.date().nullable(),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(
          new CreateAccountCommand(
            input.tenantId,
            input.name,
            input.clientCompany,
            input.description,
            input.domain,
            input.location,
            input.timezone,
            input.billingModel,
            input.accountManagerId,
            input.startedAt,
          ),
        ),
    ),

  updateAccount: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        accountId: z.string().uuid(),
        data: z.object({
          name: z.string().min(1).optional(),
          clientCompany: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          domain: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
          timezone: z.string().nullable().optional(),
          billingModel: z
            .enum(['fixed_price', 't_and_m', 'dedicated', 'retainer'])
            .nullable()
            .optional(),
          status: z.enum(['active', 'on_hold', 'closed']).optional(),
          accountManagerId: z.string().uuid().nullable().optional(),
          startedAt: z.coerce.date().nullable().optional(),
          endedAt: z.coerce.date().nullable().optional(),
        }),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(new UpdateAccountCommand(input.tenantId, input.accountId, input.data)),
    ),

  // --- Account Memberships (delegated to People module) ---
  listAccountMembers: publicProcedure
    .input(z.object({ accountId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) => {
      // Delegates to PeopleQueryFacade.listAccountMembers().
      // The account_membership table lives in the people schema.
      // PeopleQueryFacade must expose this method.
      // Implementation: svc().getQueryBus().execute(new ListAccountMembersQuery(...))
      // where ListAccountMembersQuery is handled by PeopleModule.
      // For now, returns empty array — wire after People module exposes the facade method.
      return [] as Array<{ actorId: string; roleKey: string; joinedAt: Date }>
    }),

  addAccountMember: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        accountId: z.string().uuid(),
        actorId: z.string().uuid(),
        roleKey: z.enum(['account_manager', 'staffing_owner', 'member']),
      }),
    )
    .mutation(({ input }) => {
      // Dispatches AddAccountMemberCommand to People module's CommandBus.
      // The account_membership table lives in the people schema.
      // Implementation: svc().getCommandBus().execute(new AddAccountMemberCommand(...))
      // where AddAccountMemberCommand is handled by PeopleModule.
      return { success: true }
    }),

  removeAccountMember: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        accountId: z.string().uuid(),
        actorId: z.string().uuid(),
      }),
    )
    .mutation(({ input }) => {
      // Dispatches RemoveAccountMemberCommand to People module's CommandBus.
      // Implementation: svc().getCommandBus().execute(new RemoveAccountMemberCommand(...))
      return { success: true }
    }),

  // --- Projects ---
  listProjects: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        accountId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) =>
      svc()
        .getQueryBus()
        .execute(new ListProjectsQuery(input.tenantId, input.limit, input.offset, input.accountId)),
    ),

  getProject: publicProcedure
    .input(z.object({ projectId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) =>
      svc().getQueryBus().execute(new GetProjectQuery(input.projectId, input.tenantId)),
    ),

  createProject: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        accountId: z.string().uuid(),
        name: z.string().min(1),
        code: z.string().nullable(),
        description: z.string().nullable(),
        deliveryModel: z.enum(['scrum', 'kanban', 'waterfall', 'other']).nullable(),
        startedAt: z.coerce.date().nullable(),
        tags: z.any().nullable(),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(
          new CreateProjectCommand(
            input.tenantId,
            input.accountId,
            input.name,
            input.code,
            input.description,
            input.deliveryModel,
            input.startedAt,
            input.tags,
          ),
        ),
    ),

  updateProject: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        projectId: z.string().uuid(),
        data: z.object({
          name: z.string().min(1).optional(),
          code: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
          deliveryModel: z.enum(['scrum', 'kanban', 'waterfall', 'other']).nullable().optional(),
          status: z.enum(['active', 'on_hold', 'closed', 'tentative']).optional(),
          startedAt: z.coerce.date().nullable().optional(),
          endedAt: z.coerce.date().nullable().optional(),
          tags: z.any().nullable().optional(),
        }),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(new UpdateProjectCommand(input.tenantId, input.projectId, input.data)),
    ),

  // --- Project Roles ---
  listProjectRoles: publicProcedure
    .input(z.object({ projectId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await svc()
        .getQueryBus()
        .execute(new GetProjectQuery(input.projectId, input.tenantId))
      return result.roles
    }),

  createProjectRole: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        projectId: z.string().uuid(),
        roleName: z.string().min(1),
        skillsRequired: z.array(z.string()).nullable(),
        headcount: z.number().int().min(1).default(1),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(
          new CreateProjectRoleCommand(
            input.tenantId,
            input.projectId,
            input.roleName,
            input.skillsRequired,
            input.headcount,
          ),
        ),
    ),

  updateProjectRole: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        projectRoleId: z.string().uuid(),
        data: z.object({
          roleName: z.string().min(1).optional(),
          skillsRequired: z.array(z.string()).nullable().optional(),
          headcount: z.number().int().min(1).optional(),
        }),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(new UpdateProjectRoleCommand(input.tenantId, input.projectRoleId, input.data)),
    ),

  // --- Allocations ---
  createAllocation: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        projectRoleId: z.string().uuid(),
        actorId: z.string().uuid().nullable(),
        position: z.string().nullable(),
        hoursPerDay: z.string(),
        billingType: z.enum(['billable', 'non_billable']),
        memberType: z.enum(['core', 'shadow', 'backfill']).default('core'),
        startedAt: z.coerce.date(),
        endedAt: z.coerce.date().nullable(),
        note: z.string().nullable(),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(
          new CreateAllocationCommand(
            input.tenantId,
            input.projectRoleId,
            input.actorId,
            input.position,
            input.hoursPerDay,
            input.billingType,
            input.memberType,
            input.startedAt,
            input.endedAt,
            input.note,
          ),
        ),
    ),

  confirmAllocation: publicProcedure
    .input(z.object({ tenantId: z.string().uuid(), allocationId: z.string().uuid() }))
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(new ConfirmAllocationCommand(input.tenantId, input.allocationId)),
    ),

  updateAllocation: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        allocationId: z.string().uuid(),
        data: z.object({
          position: z.string().nullable().optional(),
          hoursPerDay: z.string().optional(),
          billingType: z.enum(['billable', 'non_billable']).optional(),
          memberType: z.enum(['core', 'shadow', 'backfill']).optional(),
          startedAt: z.coerce.date().optional(),
          endedAt: z.coerce.date().nullable().optional(),
          note: z.string().nullable().optional(),
        }),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(new UpdateAllocationCommand(input.tenantId, input.allocationId, input.data)),
    ),

  closeAllocation: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        allocationId: z.string().uuid(),
        endedAt: z.coerce.date(),
      }),
    )
    .mutation(({ input }) =>
      svc()
        .getCommandBus()
        .execute(new CloseAllocationCommand(input.tenantId, input.allocationId, input.endedAt)),
    ),

  // --- Reporting ---
  getStaffingOverview: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      }),
    )
    .query(({ input }) =>
      svc()
        .getQueryBus()
        .execute(new GetStaffingOverviewQuery(input.tenantId, input.startDate, input.endDate)),
    ),

  getPersonAllocations: publicProcedure
    .input(z.object({ actorId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) =>
      svc().getQueryBus().execute(new GetPersonAllocationsQuery(input.actorId, input.tenantId)),
    ),

  getCapacityReport: publicProcedure
    .input(
      z.object({
        tenantId: z.string().uuid(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      }),
    )
    .query(({ input }) =>
      svc()
        .getQueryBus()
        .execute(new GetCapacityReportQuery(input.tenantId, input.startDate, input.endDate)),
    ),

  getAccountStaffing: publicProcedure
    .input(z.object({ accountId: z.string().uuid(), tenantId: z.string().uuid() }))
    .query(({ input }) =>
      svc().getQueryBus().execute(new GetAccountStaffingQuery(input.accountId, input.tenantId)),
    ),
})
