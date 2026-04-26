import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { ITenantEmailConfigRepository } from '../../domain/repositories/tenant-email-config.repository.port'
import { TENANT_EMAIL_CONFIG_REPOSITORY } from '../../domain/repositories/tenant-email-config.repository.port'
import type { TenantEmailConfig } from '../../domain/entities/tenant-email-config.entity'
import { IsPlannerEnabledQuery } from '../queries/is-planner-enabled.query'
import { GetPlannerViewFlagsQuery } from '../queries/get-planner-view-flags.query'
import { GetTenantTimezoneQuery } from '../queries/get-tenant-timezone.query'
import { ListEnabledModulesQuery } from '../queries/list-enabled-modules.query'
import type { PlannerViewFlags } from '../queries/planner-view-flags.types'

@Injectable()
export class AdminQueryFacade {
  constructor(
    @Inject(TENANT_EMAIL_CONFIG_REPOSITORY)
    private readonly emailConfigRepo: ITenantEmailConfigRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async getEmailConfig(tenantId: string): Promise<TenantEmailConfig | null> {
    return this.emailConfigRepo.findByTenantId(tenantId)
  }

  async isPlannerEnabled(tenantId: string): Promise<boolean> {
    return this.queryBus.execute(new IsPlannerEnabledQuery(tenantId))
  }

  async getPlannerViewFlags(tenantId: string): Promise<PlannerViewFlags> {
    return this.queryBus.execute(new GetPlannerViewFlagsQuery(tenantId))
  }

  async getTenantTimezone(tenantId: string): Promise<string> {
    return this.queryBus.execute(new GetTenantTimezoneQuery(tenantId))
  }

  async listEnabledModules(tenantId: string): Promise<ReadonlySet<string>> {
    return this.queryBus.execute(new ListEnabledModulesQuery(tenantId))
  }
}
