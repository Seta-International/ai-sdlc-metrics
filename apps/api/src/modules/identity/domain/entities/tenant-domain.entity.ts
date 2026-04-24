export type TenantDomainStatus = 'pending' | 'verified' | 'disabled'

export class TenantDomainEntity {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly domain: string,
    public status: TenantDomainStatus,
    public readonly verificationTokenHash: string,
    public verifiedAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  static create(props: {
    id?: string
    tenantId: string
    domain: string
    status?: TenantDomainStatus
    verificationTokenHash: string
    verifiedAt?: Date | null
    createdAt?: Date
    updatedAt?: Date
  }): TenantDomainEntity {
    const now = new Date()
    return new TenantDomainEntity(
      props.id ?? '',
      props.tenantId,
      props.domain,
      props.status ?? 'pending',
      props.verificationTokenHash,
      props.verifiedAt ?? null,
      props.createdAt ?? now,
      props.updatedAt ?? now,
    )
  }

  static reconstruct(row: {
    id: string
    tenantId: string
    domain: string
    status: TenantDomainStatus
    verificationTokenHash: string
    verifiedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): TenantDomainEntity {
    return new TenantDomainEntity(
      row.id,
      row.tenantId,
      row.domain,
      row.status,
      row.verificationTokenHash,
      row.verifiedAt,
      row.createdAt,
      row.updatedAt,
    )
  }

  isUsableForLogin(): boolean {
    return this.status === 'verified'
  }
}
