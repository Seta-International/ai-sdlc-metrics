import type { LucideIcon } from 'lucide-react'

export type ModuleKey =
  | 'people'
  | 'time'
  | 'hiring'
  | 'performance'
  | 'projects'
  | 'finance'
  | 'goals'
  | 'insights'
  | 'planner'
  | 'admin'
  | 'kernel'

export interface AgentContext {
  module: ModuleKey
  entity: string
  id: string
  metadata?: Record<string, unknown>
}

export interface AgentInsight {
  id: string
  module: ModuleKey
  entity: string
  entityId: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  createdAt: Date
}

export interface AgentInlineActionConfig {
  key: string
  label: string
  icon?: LucideIcon
  permission?: string
}

export type AgentSessionStatus = 'active' | 'completed' | 'escalated' | 'expired' | 'error'
export type AgentMessageRole = 'user' | 'assistant' | 'tool_call' | 'tool_result'

export interface AgentMessage {
  id: string
  sessionId: string
  role: AgentMessageRole
  content: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  isError?: boolean
  createdAt: Date
}

export interface AgentSession {
  id: string
  status: AgentSessionStatus
  messages: AgentMessage[]
  context?: AgentContext
  createdAt: Date
  endedAt?: Date
}

export interface AgentPanelState {
  isOpen: boolean
  activeSessionId: string | null
}
