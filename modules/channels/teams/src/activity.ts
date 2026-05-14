import { z } from 'zod'

export const ActivitySchema = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    serviceUrl: z.string(),
    channelId: z.literal('msteams'),
    from: z.object({
      id: z.string(),
      aadObjectId: z.string().optional(),
    }),
    conversation: z.object({
      id: z.string(),
      conversationType: z.enum(['personal', 'groupChat', 'channel']).default('personal'),
    }),
    recipient: z.object({ id: z.string() }),
    text: z.string().optional(),
    channelData: z
      .object({
        tenant: z.object({ id: z.string() }).optional(),
        team: z.object({ id: z.string() }).optional(),
      })
      .optional(),
    attachments: z.array(z.unknown()).optional(),
    value: z.unknown().optional(),
    name: z.string().optional(),
  })
  .passthrough()

export type Activity = z.infer<typeof ActivitySchema>
