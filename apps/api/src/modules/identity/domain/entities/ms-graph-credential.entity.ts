export type MsGraphCredentialStatus = 'active' | 'invalid' | 'paused'

export class MsGraphCredentialEntity {
  constructor(
    public readonly tenantId: string,
    public readonly clientId: string,
    public readonly clientSecretRef: string,
    public readonly tenantAdId: string,
    public readonly scopes: readonly string[],
    public status: MsGraphCredentialStatus,
    public readonly consentedAt: Date,
    public lastValidatedAt: Date | null,
    public lastError: string | null,
  ) {}

  static create(props: {
    tenantId: string
    clientId: string
    clientSecretRef: string
    tenantAdId: string
    scopes: readonly string[]
    consentedAt: Date
    status?: MsGraphCredentialStatus
    lastValidatedAt?: Date | null
    lastError?: string | null
  }): MsGraphCredentialEntity {
    return new MsGraphCredentialEntity(
      props.tenantId,
      props.clientId,
      props.clientSecretRef,
      props.tenantAdId,
      props.scopes,
      props.status ?? 'active',
      props.consentedAt,
      props.lastValidatedAt ?? null,
      props.lastError ?? null,
    )
  }

  markInvalid(reason: string): void {
    this.status = 'invalid'
    this.lastError = reason
  }

  markActive(): void {
    this.status = 'active'
    this.lastError = null
    this.lastValidatedAt = new Date()
  }

  markPaused(): void {
    this.status = 'paused'
  }
}
