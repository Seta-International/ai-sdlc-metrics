import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { KernelModule } from '../kernel/kernel.module'
import { AdminQueryFacade } from './application/facades/admin-query.facade'
import { AdminRouterService } from './interface/trpc/admin-router.service'
import { QueryAuditLogHandler } from './application/queries/query-audit-log.handler'
import { ExportAuditLogHandler } from './application/queries/export-audit-log.handler'
import { IsPlannerEnabledHandler } from './application/queries/is-planner-enabled.handler'
import { GetPlannerViewFlagsHandler } from './application/queries/get-planner-view-flags.handler'
import { GetTenantTimezoneHandler } from './application/queries/get-tenant-timezone.handler'
import { UpdateTenantTimezoneHandler } from './application/commands/update-tenant-timezone.handler'
import { ListPlatformTenantsHandler } from './application/queries/list-platform-tenants.handler'
import { UpdateTargetTenantStatusHandler } from './application/commands/update-target-tenant-status.handler'
import { DrizzleTenantEmailConfigRepository } from './infrastructure/repositories/drizzle-tenant-email-config.repository'
import { TENANT_EMAIL_CONFIG_REPOSITORY } from './domain/repositories/tenant-email-config.repository.port'

@Module({
  imports: [CqrsModule, KernelModule],
  providers: [
    AdminQueryFacade,
    AdminRouterService,
    QueryAuditLogHandler,
    ExportAuditLogHandler,
    IsPlannerEnabledHandler,
    GetPlannerViewFlagsHandler,
    GetTenantTimezoneHandler,
    UpdateTenantTimezoneHandler,
    ListPlatformTenantsHandler,
    UpdateTargetTenantStatusHandler,
    {
      provide: TENANT_EMAIL_CONFIG_REPOSITORY,
      useClass: DrizzleTenantEmailConfigRepository,
    },
  ],
  exports: [AdminQueryFacade],
})
export class AdminModule {}
