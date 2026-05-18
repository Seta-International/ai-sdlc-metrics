import { z } from '@hono/zod-openapi'

export const EntraConfig = z.object({
  entra_tenant_id: z.string().min(1),
  client_id: z.string().min(1),
})
export type EntraConfig = z.infer<typeof EntraConfig>

export const SsoConfigDiscriminated = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('entra'), config: EntraConfig }),
])
export type SsoConfigDiscriminated = z.infer<typeof SsoConfigDiscriminated>

export function parseSsoConfig(input: unknown): SsoConfigDiscriminated {
  return SsoConfigDiscriminated.parse(input)
}
