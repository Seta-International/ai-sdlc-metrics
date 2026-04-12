import { Module, OnModuleInit } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { CommandBus } from '@nestjs/cqrs'
import { setIdentityCommandBus } from './interface/trpc/identity.router'
import { ACTOR_REPOSITORY } from './domain/repositories/actor.repository.port'
import { DEPARTMENT_REPOSITORY } from './domain/repositories/department.repository.port'
import { DECISION_CASE_REPOSITORY } from './domain/repositories/decision-case.repository.port'
import { ROLE_GRANT_REPOSITORY } from './domain/repositories/role-grant.repository.port'
import { ROLE_PERMISSION_REPOSITORY } from './domain/repositories/role-permission.repository.port'
import { DELEGATION_REPOSITORY } from './domain/repositories/delegation.repository.port'
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.port'
import { USER_IDENTITY_REPOSITORY } from './domain/repositories/user-identity.repository.port'
import { CreateActorHandler } from './application/commands/create-actor.handler'
import { CreateDecisionCaseHandler } from './application/commands/create-decision-case.handler'
import { CreateUserIdentityHandler } from './application/commands/create-user-identity.handler'
import { DeprovisionUserIdentityHandler } from './application/commands/deprovision-user-identity.handler'
import { GrantRoleHandler } from './application/commands/grant-role.handler'
import { ResolveDecisionCaseHandler } from './application/commands/resolve-decision-case.handler'
import { RevokeAllRoleGrantsHandler } from './application/commands/revoke-all-role-grants.handler'
import { UpdateActorStatusHandler } from './application/commands/update-actor-status.handler'
import { SeedRolePermissionsHandler } from './application/commands/seed-role-permissions.handler'
import { ResolveLoginHandler } from './application/commands/resolve-login.handler'
import { KernelQueryFacade } from './application/facades/kernel-query.facade'
import { GetActorHandler } from './application/queries/get-actor.handler'
import { GetRoleGrantsHandler } from './application/queries/get-role-grants.handler'
import { GetTenantHandler } from './application/queries/get-tenant.handler'
import { GetUserIdentityBySsoSubjectHandler } from './application/queries/get-user-identity-by-sso-subject.handler'
import { CanDoHandler } from './application/queries/can-do.handler'
import { GetEffectivePermissionsHandler } from './application/queries/get-effective-permissions.handler'
import { DrizzleActorRepository } from './infrastructure/repositories/drizzle-actor.repository'
import { DrizzleDecisionCaseRepository } from './infrastructure/repositories/drizzle-decision-case.repository'
import { DrizzleDepartmentRepository } from './infrastructure/repositories/drizzle-department.repository'
import { DrizzleRoleGrantRepository } from './infrastructure/repositories/drizzle-role-grant.repository'
import { DrizzleRolePermissionRepository } from './infrastructure/repositories/drizzle-role-permission.repository'
import { DrizzleDelegationRepository } from './infrastructure/repositories/drizzle-delegation.repository'
import { DrizzleTenantRepository } from './infrastructure/repositories/drizzle-tenant.repository'
import { DrizzleUserIdentityRepository } from './infrastructure/repositories/drizzle-user-identity.repository'
import { AUDIT_EVENT_REPOSITORY } from './domain/repositories/audit-event.repository.port'
import { OUTBOX_EVENT_REPOSITORY } from './domain/repositories/outbox-event.repository.port'
import { DrizzleAuditEventRepository } from './infrastructure/repositories/drizzle-audit-event.repository'
import { DrizzleOutboxEventRepository } from './infrastructure/repositories/drizzle-outbox-event.repository'

@Module({
  imports: [CqrsModule],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: ACTOR_REPOSITORY, useClass: DrizzleActorRepository },
    { provide: USER_IDENTITY_REPOSITORY, useClass: DrizzleUserIdentityRepository },
    { provide: ROLE_GRANT_REPOSITORY, useClass: DrizzleRoleGrantRepository },
    { provide: ROLE_PERMISSION_REPOSITORY, useClass: DrizzleRolePermissionRepository },
    { provide: DELEGATION_REPOSITORY, useClass: DrizzleDelegationRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: DrizzleDepartmentRepository },
    { provide: DECISION_CASE_REPOSITORY, useClass: DrizzleDecisionCaseRepository },
    { provide: AUDIT_EVENT_REPOSITORY, useClass: DrizzleAuditEventRepository },
    { provide: OUTBOX_EVENT_REPOSITORY, useClass: DrizzleOutboxEventRepository },
    CreateActorHandler,
    CreateDecisionCaseHandler,
    CreateUserIdentityHandler,
    DeprovisionUserIdentityHandler,
    GrantRoleHandler,
    ResolveDecisionCaseHandler,
    RevokeAllRoleGrantsHandler,
    UpdateActorStatusHandler,
    SeedRolePermissionsHandler,
    ResolveLoginHandler,
    GetActorHandler,
    GetTenantHandler,
    GetRoleGrantsHandler,
    GetUserIdentityBySsoSubjectHandler,
    CanDoHandler,
    GetEffectivePermissionsHandler,
    KernelQueryFacade,
  ],
  exports: [KernelQueryFacade, AUDIT_EVENT_REPOSITORY, OUTBOX_EVENT_REPOSITORY],
})
export class KernelModule implements OnModuleInit {
  constructor(private readonly commandBus: CommandBus) {}

  onModuleInit() {
    setIdentityCommandBus(this.commandBus)
  }
}
