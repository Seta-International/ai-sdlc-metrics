import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { randomBytes, createHash } from 'node:crypto'
import { DomainException } from '@future/core'
import { StartOAuthCommand } from './start-oauth.command'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  OAUTH_AUTHORIZATION_SESSION_REPOSITORY,
  type IOAuthAuthorizationSessionRepository,
} from '../../domain/repositories/oauth-authorization-session.repository'

const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Allowed Future zone origins — either localhost ports used in dev,
 * or *.future.seta-international.vn subdomains in production.
 */
function isAllowedRedirectTarget(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Production: *.future.seta-international.vn
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.future.seta-international.vn')) {
      return true
    }
    // Dev: localhost on any port 3000-3011 (11 zones + shell)
    if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') {
      const port = Number(parsed.port)
      return port >= 3000 && port <= 3011
    }
    return false
  } catch {
    return false
  }
}

export class TenantNotActiveException extends DomainException {
  readonly code = 'OAUTH_START_TENANT_NOT_ACTIVE'
  constructor(tenantId: string, status: string) {
    super(`Tenant ${tenantId} is ${status} — OAuth flow not permitted`)
  }
}

export class TenantNotFoundException extends DomainException {
  readonly code = 'OAUTH_START_TENANT_NOT_FOUND'
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`)
  }
}

export class ProviderNotFoundException extends DomainException {
  readonly code = 'PROVIDER_NOT_FOUND'
  constructor(providerId: string) {
    super(`Identity provider not found: ${providerId}`)
  }
}

export class InvalidRedirectTargetException extends DomainException {
  readonly code = 'INVALID_REDIRECT_TARGET'
  constructor(redirectTo: string) {
    super(`redirectTo URL is not an allowed Future zone URL: ${redirectTo}`)
  }
}

export interface StartOAuthResult {
  authorizationUrl: string
}

@CommandHandler(StartOAuthCommand)
export class StartOAuthHandler implements ICommandHandler<StartOAuthCommand, StartOAuthResult> {
  constructor(
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(OAUTH_AUTHORIZATION_SESSION_REPOSITORY)
    private readonly sessionRepo: IOAuthAuthorizationSessionRepository,
  ) {}

  async execute(command: StartOAuthCommand): Promise<StartOAuthResult> {
    // Validate redirectTo before doing any DB work
    if (!isAllowedRedirectTarget(command.redirectTo)) {
      throw new InvalidRedirectTargetException(command.redirectTo)
    }

    const tenant = await this.kernelFacade.getTenant(command.tenantId)
    if (!tenant) {
      throw new TenantNotFoundException(command.tenantId)
    }
    if (tenant.status !== 'active') {
      throw new TenantNotActiveException(command.tenantId, tenant.status)
    }

    const provider = await this.providerRepo.findById(command.providerId, command.tenantId)
    if (!provider) {
      throw new ProviderNotFoundException(command.providerId)
    }

    // Generate opaque random values for state and nonce
    const rawState = randomBytes(32).toString('hex')
    const rawNonce = randomBytes(32).toString('hex')

    // Store ONLY the hashes — never the raw values
    const stateHash = createHash('sha256').update(rawState).digest('hex')
    const nonceHash = createHash('sha256').update(rawNonce).digest('hex')

    const expiresAt = new Date(Date.now() + OAUTH_SESSION_TTL_MS)

    await this.sessionRepo.insert({
      tenantId: command.tenantId,
      providerId: command.providerId,
      providerType: provider.providerType,
      stateHash,
      nonceHash,
      callbackUri: command.callbackUri,
      redirectTo: command.redirectTo,
      expiresAt,
    })

    // Build Microsoft authorization URL from provider metadata, not env vars
    const authorizationUrl = new URL(
      `https://login.microsoftonline.com/${provider.directoryId}/oauth2/v2.0/authorize`,
    )
    authorizationUrl.searchParams.set('client_id', provider.clientId)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('redirect_uri', command.callbackUri)
    authorizationUrl.searchParams.set('scope', 'openid profile email')
    authorizationUrl.searchParams.set('response_mode', 'query')
    authorizationUrl.searchParams.set('state', rawState)
    authorizationUrl.searchParams.set('nonce', rawNonce)

    return { authorizationUrl: authorizationUrl.toString() }
  }
}
