export const SCHEDULED_TURN_QUEUE = 'agent.scheduled-turn'

export type ScheduledTurnJob = {
  tenant_id: string
  user_on_behalf_of: string | null
  actor_principal: 'user' | 'agent:scheduler'
  schedule_id: string
  delegation_id: string
  flow_id: string
  taint_seeded: boolean
  cost_ceiling_remaining_usd: number
  invocation_ceiling_remaining: number
  pinned_versions: {
    router_version: string
    sub_agent_version: string
    tool_meta_version: string
    model_id: string
  }
  fired_by: string
  event_payload?: unknown
}
