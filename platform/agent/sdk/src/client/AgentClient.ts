import { z } from 'zod'
import {
  type ConnectorSummary,
  ConnectorSummaryListSchema,
  type ConsentUrlResponse,
  ConsentUrlResponseSchema,
} from '../schemas/connectors'
import {
  type TenantSummary,
  TenantSummaryListSchema,
  TenantSummarySchema,
} from '../schemas/tenants'
import { request } from '../transport/request'
import type { AgentClientOptions } from '../types'

export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  pictureUrl: z.url().nullable(),
})
export type SessionUser = z.infer<typeof SessionUserSchema>

export const MeSchema = z.object({
  user: SessionUserSchema,
  tenants: z.array(TenantSummarySchema),
  csrfToken: z.string(),
})
export type Me = z.infer<typeof MeSchema>

export class AgentClient {
  constructor(private readonly opts: AgentClientOptions) {
    if (!opts.baseUrl) throw new Error('AgentClient: baseUrl is required')
  }

  getMe(init: { signal?: AbortSignal } = {}): Promise<Me> {
    const reqInit: { schema: typeof MeSchema; signal?: AbortSignal } = { schema: MeSchema }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, '/me', reqInit)
  }

  listTenants(init: { signal?: AbortSignal } = {}): Promise<TenantSummary[]> {
    const reqInit: { schema: typeof TenantSummaryListSchema; signal?: AbortSignal } = {
      schema: TenantSummaryListSchema,
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, '/tenants', reqInit)
  }

  listConnectors(
    tenantId: string,
    init: { signal?: AbortSignal } = {},
  ): Promise<ConnectorSummary[]> {
    const reqInit: { schema: typeof ConnectorSummaryListSchema; signal?: AbortSignal } = {
      schema: ConnectorSummaryListSchema,
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, `/tenants/${encodeURIComponent(tenantId)}/connectors`, reqInit)
  }

  grantConsentUrl(
    args: { tenantId: string; connectorId: string; tenantHint?: string },
    init: { signal?: AbortSignal } = {},
  ): Promise<ConsentUrlResponse> {
    const body: Record<string, string> = {}
    if (args.tenantHint !== undefined) body.tenantHint = args.tenantHint
    const reqInit: {
      method: 'POST'
      schema: typeof ConsentUrlResponseSchema
      body: Record<string, string>
      signal?: AbortSignal
    } = {
      method: 'POST',
      schema: ConsentUrlResponseSchema,
      body,
    }
    if (init.signal) reqInit.signal = init.signal
    return request(
      this.opts,
      `/tenants/${encodeURIComponent(args.tenantId)}/connectors/${encodeURIComponent(args.connectorId)}/consent-url`,
      reqInit,
    )
  }

  streamRun(runId: string, init: { signal?: AbortSignal } = {}): Promise<Response> {
    const reqInit: {
      expect: 'stream'
      headers: Record<string, string>
      signal?: AbortSignal
    } = {
      expect: 'stream',
      headers: { accept: 'text/event-stream' },
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, `/runs/${encodeURIComponent(runId)}/stream`, reqInit)
  }
}
