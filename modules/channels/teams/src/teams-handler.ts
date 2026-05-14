import type { AdapterRegistry, MemoryProvider } from '@seta/agent-core'
import { run } from '@seta/agent-core'
import type { ToolRegistry } from '@seta/agent-server'
import {
  hydrateAgent,
  loadAgentActions,
  resolveAgentProfile,
  type WorkflowEngine,
} from '@seta/agent-server'
import { logger } from '@seta/observability'

const log = logger.child({ component: 'teams-handler' })

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface TeamsHandlerDeps {
  sql: DbSql
  toolRegistry: ToolRegistry
  memory: MemoryProvider
  workflowEngine: WorkflowEngine
  adapters: AdapterRegistry
}

export interface TeamsActivity {
  type: string
  text: string
  conversation: {
    id: string
    conversationType: 'personal' | 'groupChat' | 'channel'
  }
  channelId?: string
  recipient?: { id: string; name?: string }
}

export interface TeamsRunContext {
  tenantId: string
  userId: string
  timezone?: string
  abortSignal?: AbortSignal
}

export interface TeamsHandlerResult {
  card?: Record<string, unknown>
  text?: string
  agentName?: string
}

function stripMention(text: string): string {
  return text
    .replace(/<at>[^<]+<\/at>/gi, '')
    .replace(/@\S+/g, '')
    .trim()
}

function selectSlug(text: string): string {
  if (/^(analytics:|chart|workload chart|show.*chart|velocity|burn.?down)/i.test(text))
    return 'analytics'
  if (/^(faq:|policy|how do (i|we)|what is (our|the|seta)|company.*rule|quy định)/i.test(text))
    return 'faq'
  return 'planner'
}

function buildThreadId(activity: TeamsActivity, ctx: TeamsRunContext): string {
  switch (activity.conversation.conversationType) {
    case 'personal':
      return `t:${ctx.tenantId}:u:${ctx.userId}:personal`
    case 'groupChat':
      return `t:${ctx.tenantId}:gc:${activity.conversation.id}`
    case 'channel':
      return `t:${ctx.tenantId}:ch:${activity.channelId ?? activity.conversation.id}`
  }
}

export function createTeamsHandler(deps: TeamsHandlerDeps) {
  return async function handleActivity(
    activity: TeamsActivity,
    runCtx: TeamsRunContext,
  ): Promise<TeamsHandlerResult> {
    const text = stripMention(activity.text ?? '').trim()
    const convType = activity.conversation.conversationType

    log.info({ type: activity.type, conversationType: convType }, 'teams.activity')

    await deps.sql`SET LOCAL app.tenant_id = ${runCtx.tenantId}`
    await deps.sql`SET LOCAL app.user_id   = ${runCtx.userId}`

    const slug = selectSlug(text)
    log.info({ slug }, 'teams.agent-selected')
    const profile = await resolveAgentProfile(deps.sql, runCtx.tenantId, slug)
    const actions = await loadAgentActions(deps.sql, runCtx.tenantId, profile.agentId)
    const ctx = { timezone: runCtx.timezone ?? 'UTC', convType }
    const agentConfig = hydrateAgent(profile, actions, ctx, deps.toolRegistry)
    const threadId = buildThreadId(activity, runCtx)

    const chunks = run(
      agentConfig,
      { messages: [{ role: 'user', content: [{ type: 'text', text }] }], threadId },
      {
        adapters: deps.adapters,
        memory: deps.memory,
        signal: runCtx.abortSignal ?? new AbortController().signal,
      },
    )

    let responseText = ''
    try {
      for await (const chunk of chunks) {
        if (chunk.type === 'text') responseText += chunk.delta
      }
    } catch (err) {
      log.error({ err }, 'teams.run-failed')
      throw err
    }

    const result: TeamsHandlerResult = { agentName: profile.name }
    if (responseText) result.text = responseText
    return result
  }
}
