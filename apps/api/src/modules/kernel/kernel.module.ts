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
import { AGENT_DELEGATION_REPOSITORY } from './domain/repositories/agent-delegation.repository.port'
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
import { DevLoginHandler } from './application/commands/dev-login.handler'
import { AddRolePermissionHandler } from './application/commands/add-role-permission.handler'
import { RemoveRolePermissionHandler } from './application/commands/remove-role-permission.handler'
import { ResetRolePermissionsHandler } from './application/commands/reset-role-permissions.handler'
import { BootstrapPlatformAdminHandler } from './application/commands/bootstrap-platform-admin.handler'
import { KernelQueryFacade } from './application/facades/kernel-query.facade'
import { KernelAuditFacade } from './application/facades/kernel-audit.facade'
import { KernelActorFacade } from './application/facades/kernel-actor.facade'
import { KernelUserIdentityFacade } from './application/facades/kernel-user-identity.facade'
import { KernelDecisionFacade } from './application/facades/kernel-decision.facade'
import { KernelPermissionFacade } from './application/facades/kernel-permission.facade'
import { KernelDelegationFacade } from './application/facades/kernel-delegation.facade'
import { GetLocalUsersWithActorsHandler } from './application/queries/get-local-users-with-actors.handler'
import { GetUserIdentityByActorIdHandler } from './application/queries/get-user-identity-by-actor-id.handler'
import { GetActorHandler } from './application/queries/get-actor.handler'
import { GetRoleGrantsHandler } from './application/queries/get-role-grants.handler'
import { GetTenantHandler } from './application/queries/get-tenant.handler'
import { GetUserIdentityBySsoSubjectHandler } from './application/queries/get-user-identity-by-sso-subject.handler'
import { CanDoHandler } from './application/queries/can-do.handler'
import { GetEffectivePermissionsHandler } from './application/queries/get-effective-permissions.handler'
import { GetRolePermissionsHandler } from './application/queries/get-role-permissions.handler'
import { ListRolesHandler } from './application/queries/list-roles.handler'
import { ListTenantsHandler } from './application/queries/list-tenants.handler'
import { DrizzleActorRepository } from './infrastructure/repositories/drizzle-actor.repository'
import { DrizzleDecisionCaseRepository } from './infrastructure/repositories/drizzle-decision-case.repository'
import { DrizzleDepartmentRepository } from './infrastructure/repositories/drizzle-department.repository'
import { DrizzleRoleGrantRepository } from './infrastructure/repositories/drizzle-role-grant.repository'
import { DrizzleRolePermissionRepository } from './infrastructure/repositories/drizzle-role-permission.repository'
import { DrizzleDelegationRepository } from './infrastructure/repositories/drizzle-delegation.repository'
import { DrizzleAgentDelegationRepository } from './infrastructure/repositories/drizzle-agent-delegation.repository'
import { DrizzleTenantRepository } from './infrastructure/repositories/drizzle-tenant.repository'
import { DrizzleUserIdentityRepository } from './infrastructure/repositories/drizzle-user-identity.repository'
import { AUDIT_EVENT_REPOSITORY } from './domain/repositories/audit-event.repository.port'
import { AUDIT_EVENT_QUERY_REPOSITORY } from './domain/repositories/audit-event-query.repository.port'
import { OUTBOX_EVENT_REPOSITORY } from './domain/repositories/outbox-event.repository.port'
import { DrizzleAuditEventRepository } from './infrastructure/repositories/drizzle-audit-event.repository'
import { DrizzleAuditEventQueryRepository } from './infrastructure/repositories/drizzle-audit-event-query.repository'
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
    { provide: AGENT_DELEGATION_REPOSITORY, useClass: DrizzleAgentDelegationRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: DrizzleDepartmentRepository },
    { provide: DECISION_CASE_REPOSITORY, useClass: DrizzleDecisionCaseRepository },
    { provide: AUDIT_EVENT_REPOSITORY, useClass: DrizzleAuditEventRepository },
    { provide: AUDIT_EVENT_QUERY_REPOSITORY, useClass: DrizzleAuditEventQueryRepository },
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
    DevLoginHandler,
    AddRolePermissionHandler,
    RemoveRolePermissionHandler,
    ResetRolePermissionsHandler,
    BootstrapPlatformAdminHandler,
    GetActorHandler,
    GetTenantHandler,
    GetRoleGrantsHandler,
    GetUserIdentityBySsoSubjectHandler,
    CanDoHandler,
    GetEffectivePermissionsHandler,
    GetRolePermissionsHandler,
    ListRolesHandler,
    ListTenantsHandler,
    GetLocalUsersWithActorsHandler,
    GetUserIdentityByActorIdHandler,
    KernelQueryFacade,
    KernelAuditFacade,
    KernelActorFacade,
    KernelUserIdentityFacade,
    KernelDecisionFacade,
    KernelPermissionFacade,
    KernelDelegationFacade,
  ],
  exports: [
    KernelQueryFacade,
    KernelAuditFacade,
    KernelActorFacade,
    KernelUserIdentityFacade,
    KernelDecisionFacade,
    KernelPermissionFacade,
    KernelDelegationFacade,
  ],
})
export class KernelModule implements OnModuleInit {
  constructor(private readonly commandBus: CommandBus) {}

  onModuleInit() {
    setIdentityCommandBus(this.commandBus)
  }
}
