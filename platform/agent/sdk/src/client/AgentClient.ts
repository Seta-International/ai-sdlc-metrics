import { z } from 'zod'
import { request } from '../transport/request'
import type { AgentClientOptions } from '../types'

export const MeSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  tenants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(['admin', 'member', 'viewer']),
    }),
  ),
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
