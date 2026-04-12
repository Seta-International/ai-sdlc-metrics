import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { AdminQueryFacade } from './application/facades/admin-query.facade'
import { AddRolePermissionHandler } from './application/commands/add-role-permission.handler'
import { RemoveRolePermissionHandler } from './application/commands/remove-role-permission.handler'
import { ResetRolePermissionsHandler } from './application/commands/reset-role-permissions.handler'
import { ListRolesHandler } from './application/queries/list-roles.handler'
import { GetRolePermissionsHandler } from './application/queries/get-role-permissions.handler'
import { QueryAuditLogHandler } from './application/queries/query-audit-log.handler'
import { ExportAuditLogHandler } from './application/queries/export-audit-log.handler'

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
  imports: [CqrsModule],
  providers: [
    AdminQueryFacade,
    ...CommandHandlers,
    ...QueryHandlers,
    // Infrastructure providers registered here when infra layer is implemented
  ],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
