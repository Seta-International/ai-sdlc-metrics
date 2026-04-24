/**
 * stream-gateway.spec.ts — Plan 06 Task 2 — StreamGateway state machine + StreamEmitter
 *
 * Covers:
 *  1.  turn.started transitions from turn-not-started → turn-started-no-content, seq=1
 *  2.  seq increments on each emit
 *  3.  phase.started transitions from turn-started-no-content → phase-active
 *  4.  iteration.started transitions from phase-active → iteration-pending-validation
 *  5.  iteration.validated transitions from iteration-pending-validation → iteration-validated
 *  6.  iteration.ended transitions from iteration-validated → phase-active (loop back)
 *  7.  progress stays in same non-terminal state
 *  8.  refusal.started transitions from phase-active → refusal-sent
 *  9.  answer.shape_declared transitions from phase-active → shape-declared
 * 10.  answer.token transitions from shape-declared → tokens-streaming (then stays)
 * 11.  answer.complete transitions from tokens-streaming → answer-complete
 * 12.  answer.complete from phase-active (narrative, skips shape) → answer-complete
 * 13.  draft.proposed transitions from answer-complete → draft-phase; repeats in draft-phase
 * 14.  turn.ended from refusal-sent → turn-ended
 * 15.  turn.ended from answer-complete → turn-ended
 * 16.  turn.ended from draft-phase → turn-ended
 * 17.  close() emits turn.ended with usage, transitions to turn-ended
 * 18.  error() transitions to stream-errored
 * 19.  terminal state turn-ended rejects further events
 * 20.  terminal state stream-errored rejects further events
 * 21.  invalid transition throws and does not call writeFn
 * 22.  turn.ended from turn-not-started (edge case)
 * 23.  turn.ended from turn-started-no-content (early cancel)
 * 24.  turn.ended from phase-active (abort mid-phase)
 * 25.  progress from every valid non-terminal state
 * 26.  emitted JSON contains seq, type, payload
 * 27.  EVENT_SCHEMA_VERSION is '1.0.0'
 */

import { describe, it, expect, vi } from 'vitest'
import { createStreamGateway, EVENT_SCHEMA_VERSION } from './stream-gateway'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWriteFn() {
  const calls: string[] = []
  const writeFn = vi.fn((raw: string) => calls.push(raw))
  return { writeFn, calls }
}

