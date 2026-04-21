import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { defineSubAgent } from './sub-agent-factory'

// ─── Shared minimal valid config ───────────────────────────────────────────────

const INPUT_SCHEMA = z.object({ query: z.string() })
const OUTPUT_SCHEMA = z.object({ answer: z.string() })

function validConfig() {
  return {
    key: 'planner.read-only',
    domain: 'planner',
    description: 'Read-only planner sub-agent',
    whenToUse: 'When the user asks about their tasks',
    promptTemplate: {
      body: 'You are a planner assistant. {{query}}',
      variables: z.object({ query: z.string() }),
    },
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
    toolScope: ['planner:task:read'] as const,
    budgets: {
      maxIterations: 4 as const,
      wallclockMs: 30_000,
      costUsd: 0.05,
    },
    memoryScope: {
      reads: ['L1', 'L2'] as const,
      writes: ['L1'] as const,
    },
    model: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
    source: 'code' as const,
  }
}

// ─── Happy path ────────────────────────────────────────────────────────────────

describe('defineSubAgent', () => {
  it('valid config → returns frozen ValidatedSubAgentConfig with all fields preserved', () => {
    const cfg = defineSubAgent(validConfig())

    expect(cfg.key).toBe('planner.read-only')
    expect(cfg.domain).toBe('planner')
    expect(cfg.description).toBe('Read-only planner sub-agent')
    expect(cfg.whenToUse).toBe('When the user asks about their tasks')
    expect(cfg.source).toBe('code')
    expect(cfg.budgets.maxIterations).toBe(4)
    expect(cfg.budgets.wallclockMs).toBe(30_000)
    expect(cfg.budgets.costUsd).toBe(0.05)
    expect(cfg.toolScope).toEqual(['planner:task:read'])
    expect(cfg.memoryScope.reads).toEqual(['L1', 'L2'])
    expect(cfg.memoryScope.writes).toEqual(['L1'])
    // The returned object is frozen
    expect(Object.isFrozen(cfg)).toBe(true)
  })

  // ─── Budget validation errors ────────────────────────────────────────────────

  it('budgets.maxIterations: 3 → throws RangeError', () => {
    const input = { ...validConfig(), budgets: { ...validConfig().budgets, maxIterations: 3 } }
    expect(() => defineSubAgent(input)).toThrow(RangeError)
    expect(() => defineSubAgent(input)).toThrow(/maxIterations must be 4 or 5/)
  })

  it('budgets.maxIterations: 6 → throws RangeError', () => {
    const input = { ...validConfig(), budgets: { ...validConfig().budgets, maxIterations: 6 } }
    expect(() => defineSubAgent(input)).toThrow(RangeError)
    expect(() => defineSubAgent(input)).toThrow(/maxIterations must be 4 or 5/)
  })

  it('budgets.wallclockMs: 0 → throws RangeError', () => {
    const input = { ...validConfig(), budgets: { ...validConfig().budgets, wallclockMs: 0 } }
    expect(() => defineSubAgent(input)).toThrow(RangeError)
    expect(() => defineSubAgent(input)).toThrow(/wallclockMs must be > 0/)
  })

  it('budgets.costUsd: 0 → throws RangeError', () => {
    const input = { ...validConfig(), budgets: { ...validConfig().budgets, costUsd: 0 } }
    expect(() => defineSubAgent(input)).toThrow(RangeError)
    expect(() => defineSubAgent(input)).toThrow(/costUsd must be > 0/)
  })

  // ─── Key validation errors ─────────────────────────────────────────────────

  it('key: "invalid_key" (underscore) → throws RangeError', () => {
    const input = { ...validConfig(), key: 'invalid_key' }
    expect(() => defineSubAgent(input)).toThrow(RangeError)
    expect(() => defineSubAgent(input)).toThrow(/domain-dot-name format/)
  })

  it('key: "no-domain" (missing dot) → throws RangeError', () => {
    const input = { ...validConfig(), key: 'no-domain' }
    expect(() => defineSubAgent(input)).toThrow(RangeError)
    expect(() => defineSubAgent(input)).toThrow(/domain-dot-name format/)
  })

  // ─── Deep-freeze verification ─────────────────────────────────────────────

  it('returned config toolScope array is frozen', () => {
    const cfg = defineSubAgent(validConfig())
    expect(Object.isFrozen(cfg.toolScope)).toBe(true)
  })

  it('returned config memoryScope.reads array is frozen', () => {
    const cfg = defineSubAgent(validConfig())
    expect(Object.isFrozen(cfg.memoryScope.reads)).toBe(true)
  })

  it('returned config memoryScope.writes array is frozen', () => {
    const cfg = defineSubAgent(validConfig())
    expect(Object.isFrozen(cfg.memoryScope.writes)).toBe(true)
  })

  it('returned config coreTools array is frozen when provided', () => {
    const input = { ...validConfig(), coreTools: ['tool.ping'] as const }
    const cfg = defineSubAgent(input)
    expect(Object.isFrozen(cfg.coreTools)).toBe(true)
  })

  it('mutating frozen toolScope throws TypeError in strict mode', () => {
    const cfg = defineSubAgent(validConfig())
    expect(() => {
      // TypeScript won't allow this directly — cast to bypass type guard
      ;(cfg.toolScope as string[]).push('injected')
    }).toThrow(TypeError)
  })

  // ─── DynamicArgument ─────────────────────────────────────────────────────────

  it('model is a function (DynamicArgument) → preserved as-is without evaluation', () => {
    const resolver = (ctx: { tenantId: string }) => ({
      provider: 'openai' as const,
      model: ctx.tenantId === 'enterprise' ? 'gpt-5.4' : 'gpt-5.4-nano',
    })
    const input = { ...validConfig(), model: resolver }
    const cfg = defineSubAgent(input)
    expect(cfg.model).toBe(resolver)
    // Verify the function is NOT eagerly evaluated
    expect(typeof cfg.model).toBe('function')
  })

  // ─── Optional fields ──────────────────────────────────────────────────────

  it('toolRetrieval is preserved when provided', () => {
    const input = {
      ...validConfig(),
      toolRetrieval: { enabled: true, topK: 5 },
    }
    const cfg = defineSubAgent(input)
    expect(cfg.toolRetrieval).toEqual({ enabled: true, topK: 5 })
    expect(Object.isFrozen(cfg.toolRetrieval)).toBe(true)
  })

  it('maxIterations: 5 is valid', () => {
    const input = { ...validConfig(), budgets: { ...validConfig().budgets, maxIterations: 5 } }
    const cfg = defineSubAgent(input)
    expect(cfg.budgets.maxIterations).toBe(5)
  })
})
