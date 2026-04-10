import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ACTOR_REPOSITORY } from './domain/repositories/actor.repository.port'
import { DEPARTMENT_REPOSITORY } from './domain/repositories/department.repository.port'
import { ROLE_GRANT_REPOSITORY } from './domain/repositories/role-grant.repository.port'
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.port'
import { USER_IDENTITY_REPOSITORY } from './domain/repositories/user-identity.repository.port'
import { CreateActorHandler } from './application/commands/create-actor.handler'
import { CreateUserIdentityHandler } from './application/commands/create-user-identity.handler'
import { GrantRoleHandler } from './application/commands/grant-role.handler'
import { KernelQueryFacade } from './application/facades/kernel-query.facade'
import { GetActorHandler } from './application/queries/get-actor.handler'
import { GetRoleGrantsHandler } from './application/queries/get-role-grants.handler'
import { GetTenantHandler } from './application/queries/get-tenant.handler'
import { GetUserIdentityBySsoSubjectHandler } from './application/queries/get-user-identity-by-sso-subject.handler'
import { DrizzleActorRepository } from './infrastructure/repositories/drizzle-actor.repository'
import { DrizzleDepartmentRepository } from './infrastructure/repositories/drizzle-department.repository'
import { DrizzleRoleGrantRepository } from './infrastructure/repositories/drizzle-role-grant.repository'
import { DrizzleTenantRepository } from './infrastructure/repositories/drizzle-tenant.repository'
import { DrizzleUserIdentityRepository } from './infrastructure/repositories/drizzle-user-identity.repository'

@Module({
  imports: [CqrsModule],
  providers: [
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: ACTOR_REPOSITORY, useClass: DrizzleActorRepository },
    { provide: USER_IDENTITY_REPOSITORY, useClass: DrizzleUserIdentityRepository },
    { provide: ROLE_GRANT_REPOSITORY, useClass: DrizzleRoleGrantRepository },
    { provide: DEPARTMENT_REPOSITORY, useClass: DrizzleDepartmentRepository },
    CreateActorHandler,
    CreateUserIdentityHandler,
    GrantRoleHandler,
    GetActorHandler,
    GetTenantHandler,
    GetRoleGrantsHandler,
    GetUserIdentityBySsoSubjectHandler,
    KernelQueryFacade,
  ],
  exports: [KernelQueryFacade],
})
export class KernelModule {}
