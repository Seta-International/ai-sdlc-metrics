import * as z from 'zod'

const answerDeltaEvent = z.object({
  type: z.literal('answer.delta'),
  text: z.string(),
})

const answerCompleteEvent = z.object({
  type: z.literal('answer.complete'),
})

const answerShapeDeclaredEvent = z.object({
  type: z.literal('answer.shape_declared'),
  shape: z.string(),
})

const phaseStartedEvent = z.object({
  type: z.literal('phase.started'),
  phase: z.union([z.literal(1), z.literal(2)]),
  subAgents: z.array(z.string()),
})

const refusalEvent = z.object({
  type: z.literal('refusal'),
  reason: z.string(),
})

const draftProposedEvent = z.object({
  type: z.literal('draft.proposed'),
  draftId: z.string(),
  commandType: z.string(),
  payload: z.unknown(),
})

const turnEndedEvent = z.object({
  type: z.literal('turn.ended'),
  reason: z.enum(['completed', 'refused', 'budget', 'moderation', 'cancelled', 'ceiling']),
})

export const sseEventSchema = z.discriminatedUnion('type', [
  answerDeltaEvent,
  answerCompleteEvent,
  answerShapeDeclaredEvent,
  phaseStartedEvent,
  refusalEvent,
  draftProposedEvent,
  turnEndedEvent,
])

export type SseEvent = z.infer<typeof sseEventSchema>
export type TurnEndReason = z.infer<typeof turnEndedEvent>['reason']

export type DraftPayload = {
  draftId: string
  commandType: string
  payload: unknown
}
