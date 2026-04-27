export type ScorerKind = 'deterministic' | 'llm-judge'
export type ScorerScope = 'live' | 'trace' | 'experiment' | 'test'
export type ScorerDefinitionSource = 'code' | 'stored'
export type AnswerShape = 'short-answer' | 'list' | 'table' | 'narrative' | 'chart' | 'refusal'
export type AdversarialCategory =
  | 'sanitization-projection'
  | 'taint-escalation'
  | 'permission-denial'
  | 'disambiguation'
  | 'contradiction'

export type ScorerResult = {
  score: 0 | 1
  passed: boolean
  reason?: string
}

export type RequestContext = {
  tenantId: string
  userId: string
  traceId?: string
}

export type ScorerContext<TInput, TOutput> = {
  traceId?: string
  input: TInput
  output: TOutput
  requestContext?: RequestContext
}

export type SetaScorer<TInput = unknown, TOutput = unknown> = {
  id: string
  name: string
  kind: ScorerKind
  scope: ScorerScope
  definitionSource: ScorerDefinitionSource
  run(ctx: ScorerContext<TInput, TOutput>): Promise<ScorerResult>
}

export type Fingerprint = {
  toolCallsSorted: string[]
  shape: AnswerShape
  permissionKeys: string[]
  taintFlipped: boolean
}

/**
 * Sentinel fingerprint emitted when ReplayHarness fails (lookup miss / tool-output miss).
 * Plan 17 §4.5 — the golden-trace runner uses this so a replay failure produces a
 * visible regression report rather than silently passing.
 *
 * Cast required because the `__replay_failed__` literal is intentionally outside the
 * AnswerShape union — this value is never a real answer shape, only a divergence sentinel.
 */
export const MARKER_REPLAY_FAILED: Fingerprint = {
  toolCallsSorted: ['__REPLAY_FAILED__'],
  shape: '__replay_failed__' as AnswerShape,
  permissionKeys: ['__REPLAY_FAILED__'],
  taintFlipped: false,
}

export type ModelTier = 'full' | 'nano'
export type ElevatedNoticeLevel = 'none' | 'elevated' | 'hard_refusal'

export type TierHealth = {
  tier: ModelTier
  successRateRolling: number
  degradedFlag: boolean
  degradedSince?: Date
  elevatedNoticeLevel: ElevatedNoticeLevel
}

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  toolCallId?: string
  toolName?: string
}

export type LlmMessageArray = LlmMessage[]

export type ToolCallRecord = {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
}

export type ReplayResult = {
  messages: LlmMessageArray[]
  toolOutputs?: ToolCallRecord[]
  pinnedVersions: Record<string, string>
  canonicalizerVersionHash: string
  missedHashes: never // type-level guarantee: replay raises on any miss; this field can never be assigned
}

export type ReplayedTrace = {
  traceId: string
  tenantId: string
  replayResult: ReplayResult
  toolCallsObserved: Array<{
    toolName: string
    invocationContext: string
  }>
}
