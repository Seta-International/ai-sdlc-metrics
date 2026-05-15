import { z } from 'zod'

export const TenantSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
})
export type TenantSummary = z.infer<typeof TenantSummarySchema>

export const TenantSummaryListSchema = z.array(TenantSummarySchema)
