import { Hono } from 'hono'
import { ActivitySchema } from './activity'
import type { TeamsHandler } from './handler'

export interface TeamsRouterOpts {
  botId: string
  botSecret: string
  skipJwtVerify?: boolean
}

export function routes(_handler: TeamsHandler, _opts: TeamsRouterOpts): Hono {
  const app = new Hono()

  app.post('/messages', async (c) => {
    const body = await c.req.json()
    ActivitySchema.parse(body)
    return c.body(null, 200)
  })

  app.get('/health', (c) => c.json({ ok: true }))
  return app
}

export const teamsRouter = routes
