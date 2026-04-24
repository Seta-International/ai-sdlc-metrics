import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  TENANT_DOMAIN_REPOSITORY,
  type ITenantDomainRepository,
} from '../../domain/repositories/tenant-domain.repository'
import { type IdpProviderType } from '../../domain/entities/identity-provider.entity'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import { GetLoginOptionsQuery } from './get-login-options.query'

export interface LoginOptionsMethodDto {
  /** Provider entity id — used as `providerId` input to identity.auth.startOAuth */
  id: string
  type: IdpProviderType
  displayName: string
  clientId: string
  directoryId: string | null
  status: 'ready' | 'needs_attention'
}

export interface LoginOptionsResult {
  tenant: {
    id: string
    slug: string
    name: string
    status: 'active' | 'suspended' | 'cancelled'
  }
  methods: LoginOptionsMethodDto[]
}

@QueryHandler(GetLoginOptionsQuery)
export class GetLoginOptionsHandler implements IQueryHandler<
  GetLoginOptionsQuery,
  LoginOptionsResult | null
> {
  constructor(
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(TENANT_DOMAIN_REPOSITORY)
    private readonly domainRepo: ITenantDomainRepository,
  ) {}

  async execute(query: GetLoginOptionsQuery): Promise<LoginOptionsResult | null> {
    // Require at least one lookup key
    if (!query.slug && !query.emailDomain) return null

    let tenant: Awaited<ReturnType<KernelQueryFacade['getTenantBySlug']>> = null

    if (query.slug) {
      tenant = await this.kernelFacade.getTenantBySlug(query.slug)
    } else if (query.emailDomain) {
      const domainRecord = await this.domainRepo.findVerifiedByDomain(query.emailDomain)
      if (!domainRecord) return null
      tenant = await this.kernelFacade.getTenant(domainRecord.tenantId)
    }

    if (!tenant) return null

    // Suspended tenants: return tenant info but no startable SSO methods
    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
      return {
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
        methods: [],
      }
    }

    const provider = await this.providerRepo.findPrimaryByTenantId(tenant.id)

    const methods: LoginOptionsMethodDto[] = provider
      ? [
          {
            id: provider.id,
            type: provider.providerType,
            displayName: provider.displayName,
            clientId: provider.clientId,
            directoryId: provider.directoryId,
            status:
              provider.syncStatus === 'failed'
                ? 'needs_attention'
                : // 'running' (mid-sync) is still usable for login
                  'ready',
          },
        ]
      : []

    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
      methods,
    }
  }
}
