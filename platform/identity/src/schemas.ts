import { z } from '@hono/zod-openapi'

export const SessionUser = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1),
    pictureUrl: z.string().url().nullable(),
  })
  .openapi('SessionUser')

export type SessionUser = z.infer<typeof SessionUser>

export const TenantSummary = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    role: z.enum(['owner', 'admin', 'member']),
  })
  .openapi('TenantSummary')

export type TenantSummary = z.infer<typeof TenantSummary>

export const MeResponse = z
  .object({
    user: SessionUser,
    tenants: z.array(TenantSummary),
    csrfToken: z.string().min(1),
  })
  .openapi('MeResponse')

export type MeResponse = z.infer<typeof MeResponse>

export const LoginBody = z
  .object({
    returnTo: z.string().optional(),
  })
  .openapi('SsoLoginBody')

export const LoginResponse = z
  .object({
    url: z.string().url(),
  })
  .openapi('SsoLoginResponse')

export const ProviderParam = z.enum(['entra', 'google'])
