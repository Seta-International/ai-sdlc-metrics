import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ACCOUNT_REPOSITORY } from './domain/repositories/account.repository.port'
import { PROJECT_REPOSITORY } from './domain/repositories/project.repository.port'
import { PROJECT_ROLE_REPOSITORY } from './domain/repositories/project-role.repository.port'
import { ALLOCATION_REPOSITORY } from './domain/repositories/allocation.repository.port'
import { DrizzleAccountRepository } from './infrastructure/repositories/drizzle-account.repository'
import { DrizzleProjectRepository } from './infrastructure/repositories/drizzle-project.repository'
import { DrizzleProjectRoleRepository } from './infrastructure/repositories/drizzle-project-role.repository'
import { DrizzleAllocationRepository } from './infrastructure/repositories/drizzle-allocation.repository'
import { CreateAccountHandler } from './application/commands/create-account.handler'
import { UpdateAccountHandler } from './application/commands/update-account.handler'
import { CreateProjectHandler } from './application/commands/create-project.handler'
import { UpdateProjectHandler } from './application/commands/update-project.handler'
import { CreateProjectRoleHandler } from './application/commands/create-project-role.handler'
import { UpdateProjectRoleHandler } from './application/commands/update-project-role.handler'
import { CreateAllocationHandler } from './application/commands/create-allocation.handler'
import { UpdateAllocationHandler } from './application/commands/update-allocation.handler'
import { ConfirmAllocationHandler } from './application/commands/confirm-allocation.handler'
import { CloseAllocationHandler } from './application/commands/close-allocation.handler'
import { GetAccountHandler } from './application/queries/get-account.handler'
import { ListAccountsHandler } from './application/queries/list-accounts.handler'
import { GetProjectHandler } from './application/queries/get-project.handler'
import { ListProjectsHandler } from './application/queries/list-projects.handler'
import { GetStaffingOverviewHandler } from './application/queries/get-staffing-overview.handler'
import { GetPersonAllocationsHandler } from './application/queries/get-person-allocations.handler'
import { GetCapacityReportHandler } from './application/queries/get-capacity-report.handler'
import { GetAccountStaffingHandler } from './application/queries/get-account-staffing.handler'
import { OnOffboardingStartedHandler } from './application/event-handlers/on-offboarding-started.handler'
import { OnEmployeeTerminatedHandler } from './application/event-handlers/on-employee-terminated.handler'
import { ProjectsQueryFacade } from './application/facades/projects-query.facade'
import { ProjectsRouterService } from './interface/trpc/projects-router.service'

@Module({
  imports: [CqrsModule],
  providers: [
    // Repository bindings
    { provide: ACCOUNT_REPOSITORY, useClass: DrizzleAccountRepository },
    { provide: PROJECT_REPOSITORY, useClass: DrizzleProjectRepository },
    { provide: PROJECT_ROLE_REPOSITORY, useClass: DrizzleProjectRoleRepository },
    { provide: ALLOCATION_REPOSITORY, useClass: DrizzleAllocationRepository },
    // Command handlers
    CreateAccountHandler,
    UpdateAccountHandler,
    CreateProjectHandler,
    UpdateProjectHandler,
    CreateProjectRoleHandler,
    UpdateProjectRoleHandler,
    CreateAllocationHandler,
    UpdateAllocationHandler,
    ConfirmAllocationHandler,
    CloseAllocationHandler,
    // Query handlers
    GetAccountHandler,
    ListAccountsHandler,
    GetProjectHandler,
    ListProjectsHandler,
    GetStaffingOverviewHandler,
    GetPersonAllocationsHandler,
    GetCapacityReportHandler,
    GetAccountStaffingHandler,
    // Event handlers
    OnOffboardingStartedHandler,
    OnEmployeeTerminatedHandler,
    // Facades
    ProjectsQueryFacade,
    // tRPC service
    ProjectsRouterService,
  ],
  exports: [ProjectsQueryFacade],
})
export class ProjectsModule {}
