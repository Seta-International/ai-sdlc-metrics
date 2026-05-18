import type { TenantSummary } from './schemas'

export type MeContext = {
  tenant: TenantSummary | null
  isSuperadmin: boolean
  apps: string[]
}

export interface MeContextProvider {
  resolve(userId: string): Promise<MeContext>
}

export type AttachStatus = 'superadmin' | 'attached' | 'no-membership'
