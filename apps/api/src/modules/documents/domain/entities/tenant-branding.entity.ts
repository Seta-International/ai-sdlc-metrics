export interface TenantBranding {
  id: string
  tenantId: string
  companyName: string
  logoFileKey: string | null
  primaryColor: string | null
  fontFamily: string | null
  updatedAt: Date
}
