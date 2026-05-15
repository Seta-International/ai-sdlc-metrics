import type { AgentConfig } from '@seta/agent-core'
import { DomainError } from '@seta/middleware'
import { LRUCache } from 'lru-cache'
import type { AgentActionRow, AgentProfileRow } from './schema'
import type { ToolRegistry } from './tool-registry'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface RunContext {
  timezone: string
  convType: 'personal' | 'groupChat' | 'channel' | 'direct'
}

const profileCache = new LRUCache<string, AgentProfileRow>({
  max: 500,
  ttl: 5 * 60 * 1000,
})

export function invalidateProfileCache(tenantId: string, slugOrId: string) {
  profileCache.delete(`profile:${tenantId}:${slugOrId}`)
}

export async function resolveAgentProfile(
  sql: DbSql,
  tenantId: string,
  slugOrId: string,
): Promise<AgentProfileRow> {
  const key = `profile:${tenantId}:${slugOrId}`
  const cached = profileCache.get(key)
  if (cached) return cached

  const rows = await sql`
    SELECT *
    FROM agent.agent_profiles
    WHERE status = 'published'
      AND (
        (slug = ${slugOrId} AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL))
        OR (agent_id = ${slugOrId}::uuid AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL))
      )
    ORDER BY tenant_id NULLS LAST
    LIMIT 1
  `
  if (!rows.length) {
    throw new DomainError(404, `Agent profile not found: ${slugOrId}`, { detail: slugOrId })
  }
  const row = rows[0] as AgentProfileRow
  profileCache.set(key, row)
  return row
}

export async function loadAgentActions(
  sql: DbSql,
  tenantId: string,
  agentId: string,
): Promise<AgentActionRow[]> {
  const rows = await sql`
    SELECT * FROM agent.agent_actions
    WHERE tenant_id = ${tenantId}::uuid AND agent_id = ${agentId}::uuid
    ORDER BY created_at
  `
  return rows as AgentActionRow[]
}

export function interpolateInstructions(template: string, ctx: RunContext): string {
  return template.replaceAll('{{timezone}}', ctx.timezone).replaceAll('{{convType}}', ctx.convType)
}

export function hydrateAgent(
  profile: AgentProfileRow,
  _actions: AgentActionRow[],
  ctx: RunContext,
  toolRegistry: ToolRegistry,
): AgentConfig {
  return {
    model: profile.model,
    systemPrompt: interpolateInstructions(profile.instructions, ctx),
    tools: [...toolRegistry.resolve(profile.toolIds)],
  }
}
