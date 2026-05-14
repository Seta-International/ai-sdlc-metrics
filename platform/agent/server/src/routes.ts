import type { AdapterRegistry, MemoryProvider } from '@seta/agent-core'
import { run, streamKernelSSE } from '@seta/agent-core'
import { DomainError } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { Hono } from 'hono'
import { z } from 'zod'
import { buildActionTool } from './actions/build-action-tool'
import {
  hydrateAgent,
  invalidateProfileCache,
  loadAgentActions,
  resolveAgentProfile,
} from './profile-registry'
import type { ToolRegistry } from './tool-registry'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface WorkflowEngine {
  getStatus(runId: string): Promise<unknown>
  resume(
    runId: string,
    body: { action: 'confirm' | 'cancel'; payload?: Record<string, unknown> },
  ): Promise<void>
}

export interface ThreadStore extends MemoryProvider {
  listThreads?(opts: { tenantId: string; userId?: string }): Promise<unknown[]>
  getThread?(threadId: string): Promise<unknown[]>
  deleteThread?(threadId: string): Promise<void>
}

export interface AgentRouterDeps {
  sql: DbSql
  toolRegistry: ToolRegistry
  memory: ThreadStore
  workflowEngine: WorkflowEngine
  adapters: AdapterRegistry
}

const RunBody = z.object({
  message: z.string().min(1),
  threadId: z.string().optional(),
  timezone: z.string().default('UTC'),
})

const ProfileBody = z.object({
  slug: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
  model: z.string().min(1),
  toolIds: z.array(z.string()).default([]),
  workingMemoryTemplate: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
})

const ActionBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  spec: z.record(z.string(), z.unknown()),
  auth: z.record(z.string(), z.unknown()).optional(),
})

