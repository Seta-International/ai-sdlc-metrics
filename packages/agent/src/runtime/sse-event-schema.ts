import * as z from 'zod'

// ── Shared value types ────────────────────────────────────────────────────────

const usageSnapshotSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  input_cached_read: z.number(),
  input_cached_write: z.number(),
  output_reasoning: z.number(),
})

const refusalReasonSchema = z.enum([
  'daily_budget',
  'insufficient_minimum',
  'rate_limit',
  'disambiguation',
  'model_policy',
  'internal',
])

const turnEndReasonSchema = z.enum([
  'completed',
  'cancelled',
  'timeout',
  'refused',
  'error',
  'budget',
  'provider_outage',
  'quality_canary',
])

// Used by server-side AbortCoordinator — not part of the event union
export const cancellationReasonSchema = z.enum([
  'user',
  'timeout',
  'budget',
  'provider_outage',
  'quality_canary',
])

const scorerResultSchema = z.object({
  scorer: z.string(),
  passed: z.boolean(),
  score: z.number().optional(),
})

const draftProvenanceSchema = z.object({
  sub_agent_domain: z.string(),
  trace_id: z.string(),
})

const metadataSchema = z.record(z.string(), z.unknown()).optional()

// ── Event schemas ─────────────────────────────────────────────────────────────

const turnStartedEvent = z.object({
  seq: z.number(),
  type: z.literal('turn.started'),
  payload: z.object({
    trace_id: z.string(),
    conversation_id: z.string().nullable(),
    topology: z.enum(['bounded', 'iterative']),
  }),
  metadata: metadataSchema,
})

const phaseStartedEvent = z.object({
  seq: z.number(),
  type: z.literal('phase.started'),
  payload: z.object({
    phase: z.union([z.literal(1), z.literal(2)]),
    sub_agents: z.array(
      z.object({
        domain: z.string(),
        name: z.string().optional(),
      }),
    ),
  }),
  metadata: metadataSchema,
})

const iterationStartedEvent = z.object({
  seq: z.number(),
  type: z.literal('iteration.started'),
  payload: z.object({
    n: z.number(),
    sub_agent_domain: z.string(),
    selection_reason: z.string(),
  }),
  metadata: metadataSchema,
})

const iterationValidatedEvent = z.object({
  seq: z.number(),
  type: z.literal('iteration.validated'),
  payload: z.object({
    n: z.number(),
    passed: z.boolean(),
    scorer_results: z.array(scorerResultSchema),
    max_iterations_reached: z.boolean(),
  }),
  metadata: metadataSchema,
})

const iterationEndedEvent = z.object({
  seq: z.number(),
  type: z.literal('iteration.ended'),
  payload: z.object({
    n: z.number(),
    is_complete: z.boolean(),
    usage: usageSnapshotSchema,
  }),
  metadata: metadataSchema,
})

const progressEvent = z.object({
  seq: z.number(),
  type: z.literal('progress'),
  payload: z.object({
    message: z.string(),
    cause: z.enum(['vendor_retry', 'fallback', 'long_tool']).optional(),
  }),
  metadata: metadataSchema,
})

const refusalStartedEvent = z.object({
  seq: z.number(),
  type: z.literal('refusal.started'),
  payload: z.object({
    reason: refusalReasonSchema,
    processor_id: z.string().optional(),
    retry_allowed: z.boolean(),
  }),
  metadata: metadataSchema,
})

const answerShapeDeclaredEvent = z.object({
  seq: z.number(),
  type: z.literal('answer.shape_declared'),
  payload: z.object({
    shape: z.string(),
    skeleton: z.unknown().optional(),
  }),
  metadata: metadataSchema,
})

const answerTokenEvent = z.object({
  seq: z.number(),
  type: z.literal('answer.token'),
  payload: z.object({
    text: z.string(),
  }),
  metadata: metadataSchema,
})

const answerCompleteEvent = z.object({
  seq: z.number(),
  type: z.literal('answer.complete'),
  payload: z.object({
    shape: z.string(),
    content: z.unknown(),
    citations: z.array(z.unknown()),
  }),
  metadata: metadataSchema,
})

const draftProposedEvent = z.object({
  seq: z.number(),
  type: z.literal('draft.proposed'),
  payload: z.object({
    action_id: z.string(),
    summary: z.string(),
    tier: z.enum(['low', 'high']),
    requires_approval: z.boolean(),
    provenance: draftProvenanceSchema,
  }),
  metadata: metadataSchema,
})

const writePreviewEvent = z.object({
  seq: z.number(),
  type: z.literal('write.preview'),
  payload: z.object({
    tool_name: z.string(),
    args_hash: z.string(),
    bypassable: z.boolean(),
    taint_state: z.boolean(),
    summary: z.string(),
  }),
  metadata: metadataSchema,
})

const writeConfirmEvent = z.object({
  seq: z.number(),
  type: z.literal('write.confirm'),
  payload: z.object({
    tool_name: z.string(),
    idempotency_key: z.string(),
    confirmed_at: z.string(),
    mode: z.enum(['default', 'bypass']),
  }),
  metadata: metadataSchema,
})

const turnEndedEvent = z.object({
  seq: z.number(),
  type: z.literal('turn.ended'),
  payload: z.object({
    reason: turnEndReasonSchema,
    usage: usageSnapshotSchema,
    cancelled_by: z.string().optional(),
  }),
  metadata: metadataSchema,
})

export const sseEventSchema = z.discriminatedUnion('type', [
  turnStartedEvent,
  phaseStartedEvent,
  iterationStartedEvent,
  iterationValidatedEvent,
  iterationEndedEvent,
  progressEvent,
  refusalStartedEvent,
  answerShapeDeclaredEvent,
  answerTokenEvent,
  answerCompleteEvent,
  draftProposedEvent,
  writePreviewEvent,
  writeConfirmEvent,
  turnEndedEvent,
])

export type SseEvent = z.infer<typeof sseEventSchema>
export type UsageSnapshot = z.infer<typeof usageSnapshotSchema>
export type RefusalReason = z.infer<typeof refusalReasonSchema>
export type TurnEndReason = z.infer<typeof turnEndReasonSchema>
export type CancellationReason = z.infer<typeof cancellationReasonSchema>
export type ScorerResult = z.infer<typeof scorerResultSchema>
export type DraftProvenance = z.infer<typeof draftProvenanceSchema>

export type DraftPayload = z.infer<typeof draftProposedEvent>['payload']
export type WritePreviewPayload = z.infer<typeof writePreviewEvent>['payload']
export type WriteConfirmPayload = z.infer<typeof writeConfirmEvent>['payload']
