export interface TenantEmailConfig {
  id: string
  tenantId: string
  provider: 'ses' | 'smtp'
  fromAddress: string
  smtpHost: string | null
  smtpPort: number | null
  credentialRef: string
  createdAt: Date
  updatedAt: Date
}
