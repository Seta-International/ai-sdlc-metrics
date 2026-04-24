export type AgentDelegation = {
  readonly id: string
  readonly tenantId: string
  readonly delegatorUserId: string | null
  readonly delegate: string
  readonly scope: Record<string, unknown>
  readonly expiresAt: Date
  readonly status: 'active' | 'expired' | 'revoked'
  readonly createdAt: Date
}
