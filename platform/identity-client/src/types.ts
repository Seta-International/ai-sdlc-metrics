import { z } from 'zod'

export const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  pictureUrl: z.string().url().nullable(),
})
export type SessionUser = z.infer<typeof SessionUser>

export const TenantSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  isAdmin: z.boolean(),
})
export type TenantSummary = z.infer<typeof TenantSummary>

export const MeResponse = z.object({
  user: SessionUser,
  tenant: TenantSummary.nullable(),
  isSuperadmin: z.boolean(),
  apps: z.array(z.string()),
  csrfToken: z.string().min(1),
})
export type MeResponse = z.infer<typeof MeResponse>