export function createAgentRouter(deps: AgentRouterDeps): Hono {
  const app = new Hono()
  const { sql, toolRegistry, memory, workflowEngine, adapters } = deps

  // ── Profile CRUD ──────────────────────────────────────────────────────────

  app.get('/agents', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const rows = await sql`
      SELECT *
      FROM agent.agent_profiles
      WHERE status = 'published'
        AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
      ORDER BY tenant_id NULLS LAST, name
    `
    return c.json({ agents: rows })
  })

  app.post('/agents', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const body = ProfileBody.parse(await c.req.json())
    const rows = await sql`
      INSERT INTO agent.agent_profiles
        (tenant_id, slug, name, description, instructions, model, tool_ids,
         working_memory_template, temperature, status)
      VALUES (
        ${tenantId}::uuid, ${body.slug ?? null}, ${body.name}, ${body.description ?? null},
        ${body.instructions}, ${body.model}, ${(sql as never as { array: (a: unknown[]) => unknown }).array(body.toolIds)},
        ${body.workingMemoryTemplate ?? null}, ${body.temperature ?? null}, 'published'
      )
      RETURNING *
    `
    return c.json(rows[0], 201)
  })

  app.get('/agents/:agentId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const row = await resolveAgentProfile(sql, tenantId, agentId)
    return c.json(row)
  })

  app.patch('/agents/:agentId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const existing = await sql`
      SELECT tenant_id FROM agent.agent_profiles WHERE agent_id = ${agentId}::uuid LIMIT 1
    `
    const row = existing[0] as { tenant_id: string | null } | undefined
    if (!row) throw new DomainError(404, `Agent profile not found: ${agentId}`, { detail: agentId })
    if (row.tenant_id === null) {
      return c.json({ error: 'Cannot modify global profiles' }, 403)
    }
    const body = ProfileBody.partial().parse(await c.req.json())
    await sql`
      UPDATE agent.agent_profiles SET
        name = COALESCE(${body.name ?? null}, name),
        description = COALESCE(${body.description ?? null}, description),
        instructions = COALESCE(${body.instructions ?? null}, instructions),
        model = COALESCE(${body.model ?? null}, model),
        updated_at = now()
      WHERE agent_id = ${agentId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    invalidateProfileCache(tenantId, agentId)
    return c.json({ ok: true })
  })

  app.delete('/agents/:agentId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const existing = await sql`
      SELECT tenant_id FROM agent.agent_profiles WHERE agent_id = ${agentId}::uuid LIMIT 1
    `
    const row = existing[0] as { tenant_id: string | null } | undefined
    if (!row) throw new DomainError(404, `Agent profile not found: ${agentId}`, { detail: agentId })
    if (row.tenant_id === null) return c.json({ error: 'Cannot delete global profiles' }, 403)
    await sql`
      DELETE FROM agent.agent_profiles WHERE agent_id = ${agentId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    return c.json({ ok: true })
  })

  // ── Action CRUD ───────────────────────────────────────────────────────────

  app.get('/agents/:agentId/actions', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const rows = await loadAgentActions(sql, tenantId, agentId)
    return c.json({ actions: rows })
  })

  app.post('/agents/:agentId/actions', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const body = ActionBody.parse(await c.req.json())
    const rows = await sql`
      INSERT INTO agent.agent_actions (agent_id, tenant_id, name, description, spec, auth)
      VALUES (${agentId}::uuid, ${tenantId}::uuid, ${body.name}, ${body.description},
              ${JSON.stringify(body.spec)}::jsonb, ${body.auth ? JSON.stringify(body.auth) : null}::jsonb)
      RETURNING *
    `
    return c.json(rows[0], 201)
  })

  app.patch('/agents/:agentId/actions/:actionId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { actionId } = c.req.param()
    const body = ActionBody.partial().parse(await c.req.json())
    await sql`
      UPDATE agent.agent_actions SET
        name = COALESCE(${body.name ?? null}, name),
        description = COALESCE(${body.description ?? null}, description),
        updated_at = now()
      WHERE action_id = ${actionId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    return c.json({ ok: true })
  })

  app.delete('/agents/:agentId/actions/:actionId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { actionId } = c.req.param()
    await sql`
      DELETE FROM agent.agent_actions
      WHERE action_id = ${actionId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    return c.json({ ok: true })
  })

  // ── Run (SSE) ─────────────────────────────────────────────────────────────

  app.post('/agents/:agentId/run', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const body = RunBody.parse(await c.req.json())
    const profile = await resolveAgentProfile(sql, tenantId, agentId)
    const actions = await loadAgentActions(sql, tenantId, profile.agentId)
    const ctx = { timezone: body.timezone, convType: 'direct' as const }
    const actionTools = actions.map(buildActionTool)
    const agentConfig = hydrateAgent(profile, actions, ctx, {
      register: toolRegistry.register.bind(toolRegistry),
      resolve: (ids) => [
        ...toolRegistry.resolve(ids),
        ...actionTools.filter((t) => ids.includes(t.id)),
      ],
    })
    const threadId = body.threadId ?? `t:${tenantId}:direct:${Date.now()}`
    return streamKernelSSE(
      c,
      run(
        agentConfig,
        { messages: [{ role: 'user', content: [{ type: 'text', text: body.message }] }], threadId },
        { adapters, memory },
      ),
    )
  })

  // ── Threads ───────────────────────────────────────────────────────────────

  app.get('/threads', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const userId = tenantContext.getUserId()
    const threads =
      (await memory.listThreads?.({ tenantId, ...(userId !== undefined ? { userId } : {}) })) ?? []
    return c.json({ threads })
  })

  app.get('/threads/:threadId', async (c) => {
    const { threadId } = c.req.param()
    const messages = (await memory.getThread?.(threadId)) ?? []
    return c.json({ messages })
  })

  app.delete('/threads/:threadId', async (c) => {
    const { threadId } = c.req.param()
    await memory.deleteThread?.(threadId)
    return c.json({ ok: true })
  })

  // ── Workflows ─────────────────────────────────────────────────────────────

  app.get('/workflows/:runId/status', async (c) => {
    const { runId } = c.req.param()
    const status = await workflowEngine.getStatus(runId)
    return c.json({ status })
  })

  app.post('/workflows/:runId/resume', async (c) => {
    const { runId } = c.req.param()
    const body = z
      .object({
        action: z.enum(['confirm', 'cancel']),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await c.req.json())
    await workflowEngine.resume(runId, {
      action: body.action,
      ...(body.payload !== undefined ? { payload: body.payload } : {}),
    })
    return c.json({ ok: true })
  })

  return app
}
