import type { IdpProviderType } from './identity-provider.entity'

export class OAuthAuthorizationSessionEntity {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly providerId: string,
    public readonly providerType: IdpProviderType,
    public readonly stateHash: string,
    public readonly nonceHash: string,
    public readonly redirectTo: string,
    public readonly expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static create(props: {
    id?: string
    tenantId: string
    providerId: string
    providerType: IdpProviderType
    stateHash: string
    nonceHash: string
    redirectTo: string
    expiresAt: Date
    consumedAt?: Date | null
    createdAt?: Date
  }): OAuthAuthorizationSessionEntity {
    return new OAuthAuthorizationSessionEntity(
      props.id ?? '',
      props.tenantId,
      props.providerId,
      props.providerType,
      props.stateHash,
      props.nonceHash,
      props.redirectTo,
      props.expiresAt,
      props.consumedAt ?? null,
      props.createdAt ?? new Date(),
    )
  }

  static reconstruct(row: {
    id: string
    tenantId: string
    providerId: string
    providerType: IdpProviderType
    stateHash: string
    nonceHash: string
    redirectTo: string
    expiresAt: Date
    consumedAt: Date | null
    createdAt: Date
  }): OAuthAuthorizationSessionEntity {
    return new OAuthAuthorizationSessionEntity(
      row.id,
      row.tenantId,
      row.providerId,
      row.providerType,
      row.stateHash,
      row.nonceHash,
      row.redirectTo,
      row.expiresAt,
      row.consumedAt,
      row.createdAt,
    )
  }

  isExpired(now: Date): boolean {
    return now >= this.expiresAt
  }

  isConsumed(): boolean {
    return this.consumedAt !== null
  }

  isUsable(now: Date): boolean {
    return !this.isExpired(now) && !this.isConsumed()
  }
}
