export interface AgentChatSessionEntity {
  id: string
  tenantId: string
  actorId: string
  agentId: string | null
  channelType: string
  status: 'active' | 'completed' | 'escalated' | 'expired' | 'error'
  contextModule: string | null
  contextEntity: string | null
  contextEntityId: string | null
  contextMetadata: Record<string, unknown> | null
  createdAt: Date
  endedAt: Date | null
}
