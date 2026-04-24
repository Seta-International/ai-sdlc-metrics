import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { DomainException } from '@future/core'
import { CompleteOAuthCommand } from './complete-oauth.command'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import {
  IDENTITY_PROVIDER_REPOSITORY,
  type IIdentityProviderRepository,
} from '../../domain/repositories/identity-provider.repository'
import {
  OAUTH_AUTHORIZATION_SESSION_REPOSITORY,
  type IOAuthAuthorizationSessionRepository,
} from '../../domain/repositories/oauth-authorization-session.repository'
import { SECRETS_STORE, type ISecretsStore } from '../../domain/ports/secrets-store.port'
import {
  OAUTH_TOKEN_EXCHANGER,
  type IOAuthTokenExchanger,
} from '../../domain/ports/oauth-token-exchanger.port'
import { JWT_SERVICE } from '../../../../common/auth/auth.module'
import type { JwtService } from '../../../../common/auth/jwt.service'

export class OAuthStateNotFoundException extends DomainException {
  readonly code = 'OAUTH_STATE_NOT_FOUND'
  constructor() {
    super('OAuth state not found or already expired')
  }
}

export class OAuthSessionExpiredException extends DomainException {
  readonly code = 'OAUTH_SESSION_EXPIRED'
  constructor() {
    super('OAuth authorization session has expired')
  }
}

export class OAuthSessionConsumedException extends DomainException {
  readonly code = 'OAUTH_SESSION_ALREADY_CONSUMED'
  constructor() {
    super('OAuth authorization session has already been consumed')
  }
}

export class TenantNotActiveForCallbackException extends DomainException {
  readonly code = 'OAUTH_COMPLETE_TENANT_NOT_ACTIVE'
  constructor(status: string) {
    super(`Tenant is ${status} — cannot complete OAuth flow`)
  }
}

export class TenantNotFoundForCallbackException extends DomainException {
  readonly code = 'OAUTH_COMPLETE_TENANT_NOT_FOUND'
  constructor() {
    super('Tenant not found for OAuth session')
  }
}

export class OAuthCallbackUriMismatchException extends DomainException {
  readonly code = 'OAUTH_CALLBACK_URI_MISMATCH'
  constructor() {
    super('callbackUri does not match the value stored at OAuth session start')
  }
}

export class IdTokenValidationException extends DomainException {
  readonly code = 'ID_TOKEN_INVALID'
  constructor(reason: string) {
    super(`ID token validation failed: ${reason}`)
  }
}

export class MicrosoftTenantMismatchException extends DomainException {
  readonly code = 'MICROSOFT_TENANT_MISMATCH'
  constructor() {
    super('Microsoft tid claim does not match the expected directory ID')
  }
}

export class GoogleWorkspaceDomainMismatchException extends DomainException {
  readonly code = 'GOOGLE_WORKSPACE_DOMAIN_MISMATCH'
  constructor() {
    super('Google hd claim does not match the required hosted domain')
  }
}

export class UserIdentityNotFoundException extends DomainException {
  readonly code = 'USER_IDENTITY_NOT_FOUND'
  constructor(ssoSubject: string) {
    super(`No Future user found for SSO subject: ${ssoSubject}`)
  }
}

export interface CompleteOAuthResult {
  sessionToken: string
  redirectTo: string
}

@CommandHandler(CompleteOAuthCommand)
export class CompleteOAuthHandler implements ICommandHandler<
  CompleteOAuthCommand,
  CompleteOAuthResult
