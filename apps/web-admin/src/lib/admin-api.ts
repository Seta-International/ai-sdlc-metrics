import { trpc } from './trpc'

export type TenantStatus = 'active' | 'suspended' | 'cancelled'

export interface PlatformTenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  planTier: 'starter' | 'professional' | 'enterprise'
  createdAt: Date
  updatedAt: Date
}

/** Query key for react-query caching */
export const listPlatformTenantsQueryKey = ['admin', 'platform', 'listTenants'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminPlatform = (trpc.admin as any).platform

export async function listPlatformTenants(): Promise<PlatformTenant[]> {
  // Cast: router type uses public stub; real runtime router has nested platform sub-router.
  // Delete cast when admin router types are repaired.
  const result = await adminPlatform.listTenants.query({})
  return result as PlatformTenant[]
}

export async function updatePlatformTenantStatus(input: {
  tenantId: string
  status: TenantStatus
}): Promise<void> {
  // Cast: same reason as above.
  await adminPlatform.updateTenantStatus.mutate(input)
}
