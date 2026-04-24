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
