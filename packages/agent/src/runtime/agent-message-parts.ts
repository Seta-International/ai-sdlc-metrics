import type { ScorerResult, UsageSnapshot, DraftProvenance } from './sse-event-schema'

export interface PlanPartArgs {
  traceId: string
  conversationId: string | null
  topology: 'bounded' | 'iterative'
  phase: 1 | 2 | null
  subAgents: { domain: string; name?: string }[]
  iteration?: number
}

export interface IterationPartArgs {
  n: number
  subAgentDomain: string
  selectionReason: string
  state: 'running' | 'passed' | 'failed'
  scorerResults?: ScorerResult[]
  usage?: UsageSnapshot
  isComplete?: boolean
}

export interface DraftPartArgs {
  actionId: string
  summary: string
  tier: 'low' | 'high'
  requiresApproval: boolean
  provenance: DraftProvenance
}

export const PLAN_TOOL = 'agent.plan' as const
export const ITERATION_TOOL = 'agent.iteration' as const
export const DRAFT_TOOL = 'agent.draft' as const

export function isPlanArgs(v: unknown): v is PlanPartArgs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.traceId === 'string' &&
    (o.conversationId === null || typeof o.conversationId === 'string') &&
    (o.topology === 'bounded' || o.topology === 'iterative') &&
    (o.phase === null || o.phase === 1 || o.phase === 2) &&
    Array.isArray(o.subAgents) &&
    (o.subAgents as unknown[]).every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>).domain === 'string',
    )
  )
}

export function isIterationArgs(v: unknown): v is IterationPartArgs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.n === 'number' &&
    typeof o.subAgentDomain === 'string' &&
    typeof o.selectionReason === 'string' &&
    (o.state === 'running' || o.state === 'passed' || o.state === 'failed')
  )
}

export function isDraftArgs(v: unknown): v is DraftPartArgs {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.actionId === 'string' &&
    typeof o.summary === 'string' &&
    (o.tier === 'low' || o.tier === 'high') &&
    typeof o.requiresApproval === 'boolean' &&
    typeof o.provenance === 'object' &&
    o.provenance !== null &&
    typeof (o.provenance as Record<string, unknown>).sub_agent_domain === 'string' &&
    typeof (o.provenance as Record<string, unknown>).trace_id === 'string'
  )
}
