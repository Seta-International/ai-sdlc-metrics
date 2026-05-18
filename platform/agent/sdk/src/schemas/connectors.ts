import { z } from 'zod'

export const ConnectorStatusSchema = z.enum(['consented', 'pending', 'failed', 'token-expired'])
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>

export const ConnectorSummarySchema = z.object({
  id: z.string(),
  providerId: z.string(),
  displayName: z.string(),
  description: z.string(),
  customerFacingRationale: z.string(),
  requiredScopes: z.object({
    delegated: z.array(z.string()),
    application: z.array(z.string()),
  }),
  capabilities: z.object({ syncable: z.boolean(), writes: z.boolean() }),
  status: ConnectorStatusSchema,
  lastConsentedAt: z.string().nullable(),
})
export type ConnectorSummary = z.infer<typeof ConnectorSummarySchema>

export const ConnectorSummaryListSchema = z.array(ConnectorSummarySchema)

export const ConsentUrlResponseSchema = z.object({
  url: z.url(),
  state: z.string(),
})
export type ConsentUrlResponse = z.infer<typeof ConsentUrlResponseSchema>
