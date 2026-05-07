import { describe, it, expect } from 'vitest'
import { sseEventSchema } from './sse-event-schema'

const minUsage = {
  input_tokens: 10,
  output_tokens: 5,
  input_cached_read: 0,
  input_cached_write: 0,
  output_reasoning: 0,
}

describe('sseEventSchema', () => {
  // ── turn.started ──────────────────────────────────────────────────────────
  it('parses turn.started (bounded)', () => {
    const result = sseEventSchema.parse({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'tr-1', conversation_id: 'conv-1', topology: 'bounded' },
    })
    expect(result.type).toBe('turn.started')
    expect(result.seq).toBe(1)
    expect(result.payload.topology).toBe('bounded')
  })

  it('parses turn.started with null conversation_id', () => {
    const result = sseEventSchema.parse({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'tr-1', conversation_id: null, topology: 'iterative' },
    })
    expect(result.payload.conversation_id).toBeNull()
  })

  it('parses turn.started with optional metadata', () => {
    const result = sseEventSchema.parse({
      seq: 1,
      type: 'turn.started',
      payload: { trace_id: 'tr-1', conversation_id: null, topology: 'bounded' },
      metadata: { region: 'ap-southeast-1' },
    })
    expect(result.metadata).toEqual({ region: 'ap-southeast-1' })
  })

  // ── phase.started ─────────────────────────────────────────────────────────
  it('parses phase.started with sub_agents array', () => {
    const result = sseEventSchema.parse({
      seq: 2,
      type: 'phase.started',
      payload: {
        phase: 1,
        sub_agents: [{ domain: 'planner' }, { domain: 'people', name: 'HR Agent' }],
      },
    })
    expect(result.type).toBe('phase.started')
    expect(result.payload.phase).toBe(1)
    expect(result.payload.sub_agents).toHaveLength(2)
    expect(result.payload.sub_agents[0].domain).toBe('planner')
    expect(result.payload.sub_agents[1].name).toBe('HR Agent')
  })

  it('parses phase.started with phase 2', () => {
    const result = sseEventSchema.parse({
      seq: 2,
      type: 'phase.started',
      payload: { phase: 2, sub_agents: [] },
    })
    expect(result.payload.phase).toBe(2)
  })

  it('rejects phase.started with phase 3', () => {
    expect(() =>
      sseEventSchema.parse({
        seq: 2,
        type: 'phase.started',
        payload: { phase: 3, sub_agents: [] },
      }),
    ).toThrow()
  })

  // ── iteration.started ─────────────────────────────────────────────────────
  it('parses iteration.started', () => {
    const result = sseEventSchema.parse({
      seq: 3,
      type: 'iteration.started',
      payload: { n: 1, sub_agent_domain: 'planner', selection_reason: 'first' },
    })
    expect(result.type).toBe('iteration.started')
    expect(result.payload.n).toBe(1)
    expect(result.payload.sub_agent_domain).toBe('planner')
    expect(result.payload.selection_reason).toBe('first')
  })

  // ── iteration.validated ───────────────────────────────────────────────────
  it('parses iteration.validated', () => {
    const result = sseEventSchema.parse({
      seq: 4,
      type: 'iteration.validated',
      payload: {
        n: 1,
        passed: true,
        scorer_results: [{ scorer: 'relevance', passed: true, score: 0.9 }],
        max_iterations_reached: false,
      },
    })
    expect(result.type).toBe('iteration.validated')
    expect(result.payload.scorer_results[0].scorer).toBe('relevance')
    expect(result.payload.scorer_results[0].score).toBe(0.9)
  })

  it('parses iteration.validated with scorer_result without score', () => {
    const result = sseEventSchema.parse({
      seq: 4,
      type: 'iteration.validated',
      payload: {
        n: 2,
        passed: false,
        scorer_results: [{ scorer: 'safety', passed: false }],
        max_iterations_reached: true,
      },
    })
    expect(result.payload.scorer_results[0].score).toBeUndefined()
  })

  // ── iteration.ended ───────────────────────────────────────────────────────
  it('parses iteration.ended', () => {
    const result = sseEventSchema.parse({
      seq: 5,
      type: 'iteration.ended',
      payload: { n: 1, is_complete: false, usage: minUsage },
    })
    expect(result.type).toBe('iteration.ended')
    expect(result.payload.is_complete).toBe(false)
    expect(result.payload.usage.input_tokens).toBe(10)
  })

  // ── progress ──────────────────────────────────────────────────────────────
  it('parses progress without cause', () => {
    const result = sseEventSchema.parse({
      seq: 6,
      type: 'progress',
      payload: { message: 'Searching documents...' },
    })
    expect(result.type).toBe('progress')
    expect(result.payload.message).toBe('Searching documents...')
    expect(result.payload.cause).toBeUndefined()
  })

  it('parses progress with cause vendor_retry', () => {
    const result = sseEventSchema.parse({
      seq: 6,
      type: 'progress',
      payload: { message: 'Retrying...', cause: 'vendor_retry' },
    })
    expect(result.payload.cause).toBe('vendor_retry')
  })

  it('rejects progress with invalid cause', () => {
    expect(() =>
      sseEventSchema.parse({
        seq: 6,
        type: 'progress',
        payload: { message: 'x', cause: 'unknown_cause' },
      }),
    ).toThrow()
  })

  // ── refusal.started ───────────────────────────────────────────────────────
  it('parses refusal.started', () => {
    const result = sseEventSchema.parse({
      seq: 7,
      type: 'refusal.started',
      payload: { reason: 'daily_budget', retry_allowed: false },
    })
    expect(result.type).toBe('refusal.started')
    expect(result.payload.reason).toBe('daily_budget')
    expect(result.payload.retry_allowed).toBe(false)
  })

  it('parses refusal.started with all valid reasons', () => {
    const reasons = [
      'daily_budget',
      'insufficient_minimum',
      'rate_limit',
      'disambiguation',
      'model_policy',
      'internal',
    ] as const
    for (const reason of reasons) {
      const result = sseEventSchema.parse({
        seq: 7,
        type: 'refusal.started',
        payload: { reason, retry_allowed: true },
      })
      expect(result.payload.reason).toBe(reason)
    }
  })

  it('parses refusal.started with optional processor_id', () => {
    const result = sseEventSchema.parse({
      seq: 7,
      type: 'refusal.started',
      payload: { reason: 'rate_limit', processor_id: 'proc-42', retry_allowed: true },
    })
    expect(result.payload.processor_id).toBe('proc-42')
  })

  it('rejects refusal.started with unknown reason', () => {
    expect(() =>
      sseEventSchema.parse({
        seq: 7,
        type: 'refusal.started',
        payload: { reason: 'no_permission', retry_allowed: false },
      }),
    ).toThrow()
  })

  // ── answer.shape_declared ─────────────────────────────────────────────────
  it('parses answer.shape_declared', () => {
    const result = sseEventSchema.parse({
      seq: 8,
      type: 'answer.shape_declared',
      payload: { shape: 'table', skeleton: { columns: ['Name', 'Date'] } },
    })
    expect(result.type).toBe('answer.shape_declared')
    expect(result.payload.shape).toBe('table')
    expect(result.payload.skeleton).toEqual({ columns: ['Name', 'Date'] })
  })

  it('parses answer.shape_declared without skeleton', () => {
    const result = sseEventSchema.parse({
      seq: 8,
      type: 'answer.shape_declared',
      payload: { shape: 'narrative' },
    })
    expect(result.payload.skeleton).toBeUndefined()
  })

  // ── answer.token ──────────────────────────────────────────────────────────
  it('parses answer.token', () => {
    const result = sseEventSchema.parse({
      seq: 9,
      type: 'answer.token',
      payload: { text: 'Hello, world!' },
    })
    expect(result.type).toBe('answer.token')
    expect(result.payload.text).toBe('Hello, world!')
  })

  // ── answer.complete ───────────────────────────────────────────────────────
  it('parses answer.complete with shape and citations', () => {
    const result = sseEventSchema.parse({
      seq: 10,
      type: 'answer.complete',
      payload: { shape: 'narrative', content: 'Full text...', citations: [] },
    })
    expect(result.type).toBe('answer.complete')
    expect(result.payload.shape).toBe('narrative')
    expect(result.payload.citations).toEqual([])
  })

  // ── draft.proposed ────────────────────────────────────────────────────────
  it('parses draft.proposed', () => {
    const result = sseEventSchema.parse({
      seq: 11,
      type: 'draft.proposed',
      payload: {
        action_id: 'act-1',
        summary: 'Create a new task',
        tier: 'low',
        requires_approval: false,
        provenance: { sub_agent_domain: 'planner', trace_id: 'tr-1' },
      },
    })
    expect(result.type).toBe('draft.proposed')
    expect(result.payload.action_id).toBe('act-1')
    expect(result.payload.tier).toBe('low')
    expect(result.payload.provenance.sub_agent_domain).toBe('planner')
  })

  it('parses draft.proposed with tier high', () => {
    const result = sseEventSchema.parse({
      seq: 11,
      type: 'draft.proposed',
      payload: {
        action_id: 'act-2',
        summary: 'Delete employee record',
        tier: 'high',
        requires_approval: true,
        provenance: { sub_agent_domain: 'people', trace_id: 'tr-2' },
      },
    })
    expect(result.payload.tier).toBe('high')
    expect(result.payload.requires_approval).toBe(true)
  })

  it('rejects draft.proposed with invalid tier', () => {
    expect(() =>
      sseEventSchema.parse({
        seq: 11,
        type: 'draft.proposed',
        payload: {
          action_id: 'act-3',
          summary: 'x',
          tier: 'medium',
          requires_approval: false,
          provenance: { sub_agent_domain: 'x', trace_id: 'x' },
        },
      }),
    ).toThrow()
  })

  // ── turn.ended ────────────────────────────────────────────────────────────
  it('parses turn.ended with each valid reason', () => {
    const reasons = [
      'completed',
      'cancelled',
      'timeout',
      'refused',
      'error',
      'budget',
      'provider_outage',
      'quality_canary',
    ] as const
    for (const reason of reasons) {
      const result = sseEventSchema.parse({
        seq: 12,
        type: 'turn.ended',
        payload: { reason, usage: minUsage },
      })
      expect(result.payload.reason).toBe(reason)
    }
  })

  it('parses turn.ended with optional cancelled_by', () => {
    const result = sseEventSchema.parse({
      seq: 12,
      type: 'turn.ended',
      payload: { reason: 'cancelled', usage: minUsage, cancelled_by: 'user-42' },
    })
    expect(result.payload.cancelled_by).toBe('user-42')
  })

  it('rejects turn.ended with unknown reason', () => {
    expect(() =>
      sseEventSchema.parse({
        seq: 12,
        type: 'turn.ended',
        payload: { reason: 'moderation', usage: minUsage },
      }),
    ).toThrow()
  })

  it('rejects turn.ended with legacy reason ceiling', () => {
    expect(() =>
      sseEventSchema.parse({
        seq: 12,
        type: 'turn.ended',
        payload: { reason: 'ceiling', usage: minUsage },
      }),
    ).toThrow()
  })

  // ── write.preview ─────────────────────────────────────────────────────────
  describe('write.preview event', () => {
    it('parses a valid write.preview event', () => {
      const raw = {
        seq: 10,
        type: 'write.preview',
        payload: {
          tool_name: 'planner.create-task',
          args_hash: 'abc123',
          bypassable: true,
          taint_state: false,
          summary: 'Create task "Fix login bug" in Project Alpha',
        },
      }
      const result = sseEventSchema.safeParse(raw)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('write.preview')
        expect(result.data.payload.tool_name).toBe('planner.create-task')
      }
    })

    it('rejects write.preview missing required fields', () => {
      const raw = { seq: 10, type: 'write.preview', payload: { tool_name: 'x' } }
      expect(sseEventSchema.safeParse(raw).success).toBe(false)
    })
  })

  // ── write.confirm ─────────────────────────────────────────────────────────
  describe('write.confirm event', () => {
    it('parses a valid write.confirm event', () => {
      const raw = {
        seq: 11,
        type: 'write.confirm',
        payload: {
          tool_name: 'planner.create-task',
          idempotency_key: 'sha256abc',
          confirmed_at: '2026-05-06T12:00:00.000Z',
          mode: 'default',
        },
      }
      const result = sseEventSchema.safeParse(raw)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('write.confirm')
        expect(result.data.payload.mode).toBe('default')
      }
    })
  })

  // ── general ───────────────────────────────────────────────────────────────
  it('rejects unknown event type', () => {
    expect(() => sseEventSchema.parse({ seq: 99, type: 'unknown.event', payload: {} })).toThrow()
  })

  it('rejects event missing seq', () => {
    expect(() => sseEventSchema.parse({ type: 'answer.token', payload: { text: 'hi' } })).toThrow()
  })

  it('rejects legacy answer.delta event type', () => {
    expect(() => sseEventSchema.parse({ seq: 1, type: 'answer.delta', text: 'hello' })).toThrow()
  })

  it('rejects legacy refusal event type', () => {
    expect(() => sseEventSchema.parse({ seq: 1, type: 'refusal', reason: 'x' })).toThrow()
  })
})