const USAGE = {
  input_tokens: 10,
  output_tokens: 5,
  input_cached_read: 0,
  input_cached_write: 0,
  output_reasoning: 0,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createStreamGateway', () => {
  it('1. turn.started transitions to turn-started-no-content and seq=1', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 'tr1', conversation_id: null, topology: 'bounded' },
    })

    expect(writeFn).toHaveBeenCalledTimes(1)
    const event = JSON.parse(calls[0])
    expect(event.seq).toBe(1)
    expect(event.type).toBe('turn.started')
  })

  it('2. seq increments on each emit', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 'tr1', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({
      type: 'phase.started',
      payload: { phase: 1, sub_agents: [] },
    })

    expect(JSON.parse(calls[0]).seq).toBe(1)
    expect(JSON.parse(calls[1]).seq).toBe(2)
  })

  it('3. phase.started transitions from turn-started-no-content → phase-active', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 'tr1', conversation_id: null, topology: 'bounded' },
    })
    expect(() =>
      emitter.emit({
        type: 'phase.started',
        payload: { phase: 1, sub_agents: [] },
      }),
    ).not.toThrow()
    expect(writeFn).toHaveBeenCalledTimes(2)
  })

  it('4. iteration.started transitions from phase-active → iteration-pending-validation', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() =>
      emitter.emit({
        type: 'iteration.started',
        payload: { n: 1, sub_agent_domain: 'hiring', selection_reason: 'best' },
      }),
    ).not.toThrow()
  })

  it('5. iteration.validated transitions from iteration-pending-validation → iteration-validated', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'iteration.started',
      payload: { n: 1, sub_agent_domain: 'd', selection_reason: 'r' },
    })

    expect(() =>
      emitter.emit({
        type: 'iteration.validated',
        payload: { n: 1, passed: true, scorer_results: [], max_iterations_reached: false },
      }),
    ).not.toThrow()
  })

  it('6. iteration.ended transitions from iteration-validated → phase-active (loop back)', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'iteration.started',
      payload: { n: 1, sub_agent_domain: 'd', selection_reason: 'r' },
    })
    emitter.emit({
      type: 'iteration.validated',
      payload: { n: 1, passed: true, scorer_results: [], max_iterations_reached: false },
    })
    emitter.emit({ type: 'iteration.ended', payload: { n: 1, is_complete: false, usage: USAGE } })

    // After loop back to phase-active, can start another iteration
    expect(() =>
      emitter.emit({
        type: 'iteration.started',
        payload: { n: 2, sub_agent_domain: 'd', selection_reason: 'r' },
      }),
    ).not.toThrow()
  })

  it('7. progress stays in the same state (tested from phase-active)', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    // progress in phase-active — should stay phase-active, not throw
    emitter.emit({ type: 'progress', payload: { message: 'still going' } })

    // Can still emit something that requires phase-active as source
    expect(() =>
      emitter.emit({
        type: 'answer.complete',
        payload: { shape: 'narrative', content: 'hello', citations: [] },
      }),
    ).not.toThrow()

    expect(JSON.parse(calls[2]).type).toBe('progress')
  })

  it('8. refusal.started transitions from phase-active → refusal-sent', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() =>
      emitter.emit({
        type: 'refusal.started',
        payload: { reason: 'daily_budget', retry_allowed: false },
      }),
    ).not.toThrow()
  })

  it('9. answer.shape_declared transitions from phase-active → shape-declared', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() =>
      emitter.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } }),
    ).not.toThrow()
  })

  it('10. answer.token transitions from shape-declared → tokens-streaming, then stays', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } })

    expect(() => emitter.emit({ type: 'answer.token', payload: { text: 'Hello' } })).not.toThrow()
    // stays in tokens-streaming
    expect(() => emitter.emit({ type: 'answer.token', payload: { text: ' world' } })).not.toThrow()
  })

  it('11. answer.complete from tokens-streaming → answer-complete', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } })
    emitter.emit({ type: 'answer.token', payload: { text: 'Hello' } })

    expect(() =>
      emitter.emit({
        type: 'answer.complete',
        payload: { shape: 'structured', content: {}, citations: [] },
      }),
    ).not.toThrow()
  })

  it('12. answer.complete from phase-active (narrative, skips shape) → answer-complete', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() =>
      emitter.emit({
        type: 'answer.complete',
        payload: { shape: 'narrative', content: 'text', citations: [] },
      }),
    ).not.toThrow()
  })

  it('13. draft.proposed from answer-complete → draft-phase; repeats in draft-phase', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'answer.complete',
      payload: { shape: 'narrative', content: 'x', citations: [] },
    })

    const draft = {
      type: 'draft.proposed' as const,
      payload: {
        action_id: 'a1',
        summary: 'Hire someone',
        tier: 'low' as const,
        requires_approval: true,
        provenance: { sub_agent_domain: 'hiring', trace_id: 'tr1' },
      },
    }

    expect(() => emitter.emit(draft)).not.toThrow()
    // repeat in draft-phase
    expect(() =>
      emitter.emit({ ...draft, payload: { ...draft.payload, action_id: 'a2' } }),
    ).not.toThrow()
  })

  it('14. turn.ended from refusal-sent → turn-ended', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'refusal.started',
      payload: { reason: 'daily_budget', retry_allowed: false },
    })

    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'refused', usage: USAGE } }),
    ).not.toThrow()
  })

  it('15. turn.ended from answer-complete → turn-ended', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'answer.complete',
      payload: { shape: 'narrative', content: 'x', citations: [] },
    })

    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'completed', usage: USAGE } }),
    ).not.toThrow()
  })

  it('16. turn.ended from draft-phase → turn-ended', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'answer.complete',
      payload: { shape: 'narrative', content: 'x', citations: [] },
    })
    emitter.emit({
      type: 'draft.proposed',
      payload: {
        action_id: 'a1',
        summary: 's',
        tier: 'low',
        requires_approval: false,
        provenance: { sub_agent_domain: 'hiring', trace_id: 'tr1' },
      },
    })

    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'completed', usage: USAGE } }),
    ).not.toThrow()
  })

  it('17. close() emits turn.ended with usage and transitions to turn-ended', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'answer.complete',
      payload: { shape: 'narrative', content: 'x', citations: [] },
    })

    emitter.close('completed', USAGE)

    const last = JSON.parse(calls[calls.length - 1])
    expect(last.type).toBe('turn.ended')
    expect(last.payload.reason).toBe('completed')
    expect(last.payload.usage).toEqual(USAGE)

    // terminal — further emits throw
    expect(() => emitter.emit({ type: 'progress', payload: { message: 'late' } })).toThrow()
  })

  it('18. error() transitions to stream-errored and subsequent emits throw', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.error('provider crashed')

    expect(() => emitter.emit({ type: 'progress', payload: { message: 'should fail' } })).toThrow()
  })

  it('19. terminal state turn-ended rejects further events', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'turn.ended', payload: { reason: 'cancelled', usage: USAGE } })

    expect(() => emitter.emit({ type: 'progress', payload: { message: 'after end' } })).toThrow()
  })

  it('20. terminal state stream-errored rejects further events', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.error('fatal')

    expect(() =>
      emitter.emit({
        type: 'turn.started',
        payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
      }),
    ).toThrow()
  })

  it('21. invalid transition throws and does not call writeFn', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    // In turn-not-started, only turn.started is valid (for turn.ended edge case aside)
    // phase.started is not valid from turn-not-started
    expect(() =>
      emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } }),
    ).toThrow()
    expect(writeFn).toHaveBeenCalledTimes(0)
  })

  it('22. turn.ended from turn-not-started (edge case) is valid', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'cancelled', usage: USAGE } }),
    ).not.toThrow()
  })

  it('23. turn.ended from turn-started-no-content (early cancel)', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })

    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'cancelled', usage: USAGE } }),
    ).not.toThrow()
  })

  it('24. turn.ended from phase-active (abort mid-phase)', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'cancelled', usage: USAGE } }),
    ).not.toThrow()
  })

  it('25. progress from every valid non-terminal state stays in same state', () => {
    const progressPayload = { type: 'progress' as const, payload: { message: 'tick' } }

    const stateSequences: Array<{
      label: string
      setup: (e: ReturnType<typeof createStreamGateway>) => void
    }> = [
      {
        label: 'turn-started-no-content',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
        },
      },
      {
        label: 'phase-active',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
        },
      },
      {
        label: 'iteration-pending-validation',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
          e.emit({
            type: 'iteration.started',
            payload: { n: 1, sub_agent_domain: 'd', selection_reason: 'r' },
          })
        },
      },
      {
        label: 'iteration-validated',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
          e.emit({
            type: 'iteration.started',
            payload: { n: 1, sub_agent_domain: 'd', selection_reason: 'r' },
          })
          e.emit({
            type: 'iteration.validated',
            payload: { n: 1, passed: true, scorer_results: [], max_iterations_reached: false },
          })
        },
      },
      {
        label: 'shape-declared',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
          e.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } })
        },
      },
      {
        label: 'tokens-streaming',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
          e.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } })
          e.emit({ type: 'answer.token', payload: { text: 'hi' } })
        },
      },
      {
        label: 'answer-complete',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
          e.emit({
            type: 'answer.complete',
            payload: { shape: 'narrative', content: 'x', citations: [] },
          })
        },
      },
      {
        label: 'draft-phase',
        setup(e) {
          e.emit({
            type: 'turn.started',
            payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
          })
          e.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
          e.emit({
            type: 'answer.complete',
            payload: { shape: 'narrative', content: 'x', citations: [] },
          })
          e.emit({
            type: 'draft.proposed',
            payload: {
              action_id: 'a1',
              summary: 's',
              tier: 'low',
              requires_approval: false,
              provenance: { sub_agent_domain: 'd', trace_id: 'tr1' },
            },
          })
        },
      },
    ]

    for (const { label, setup } of stateSequences) {
      const { writeFn } = makeWriteFn()
      const e = createStreamGateway(writeFn)
      setup(e)
      expect(
        () => e.emit(progressPayload),
        `progress should not throw in state: ${label}`,
      ).not.toThrow()
    }
  })

  it('26. emitted JSON contains seq, type, and payload', () => {
    const { calls } = makeWriteFn()
    const emitter = createStreamGateway(vi.fn((raw) => calls.push(raw)))

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 'trace-abc', conversation_id: 'conv-1', topology: 'iterative' },
    })

    const event = JSON.parse(calls[0])
    expect(event).toMatchObject({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'trace-abc', conversation_id: 'conv-1', topology: 'iterative' },
    })
  })

  it('27. EVENT_SCHEMA_VERSION is 1.0.0', () => {
    expect(EVENT_SCHEMA_VERSION).toBe('1.0.0')
  })

  it('28. after an invalid transition throws, state is stream-errored and subsequent emits also throw', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    // phase.started from turn-not-started is invalid — should throw and corrupt state
    expect(() =>
      emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } }),
    ).toThrow()

    // Now state is stream-errored — even a normally valid emit must throw
    expect(() =>
      emitter.emit({
        type: 'turn.started',
        payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
      }),
    ).toThrow()

    // writeFn was never called (state corrupted before write)
    expect(writeFn).not.toHaveBeenCalled()
  })

  it('29. progress allowed from turn-not-started state', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    // Emitter starts in turn-not-started; progress should not throw
    expect(() =>
      emitter.emit({ type: 'progress', payload: { message: 'early tick' } }),
    ).not.toThrow()

    // State remains turn-not-started, so turn.started is still valid
    expect(() =>
      emitter.emit({
        type: 'turn.started',
        payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
      }),
    ).not.toThrow()
  })

  // ─── Invalid transitions ──────────────────────────────────────────────────────

  it('invalid: phase.started from turn-not-started throws', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    expect(() =>
      emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } }),
    ).toThrow()
    expect(writeFn).not.toHaveBeenCalled()
  })

  it('invalid: iteration.started from turn-started-no-content throws', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })

    expect(() =>
      emitter.emit({
        type: 'iteration.started',
        payload: { n: 1, sub_agent_domain: 'd', selection_reason: 'r' },
      }),
    ).toThrow()
  })

  it('invalid: answer.token from phase-active (not yet shape-declared) throws', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() => emitter.emit({ type: 'answer.token', payload: { text: 'hi' } })).toThrow()
  })

  it('invalid: draft.proposed from phase-active (not answer-complete) throws', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })

    expect(() =>
      emitter.emit({
        type: 'draft.proposed',
        payload: {
          action_id: 'a1',
          summary: 's',
          tier: 'low',
          requires_approval: false,
          provenance: { sub_agent_domain: 'd', trace_id: 'tr1' },
        },
      }),
    ).toThrow()
  })

  it('invalid: turn.started called twice throws on second call', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })

    expect(() =>
      emitter.emit({
        type: 'turn.started',
        payload: { trace_id: 't2', conversation_id: null, topology: 'bounded' },
      }),
    ).toThrow()
    // Only first emit reached writeFn
    expect(writeFn).toHaveBeenCalledTimes(1)
  })

  it('close() from a state that is not answer-complete/draft-phase/refusal-sent/etc still emits turn.ended', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    // abort mid-phase via close()
    emitter.close('cancelled', USAGE)

    const last = JSON.parse(calls[calls.length - 1])
    expect(last.type).toBe('turn.ended')
    expect(last.payload.reason).toBe('cancelled')
  })

  it('error() on already-terminal stream (turn-ended) is idempotent — state stays turn-ended', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.close('completed', USAGE)

    const callsBefore = calls.length

    // Late error() must not emit another event or corrupt the terminal state
    emitter.error('late error from upstream')

    // No additional writes
    expect(calls.length).toBe(callsBefore)
    // Stream must still be terminal (turn-ended) — further emit throws
    expect(() => emitter.emit({ type: 'progress', payload: { message: 'after' } })).toThrow()
  })

  it('error() after close() is idempotent — state stays turn-ended', () => {
    const { writeFn, calls } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.close('completed', USAGE)

    const callsBefore = calls.length

    // error() after close must be a no-op
    expect(() => emitter.error('race condition error')).not.toThrow()
    expect(calls.length).toBe(callsBefore)
  })

  it('close() twice throws on second call', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.close('completed', USAGE)

    expect(() => emitter.close('completed', USAGE)).toThrow()
  })

  it('progress allowed from refusal-sent state', () => {
    const { writeFn } = makeWriteFn()
    const emitter = createStreamGateway(writeFn)

    emitter.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter.emit({
      type: 'refusal.started',
      payload: { reason: 'daily_budget', retry_allowed: false },
    })

    // A vendor retry adding ≥500ms silence must be able to emit progress from refusal-sent
    expect(() =>
      emitter.emit({ type: 'progress', payload: { message: 'vendor retry in progress' } }),
    ).not.toThrow()

    // State stays refusal-sent — turn.ended is still valid
    expect(() =>
      emitter.emit({ type: 'turn.ended', payload: { reason: 'refused', usage: USAGE } }),
    ).not.toThrow()
  })

  it('emit turn.ended directly from tokens-streaming throws (use close() instead)', () => {
    // Verify that turn.ended via emit() is rejected from tokens-streaming.
    // close() bypasses the state machine and is the correct escape hatch — test it on a fresh emitter.
    const { writeFn: wf1 } = makeWriteFn()
    const emitter1 = createStreamGateway(wf1)

    emitter1.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter1.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter1.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } })
    emitter1.emit({ type: 'answer.token', payload: { text: 'hello' } })

    // tokens-streaming is not in TURN_ENDED_ALLOWED — must throw (and marks stream-errored)
    expect(() =>
      emitter1.emit({ type: 'turn.ended', payload: { reason: 'completed', usage: USAGE } }),
    ).toThrow()

    // Separate emitter to verify close() works from tokens-streaming
    const { writeFn: wf2 } = makeWriteFn()
    const emitter2 = createStreamGateway(wf2)

    emitter2.emit({
      type: 'turn.started',
      payload: { trace_id: 't', conversation_id: null, topology: 'bounded' },
    })
    emitter2.emit({ type: 'phase.started', payload: { phase: 1, sub_agents: [] } })
    emitter2.emit({ type: 'answer.shape_declared', payload: { shape: 'structured' } })
    emitter2.emit({ type: 'answer.token', payload: { text: 'hello' } })

    // close() bypasses the state-machine guard and is always the correct escape hatch
    expect(() => emitter2.close('completed', USAGE)).not.toThrow()
  })
})
