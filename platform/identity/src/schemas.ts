import { z } from '@hono/zod-openapi'
import { TenantSummary } from './me-context-provider'

export const SessionUser = z
  .object({
    id: z.uuid(),
    email: z.string().email(),
    name: z.string().min(1),
    pictureUrl: z.string().url().nullable(),
  })
  .openapi('SessionUser')

export type SessionUser = z.infer<typeof SessionUser>

export const MeResponse = z
  .object({
    user: SessionUser,
    tenant: TenantSummary.nullable(),
    isSuperadmin: z.boolean(),
    apps: z.array(z.string()),
    csrfToken: z.string().min(1),
  })
  .openapi('MeResponse')

export type MeResponse = z.infer<typeof MeResponse>

export const LoginBody = z.object({ returnTo: z.string().optional() }).openapi('SsoLoginBody')

export const LoginResponse = z.object({ url: z.string().url() }).openapi('SsoLoginResponse')

export const ProviderParam = z.enum(['entra', 'google'])
