// Types
export type {
  ModuleKey,
  AgentContext,
  AgentInsight,
  AgentInlineActionConfig,
  AgentSessionStatus,
  AgentMessageRole,
  AgentSession,
  AgentPanelState,
} from './types'

// Context
export { AgentContextProvider } from './context/agent-context-provider'
export type { AgentContextProviderProps } from './context/agent-context-provider'
export { useAgentContext } from './context/use-agent-context'

// State
export { AgentStateProvider, useAgentState, useOptionalAgentState } from './hooks/use-agent-state'
export type { AgentStateContextValue } from './hooks/use-agent-state'

// Provider
export { AgentProvider } from './agent-provider'
export type { AgentProviderProps } from './agent-provider'

// Runtime
export { createAgentChatAdapter } from './runtime/agent-chat-adapter'
export type { AgentChatAdapterOptions } from './runtime/agent-chat-adapter'
export { createAgentTurnStore, useAgentTurnStore } from './runtime/agent-turn-store'
export type { AgentTurnStore, AgentTurnState, Citation } from './runtime/agent-turn-store'
export { sseEventSchema } from './runtime/sse-event-schema'
export type {
  SseEvent,
  TurnEndReason,
  RefusalReason,
  CancellationReason,
  UsageSnapshot,
  ScorerResult,
  DraftProvenance,
  DraftPayload,
} from './runtime/sse-event-schema'
export { createAgentEventConsumer } from './runtime/event-consumer'
export type { AgentEventConsumer } from './runtime/event-consumer'

// Thread
export { AgentThread } from './thread/agent-thread'
export { AgentComposer } from './thread/agent-composer'

// Panel
export { AgentPanel } from './panel/agent-panel'
export type { AgentPanelProps } from './panel/agent-panel'

// Inline
export { AgentInlineAction } from './inline/agent-inline-action'
export type { AgentInlineActionProps } from './inline/agent-inline-action'
export { AgentInlineResponse } from './inline/agent-inline-response'
export type { AgentInlineResponseProps } from './inline/agent-inline-response'

// Ambient
export { AgentStrip } from './ambient/agent-strip'
export { AgentBadge } from './ambient/agent-badge'
export { AgentBanner } from './ambient/agent-banner'
