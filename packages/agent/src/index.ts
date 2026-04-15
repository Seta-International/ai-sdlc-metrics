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

// Panel
export { AgentPanel } from './panel/agent-panel'
export { AgentMessage } from './panel/agent-message'
export type { AgentMessageProps } from './panel/agent-message'
export { AgentToolTrace } from './panel/agent-tool-trace'
export type { AgentToolTraceProps } from './panel/agent-tool-trace'
export { AgentContextPills } from './panel/agent-context-pills'
export { AgentMessageInput } from './panel/agent-message-input'
export type { AgentMessageInputProps } from './panel/agent-message-input'

// Inline
export { AgentInlineAction } from './inline/agent-inline-action'
export type { AgentInlineActionProps } from './inline/agent-inline-action'
export { AgentInlineResponse } from './inline/agent-inline-response'
export type { AgentInlineResponseProps } from './inline/agent-inline-response'

// Ambient
export { AgentStrip } from './ambient/agent-strip'
export { AgentBadge } from './ambient/agent-badge'
export { AgentBanner } from './ambient/agent-banner'
