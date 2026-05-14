import type { AgentMemoryProvider } from '@seta/agent-memory'
import { tenantContext } from '@seta/tenant'
import { Hono } from 'hono'

export function createThreadRoutes(memory: AgentMemoryProvider): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    const tenantId = c.req.header('x-tenant-id')
    const userId = c.req.header('x-user-id')
    if (!tenantId) return c.json({ error: 'X-Tenant-Id header required' }, 400)
    return tenantContext.run({ tenantId, ...(userId ? { userId } : {}) }, next)
  })

  app.get('/', async (c) => {
    const page = c.req.query('page') ? Number(c.req.query('page')) : 0  // 0-indexed
    const perPageRaw = c.req.query('perPage')
    const perPage = perPageRaw === 'false' ? false : perPageRaw ? Number(perPageRaw) : undefined
    const orderBy = c.req.query('orderBy')
    const resourceId = c.req.query('resourceId') ?? undefined

    const result = await memory.listThreads({
      page,
      perPage,
      ...(orderBy ? { orderBy: { updatedAt: 'desc' as const, ...parseOrderBy(orderBy) } } : {}),
      filter: resourceId ? { resourceId } : undefined,
    })
    return c.json(result)
  })

  app.get('/:threadId', async (c) => {
    const thread = await memory.getThread(c.req.param('threadId'))
    if (!thread) return c.json({ error: 'Not found' }, 404)
    return c.json(thread)
  })

  app.post('/', async (c) => {
    const body = await c.req.json<{
      resourceId?: string
      threadId?: string
      title?: string | null
      metadata?: Record<string, unknown> | null
    }>()
    if (!body.resourceId) return c.json({ error: 'resourceId is required' }, 400)
    const thread = await memory.createThread({
      resourceId: body.resourceId,
      threadId: body.threadId,
      title: body.title,
      metadata: body.metadata,
    })
    return c.json(thread, 201)
  })

  app.put('/:threadId', async (c) => {
    const body = await c.req.json<{
      resourceId?: string
      title?: string | null
      metadata?: Record<string, unknown> | null
    }>()
    if (!body.resourceId) return c.json({ error: 'resourceId is required' }, 400)
    const thread = await memory.saveThread({
      id: c.req.param('threadId'),
      resourceId: body.resourceId,
      title: body.title,
      metadata: body.metadata,
    })
    return c.json(thread)
  })

  // Replace semantics: both title and metadata required (matches Mastra's updateThread)
  app.patch('/:threadId', async (c) => {
    const body = await c.req.json<{
      title?: string
      metadata?: Record<string, unknown>
    }>()
    if (body.title === undefined || body.metadata === undefined) {
      return c.json({ error: 'title and metadata are both required' }, 400)
    }
    const thread = await memory.updateThread(c.req.param('threadId'), {
      title: body.title,
      metadata: body.metadata,
    })
    if (!thread) return c.json({ error: 'Not found' }, 404)
    return c.json(thread)
  })

  app.delete('/:threadId', async (c) => {
    await memory.deleteThread(c.req.param('threadId'))
    return c.body(null, 204)
  })

  return app
}

function parseOrderBy(raw: string): Record<string, 'asc' | 'desc'> {
  // Accepts formats: "updatedAt:desc", "createdAt:asc"
  const [field, dir] = raw.split(':')
  if ((field === 'updatedAt' || field === 'createdAt') && (dir === 'asc' || dir === 'desc')) {
    return { [field]: dir }
  }
  return {}
}
