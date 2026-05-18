import { z } from '@hono/zod-openapi'

export const GraphMailerConfig = z.object({
  mailbox_user_id: z.string().min(1),
  from_address: z.email(),
})
export type GraphMailerConfig = z.infer<typeof GraphMailerConfig>

export const SmtpMailerConfig = z.object({
  from_address: z.email(),
})

export const SesMailerConfig = z.object({
  region: z.string().min(1),
  from_address: z.email(),
  configuration_set: z.string().optional(),
})

export const MailerConfigDiscriminated = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('graph'), config: GraphMailerConfig }),
])
export type MailerConfigDiscriminated = z.infer<typeof MailerConfigDiscriminated>

export function parseMailerConfig(input: unknown): MailerConfigDiscriminated {
  return MailerConfigDiscriminated.parse(input)
}
