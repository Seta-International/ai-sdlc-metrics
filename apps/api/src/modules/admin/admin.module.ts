import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { AdminQueryFacade } from './application/facades/admin-query.facade'
import { AdminRouterService } from './interface/trpc/admin-router.service'
import { AddRolePermissionHandler } from './application/commands/add-role-permission.handler'
import { RemoveRolePermissionHandler } from './application/commands/remove-role-permission.handler'
import { ResetRolePermissionsHandler } from './application/commands/reset-role-permissions.handler'
import { ListRolesHandler } from './application/queries/list-roles.handler'
import { GetRolePermissionsHandler } from './application/queries/get-role-permissions.handler'
import { QueryAuditLogHandler } from './application/queries/query-audit-log.handler'
import { ExportAuditLogHandler } from './application/queries/export-audit-log.handler'
import { DrizzleTenantEmailConfigRepository } from './infrastructure/repositories/drizzle-tenant-email-config.repository'
import { TENANT_EMAIL_CONFIG_REPOSITORY } from './domain/repositories/tenant-email-config.repository.port'

const CommandHandlers = [
  AddRolePermissionHandler,
  RemoveRolePermissionHandler,
  ResetRolePermissionsHandler,
]

const QueryHandlers = [
  ListRolesHandler,
  GetRolePermissionsHandler,
  QueryAuditLogHandler,
  ExportAuditLogHandler,
]

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    AdminQueryFacade,
    AdminRouterService,
    ...CommandHandlers,
    ...QueryHandlers,
    {
      provide: TENANT_EMAIL_CONFIG_REPOSITORY,
      useClass: DrizzleTenantEmailConfigRepository,
    },
  ],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
