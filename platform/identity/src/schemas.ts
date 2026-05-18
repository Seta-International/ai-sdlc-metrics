import { z } from '@hono/zod-openapi'

export const TenantSummary = z
  .object({ id: z.uuid(), slug: z.string(), name: z.string(), isAdmin: z.boolean() })
  .openapi('TenantSummary')
export type TenantSummary = z.infer<typeof TenantSummary>

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

export const DiscoverBody = z.object({ email: z.string().email() }).openapi('SsoDiscoverBody')
export const DiscoverResponse = z
  .discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      provider: z.literal('entra'),
      tenantSlug: z.string(),
      displayName: z.string(),
    }),
    z.object({ ok: z.literal(false), error: z.literal('no_workspace_for_email') }),
  ])
  .openapi('SsoDiscoverResponse')

export const StartBody = z
  .object({ email: z.string().email(), returnTo: z.string().optional() })
  .openapi('SsoStartBody')
export const StartResponse = z.object({ url: z.string().url() }).openapi('SsoStartResponse')

export const ProviderParam = z.enum(['entra'])
