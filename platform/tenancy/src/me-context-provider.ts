import { z } from '@hono/zod-openapi'

export const TenantSummary = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    isAdmin: z.boolean(),
  })
  .openapi('MeTenantSummary')

export type TenantSummary = z.infer<typeof TenantSummary>

export type MeContext = {
  tenant: TenantSummary | null
  isSuperadmin: boolean
  apps: string[]
}

export interface MeContextProvider {
  resolve(userId: string): Promise<MeContext>
}
