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
export { createAgentTurnStore } from './runtime/agent-turn-store'
export type { AgentTurnStore, AgentTurnState } from './runtime/agent-turn-store'
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
export { IterationGroup } from './thread/iteration/iteration-group'
export type { IterationGroupProps, IterationGroupItem } from './thread/iteration/iteration-group'
export { IterationHeader } from './thread/iteration/iteration-header'
export type { IterationHeaderProps } from './thread/iteration/iteration-header'

// Panel
export { AgentPanel } from './panel/agent-panel'
export type { AgentPanelProps } from './panel/agent-panel'
export { AgentChatRail } from './panel/rail/agent-chat-rail'
export type { AgentChatRailProps } from './panel/rail/agent-chat-rail'
export { useCollapsedState } from './panel/rail/use-collapsed-state'

// Inline
export { AgentInlineAction } from './inline/agent-inline-action'
export type { AgentInlineActionProps } from './inline/agent-inline-action'
export { AgentInlineResponse } from './inline/agent-inline-response'
export type { AgentInlineResponseProps } from './inline/agent-inline-response'

// Ambient
export { AgentStrip } from './ambient/agent-strip'
export { AgentBadge } from './ambient/agent-badge'
export { AgentBanner } from './ambient/agent-banner'

// Primitives
export { Tag } from './primitives/tag'
export type { TagProps } from './primitives/tag'
export { Mono } from './primitives/mono'
export type { MonoProps } from './primitives/mono'
export { TinyBtn } from './primitives/tiny-btn'
export type { TinyBtnProps } from './primitives/tiny-btn'
export { IconBtn } from './primitives/icon-btn'
export type { IconBtnProps } from './primitives/icon-btn'
export { ToolCallShell } from './primitives/tool-call-shell'
export type { ToolCallShellProps, ToolCallStatus } from './primitives/tool-call-shell'

// Cards
export { PlanCard } from './thread/cards/plan-card'
export type { PlanCardProps } from './thread/cards/plan-card'
export { IterationStep } from './thread/cards/iteration-step'
export type { IterationStepProps } from './thread/cards/iteration-step'
export { AnswerBubble } from './thread/cards/answer-bubble'
export type { AnswerBubbleProps } from './thread/cards/answer-bubble'
export { UserTurn } from './thread/cards/user-turn'
export type { UserTurnProps } from './thread/cards/user-turn'
export { DraftCard } from './thread/cards/draft-card'
export type { DraftCardProps } from './thread/cards/draft-card'
export { RejectReasonPicker } from './thread/cards/reject-reason-picker'
export type { RejectReasonPickerProps, RejectReason } from './thread/cards/reject-reason-picker'

// Runtime — part contracts
export {
  PLAN_TOOL,
  ITERATION_TOOL,
  DRAFT_TOOL,
  isPlanArgs,
  isIterationArgs,
  isDraftArgs,
} from './runtime/agent-message-parts'
export type { PlanPartArgs, IterationPartArgs, DraftPartArgs } from './runtime/agent-message-parts'
export { mapEventToPartUpdate } from './runtime/agent-chat-adapter'
export type { PartUpdate } from './runtime/agent-chat-adapter'
export { useCanApproveDrafts } from './hooks/use-can-approve-drafts'
export { useDraftRow } from './hooks/use-draft-row'
