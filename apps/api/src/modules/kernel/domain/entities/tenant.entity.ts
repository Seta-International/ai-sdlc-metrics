export interface Tenant {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'cancelled'
  planTier: 'starter' | 'professional' | 'enterprise'
  createdAt: Date
  updatedAt: Date
}