> {
  private readonly jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

  constructor(
    private readonly kernelFacade: KernelQueryFacade,
    @Inject(IDENTITY_PROVIDER_REPOSITORY)
    private readonly providerRepo: IIdentityProviderRepository,
    @Inject(OAUTH_AUTHORIZATION_SESSION_REPOSITORY)
    private readonly sessionRepo: IOAuthAuthorizationSessionRepository,
    @Inject(SECRETS_STORE)
    private readonly secretsStore: ISecretsStore,
    @Inject(OAUTH_TOKEN_EXCHANGER)
    private readonly tokenExchanger: IOAuthTokenExchanger,
    @Inject(JWT_SERVICE)
    private readonly jwtService: JwtService,
  ) {}

  private getMicrosoftJwks(directoryId: string): ReturnType<typeof createRemoteJWKSet> {
    const cacheKey = `ms:${directoryId}`
    if (!this.jwksCache.has(cacheKey)) {
      const uri = new URL(`https://login.microsoftonline.com/${directoryId}/discovery/v2.0/keys`)
      this.jwksCache.set(cacheKey, createRemoteJWKSet(uri))
    }
    return this.jwksCache.get(cacheKey)!
  }

  private getGoogleJwks(): ReturnType<typeof createRemoteJWKSet> {
    const cacheKey = 'google'
    if (!this.jwksCache.has(cacheKey)) {
      const uri = new URL('https://www.googleapis.com/oauth2/v3/certs')
      this.jwksCache.set(cacheKey, createRemoteJWKSet(uri))
    }
    return this.jwksCache.get(cacheKey)!
  }

  async execute(command: CompleteOAuthCommand): Promise<CompleteOAuthResult> {
    // 1. Hash the raw state and look up the session
    const stateHash = createHash('sha256').update(command.state).digest('hex')
    const session = await this.sessionRepo.findByStateHash(stateHash)
    if (!session) {
      throw new OAuthStateNotFoundException()
    }

    // 2. Verify session is still usable
    const now = new Date()
    if (session.isExpired(now)) {
      throw new OAuthSessionExpiredException()
    }
    if (session.isConsumed()) {
      throw new OAuthSessionConsumedException()
    }

    // 2a. Pin callbackUri — reject if client supplies a different redirect_uri than was stored
    if (session.callbackUri !== command.callbackUri) {
      throw new OAuthCallbackUriMismatchException()
    }

    // 3. Verify tenant is still active — caller MUST verify tenantId from session (cross-tenant guard)
    const tenant = await this.kernelFacade.getTenant(session.tenantId)
    if (!tenant) {
      throw new TenantNotFoundForCallbackException()
    }
    if (tenant.status !== 'active') {
      throw new TenantNotActiveForCallbackException(tenant.status)
    }

    // 4. Load provider
    const provider = await this.providerRepo.findById(session.providerId, session.tenantId)
    if (!provider) {
      throw new IdTokenValidationException('Provider not found for session')
    }

    // 5. Load client secret via secrets store
    const clientSecret = await this.secretsStore.getSecret(provider.clientSecretRef)

    // 6. Exchange authorization code for tokens (provider-specific endpoint)
    let tokenEndpoint: string
    if (provider.providerType === 'google') {
      tokenEndpoint = 'https://oauth2.googleapis.com/token'
    } else {
      if (!provider.directoryId) {
        throw new IdTokenValidationException('Provider has no directoryId configured')
      }
      tokenEndpoint = `https://login.microsoftonline.com/${provider.directoryId}/oauth2/v2.0/token`
    }

    const tokenResult = await this.tokenExchanger.exchange({
      tokenEndpoint,
      clientId: provider.clientId,
      clientSecret,
      code: command.code,
      redirectUri: command.callbackUri,
      scope: 'openid profile email',
    })

    // 7. Validate ID token — do NOT decode without validation
    let idTokenPayload: {
      sub: string
      oid?: string
      tid?: string
      hd?: string
      email?: string
      preferred_username?: string
      name?: string
      nonce?: string
      exp?: number
    }

    if (provider.providerType === 'google') {
      const JWKS = this.getGoogleJwks()
      try {
        const { payload } = await jwtVerify(tokenResult.idToken, JWKS, {
          issuer: 'https://accounts.google.com',
          audience: provider.clientId,
        })
        idTokenPayload = payload as typeof idTokenPayload
      } catch (err) {
        throw new IdTokenValidationException(err instanceof Error ? err.message : String(err))
      }
    } else {
      // Microsoft — directoryId is required (already validated above)
      const JWKS = this.getMicrosoftJwks(provider.directoryId!)
      try {
        const { payload } = await jwtVerify(tokenResult.idToken, JWKS, {
          issuer: `https://login.microsoftonline.com/${provider.directoryId}/v2.0`,
          audience: provider.clientId,
        })
        idTokenPayload = payload as typeof idTokenPayload
      } catch (err) {
        throw new IdTokenValidationException(err instanceof Error ? err.message : String(err))
      }
    }

    // 8. Verify nonce — compare nonce claim against stored nonceHash
    const nonceFromToken = idTokenPayload.nonce
    if (!nonceFromToken) {
      throw new IdTokenValidationException('nonce claim missing from ID token')
    }
    const expectedNonceHash = createHash('sha256').update(nonceFromToken).digest('hex')
    if (expectedNonceHash !== session.nonceHash) {
      throw new IdTokenValidationException('nonce mismatch')
    }

    // 9. Provider-specific tenant/domain verification
    if (provider.providerType === 'google') {
      // For Google Workspace: require hd claim to match provider.directoryId when set
      if (provider.directoryId) {
        const hd = idTokenPayload.hd
        if (!hd || hd !== provider.directoryId) {
          throw new GoogleWorkspaceDomainMismatchException()
        }
      }
    } else {
      // Microsoft: verify tid matches provider directoryId
      const tid = idTokenPayload.tid
      if (!tid || tid !== provider.directoryId) {
        throw new MicrosoftTenantMismatchException()
      }
    }

    // 10. Atomically consume the session — returns false if a concurrent request already consumed it
    const consumed = await this.sessionRepo.consume(session.id, session.tenantId)
    if (!consumed) {
      throw new OAuthSessionConsumedException()
    }

    // 11. Resolve Future user identity
    // For Microsoft, prefer oid (stable object ID) over sub. For Google, sub is the stable identifier.
    const ssoSubject =
      provider.providerType === 'google'
        ? idTokenPayload.sub
        : (idTokenPayload.oid ?? idTokenPayload.sub)!
    const userIdentity = await this.kernelFacade.getUserIdentityBySsoSubject(
      ssoSubject,
      session.tenantId,
    )
    if (!userIdentity) {
      throw new UserIdentityNotFoundException(ssoSubject)
    }

    // 12. Load actor for display name
    const actor = await this.kernelFacade.getActor(userIdentity.actorId, session.tenantId)

    // 13. Sign Future session JWT
    const sessionToken = await this.jwtService.sign({
      sub: userIdentity.actorId,
      tid: session.tenantId,
      tenantName: tenant.name,
      displayName: actor?.displayName ?? idTokenPayload.name ?? '',
      email: userIdentity.email,
      roles: [],
      provider: provider.providerType,
    })

    return {
      sessionToken,
      redirectTo: session.redirectTo,
    }
  }
}
