// ─── Local types (structural match for @future/agent SseEvent — no import) ────

export const EVENT_SCHEMA_VERSION = '1.0.0'

type TurnEndReason =
  | 'completed'
  | 'cancelled'
  | 'timeout'
  | 'refused'
  | 'error'
  | 'budget'
  | 'provider_outage'
  | 'quality_canary'

export interface UsageSnapshot {
  input_tokens: number
  output_tokens: number
  input_cached_read: number
  input_cached_write: number
  output_reasoning: number
}

// Minimal local event type — payload is open (unknown) to keep this file self-contained
type SseEventInput = {
  type: string
  payload: unknown
  metadata?: Record<string, unknown>
}

type SseEventWithSeq = SseEventInput & { seq: number }

// ─── State machine ────────────────────────────────────────────────────────────

type StreamState =
  | 'turn-not-started'
  | 'turn-started-no-content'
  | 'phase-active'
  | 'iteration-pending-validation'
  | 'iteration-validated'
  | 'refusal-sent'
  | 'shape-declared'
  | 'tokens-streaming'
  | 'answer-complete'
  | 'draft-phase'
  | 'turn-ended'
  | 'stream-errored'

const TERMINAL_STATES = new Set<StreamState>(['turn-ended', 'stream-errored'])

// Non-terminal states where `progress` is allowed (stays in same state)
const PROGRESS_ALLOWED = new Set<StreamState>([
  'turn-not-started',
  'turn-started-no-content',
  'phase-active',
  'iteration-pending-validation',
  'iteration-validated',
  'refusal-sent',
  'shape-declared',
  'tokens-streaming',
  'answer-complete',
  'draft-phase',
])

// States from which turn.ended is valid
const TURN_ENDED_ALLOWED = new Set<StreamState>([
  'turn-not-started',
  'turn-started-no-content',
  'phase-active',
  'refusal-sent',
  'answer-complete',
  'draft-phase',
])

function nextState(current: StreamState, eventType: string): StreamState {
  if (TERMINAL_STATES.has(current)) {
    throw new Error(`Stream is terminal (state=${current}); cannot emit ${eventType}`)
  }

  if (eventType === 'progress') {
    if (!PROGRESS_ALLOWED.has(current)) {
      throw new Error(`Invalid transition: progress from ${current}`)
    }
    return current
  }

  if (eventType === 'turn.ended') {
    if (!TURN_ENDED_ALLOWED.has(current)) {
      throw new Error(`Invalid transition: turn.ended from ${current}`)
    }
    return 'turn-ended'
  }

  switch (eventType) {
    case 'turn.started':
      if (current !== 'turn-not-started') {
        throw new Error(`Invalid transition: turn.started from ${current}`)
      }
      return 'turn-started-no-content'

    case 'phase.started':
      if (current !== 'turn-started-no-content') {
        throw new Error(`Invalid transition: phase.started from ${current}`)
      }
      return 'phase-active'

    case 'iteration.started':
      if (current !== 'phase-active') {
        throw new Error(`Invalid transition: iteration.started from ${current}`)
      }
      return 'iteration-pending-validation'

    case 'iteration.validated':
      if (current !== 'iteration-pending-validation') {
        throw new Error(`Invalid transition: iteration.validated from ${current}`)
      }
      return 'iteration-validated'

    case 'iteration.ended':
      if (current !== 'iteration-validated') {
        throw new Error(`Invalid transition: iteration.ended from ${current}`)
      }
      return 'phase-active'

    case 'refusal.started':
      if (current !== 'phase-active') {
        throw new Error(`Invalid transition: refusal.started from ${current}`)
      }
      return 'refusal-sent'

    case 'answer.shape_declared':
      if (current !== 'phase-active') {
        throw new Error(`Invalid transition: answer.shape_declared from ${current}`)
      }
      return 'shape-declared'

    case 'answer.token':
      if (current !== 'shape-declared' && current !== 'tokens-streaming') {
        throw new Error(`Invalid transition: answer.token from ${current}`)
      }
      return 'tokens-streaming'

    case 'answer.complete':
      if (current !== 'phase-active' && current !== 'tokens-streaming') {
        throw new Error(`Invalid transition: answer.complete from ${current}`)
      }
      return 'answer-complete'

    case 'draft.proposed':
      if (current !== 'answer-complete' && current !== 'draft-phase') {
        throw new Error(`Invalid transition: draft.proposed from ${current}`)
      }
      return 'draft-phase'

    default:
      throw new Error(`Unknown event type: ${eventType} (state=${current})`)
  }
}

// ─── StreamEmitter interface ──────────────────────────────────────────────────

export interface StreamEmitter {
  emit(event: SseEventInput): void
  close(reason: TurnEndReason, usage: UsageSnapshot): void
  error(cause: string, usage?: UsageSnapshot): void
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStreamGateway(writeFn: (raw: string) => void): StreamEmitter {
  let state: StreamState = 'turn-not-started'
  let seq = 0

  function write(event: SseEventWithSeq): void {
    writeFn(JSON.stringify(event))
  }

  return {
    emit(event: SseEventInput): void {
      let next: StreamState
      try {
        next = nextState(state, event.type)
      } catch (err) {
        state = 'stream-errored'
        throw err
      }
      seq += 1
      write({ ...event, seq })
      state = next
    },

    close(reason: TurnEndReason, usage: UsageSnapshot): void {
      // close() forces turn.ended from whatever the current (non-terminal) state is
      if (TERMINAL_STATES.has(state)) {
        throw new Error(`Stream is already terminal (state=${state}); cannot close`)
      }
      seq += 1
      write({ type: 'turn.ended', payload: { reason, usage }, seq })
      state = 'turn-ended'
    },

    error(cause: string, usage?: UsageSnapshot): void {
      if (TERMINAL_STATES.has(state)) {
        // Already terminal — first terminal wins, do not corrupt state
        return
      }
      const effectiveUsage: UsageSnapshot = usage ?? {
        input_tokens: 0,
        output_tokens: 0,
        input_cached_read: 0,
        input_cached_write: 0,
        output_reasoning: 0,
      }
      seq += 1
      write({
        type: 'turn.ended',
        payload: { reason: 'error' satisfies TurnEndReason, usage: effectiveUsage, cause },
        seq,
      })
      state = 'stream-errored'
    },
  }
}
