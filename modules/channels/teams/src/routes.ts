import { Hono } from 'hono'
import { ActivitySchema } from './activity.js'
import type { TeamsHandler } from './handler.js'

export interface TeamsRouterOpts {
  botId: string
  botSecret: string
  skipJwtVerify?: boolean
}

export function routes(handler: TeamsHandler, opts: TeamsRouterOpts): Hono {
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
