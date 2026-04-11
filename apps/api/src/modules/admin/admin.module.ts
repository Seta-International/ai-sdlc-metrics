import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { AdminQueryFacade } from './application/facades/admin-query.facade'
import { ListRolesHandler } from './application/queries/list-roles.handler'
import { GetRolePermissionsHandler } from './application/queries/get-role-permissions.handler'
import { AddRolePermissionHandler } from './application/commands/add-role-permission.handler'
import { RemoveRolePermissionHandler } from './application/commands/remove-role-permission.handler'
import { ResetRolePermissionsHandler } from './application/commands/reset-role-permissions.handler'
import { AdminTrpcService } from './interface/trpc/admin-trpc.service'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    AdminQueryFacade,
    ListRolesHandler,
    GetRolePermissionsHandler,
    AddRolePermissionHandler,
    RemoveRolePermissionHandler,
    ResetRolePermissionsHandler,
    AdminTrpcService,
  ],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
