import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { eq } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  tenantAiProviderConfig,
  tenantModuleToggle,
} from '../../infrastructure/schema/admin.schema'
import { GetTenantAdminSummaryQuery } from './get-tenant-admin-summary.query'
import type { TenantSummaryDto } from '../../../kernel/application/queries/list-tenants.handler'

export interface AiConfigMetaDto {
  providerType: 'openai'
  apiKeyLastFour: string | null
  defaultReasoningModel: string
  defaultClassificationModel: string
  embeddingModel: string
  status: 'ready' | 'needs_attention' | 'disabled'
  lastValidatedAt: Date | null
  lastError: string | null
}

export interface ModuleToggleDto {
  moduleKey: string
  enabled: boolean
}

export interface TenantAdminSummaryDto {
  tenant: TenantSummaryDto
  aiConfig: AiConfigMetaDto | null
  moduleToggles: ModuleToggleDto[]
}

@Injectable()
@QueryHandler(GetTenantAdminSummaryQuery)
export class GetTenantAdminSummaryHandler implements IQueryHandler<
  GetTenantAdminSummaryQuery,
  TenantAdminSummaryDto
> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQuery: KernelQueryFacade,
  ) {}

  async execute(query: GetTenantAdminSummaryQuery): Promise<TenantAdminSummaryDto> {
    const isPlatformAdmin = query.callerRoles.includes('platform_admin')

    if (!isPlatformAdmin && query.callerTenantId !== query.targetTenantId) {
      throw new ForbiddenException('tenant_admin may only read their own tenant summary')
    }

    const tenant = await this.kernelQuery.getTenant(query.targetTenantId)

    if (!tenant) {
      throw new ForbiddenException(`Tenant not found: ${query.targetTenantId}`)
    }

    const tenantSummary: TenantSummaryDto = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      planTier: tenant.planTier,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    }

    const aiConfigRows = await this.db
      .select()
      .from(tenantAiProviderConfig)
      .where(eq(tenantAiProviderConfig.tenantId, query.targetTenantId))
      .limit(1)

    const aiRow = aiConfigRows[0]
    const aiConfig: AiConfigMetaDto | null = aiRow
      ? {
          providerType: aiRow.providerType as 'openai',
          apiKeyLastFour: aiRow.apiKeyLastFour,
          defaultReasoningModel: aiRow.defaultReasoningModel,
          defaultClassificationModel: aiRow.defaultClassificationModel,
          embeddingModel: aiRow.embeddingModel,
          status: aiRow.status as 'ready' | 'needs_attention' | 'disabled',
          lastValidatedAt: aiRow.lastValidatedAt,
          lastError: aiRow.lastError,
        }
      : null

    const toggleRows = await this.db
      .select({ moduleKey: tenantModuleToggle.moduleKey, enabled: tenantModuleToggle.enabled })
      .from(tenantModuleToggle)
      .where(eq(tenantModuleToggle.tenantId, query.targetTenantId))

    const moduleToggles: ModuleToggleDto[] = toggleRows.map((r) => ({
      moduleKey: r.moduleKey,
      enabled: r.enabled,
    }))

    return { tenant: tenantSummary, aiConfig, moduleToggles }
  }
}
