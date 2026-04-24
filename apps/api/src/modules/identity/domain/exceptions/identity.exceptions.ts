import { DomainException } from '@future/core'

export class IdentityProviderNotFoundException extends DomainException {
  readonly code = 'IDENTITY_PROVIDER_NOT_FOUND'
  constructor(id: string) {
    super(`Identity provider not found: ${id}`)
  }
}

export class PrimaryProviderAlreadyExistsException extends DomainException {
  readonly code = 'PRIMARY_PROVIDER_ALREADY_EXISTS'
  constructor(tenantId: string) {
    super(`A primary identity provider already exists for tenant: ${tenantId}`)
  }
}

export class InvalidClientSecretRefException extends DomainException {
  readonly code = 'INVALID_CLIENT_SECRET_REF'
  constructor(ref: string) {
    super(`client_secret_ref must be a valid AWS Secrets Manager ARN, got: ${ref}`)
  }
}

export class MagicLinkTokenExpiredException extends DomainException {
  readonly code = 'MAGIC_LINK_TOKEN_EXPIRED'
  constructor() {
    super('Magic link token has expired')
  }
}

export class MagicLinkTokenAlreadyUsedException extends DomainException {
  readonly code = 'MAGIC_LINK_TOKEN_ALREADY_USED'
  constructor() {
    super('Magic link token has already been used')
  }
}

export class MagicLinkTokenNotFoundException extends DomainException {
  readonly code = 'MAGIC_LINK_TOKEN_NOT_FOUND'
  constructor() {
    super('Magic link token not found')
  }
}

export class ApiKeyNotFoundException extends DomainException {
  readonly code = 'API_KEY_NOT_FOUND'
  constructor() {
    super('API key not found')
  }
}

export class ApiKeyRevokedException extends DomainException {
  readonly code = 'API_KEY_REVOKED'
  constructor() {
    super('API key has been revoked')
  }
}

export class ApiKeyExpiredException extends DomainException {
  readonly code = 'API_KEY_EXPIRED'
  constructor() {
    super('API key has expired')
  }
}

export class DirectorySyncAlreadyRunningException extends DomainException {
  readonly code = 'DIRECTORY_SYNC_ALREADY_RUNNING'
  constructor(providerId: string) {
    super(`Directory sync is already running for provider: ${providerId}`)
  }
}

export class ProviderMisconfiguredException extends DomainException {
  readonly code = 'PROVIDER_MISCONFIGURED'
  constructor(reason: string) {
    super(`Identity provider misconfigured: ${reason}`)
  }
}
