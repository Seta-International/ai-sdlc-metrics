export type ShareLinkStatus = 'active' | 'revoked'

export interface ProfileShareLink {
  id: string
  tenantId: string
  employmentId: string
  token: string
  expiresAt: Date
  maxViews: number | null
  viewCount: number
  status: ShareLinkStatus
  createdBy: string
  createdAt: Date
  revokedAt: Date | null
}
