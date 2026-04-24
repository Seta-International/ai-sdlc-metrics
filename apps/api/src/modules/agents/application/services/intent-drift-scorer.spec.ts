/**
 * intent-drift-scorer.spec.ts — Plan 10 Task 4
 *
 * Unit tests for IntentDriftScorer and checkIntentDrift.
 * Uses the standalone checkIntentDrift pure function to avoid NestJS DI overhead.
 */

import { describe, it, expect, vi } from 'vitest'
import { checkIntentDrift, IntentDriftScorer, TOOL_REGISTRY_TOKEN } from './intent-drift-scorer'
import type { ReplayedTrace } from '../../domain/scorer-types'
import type { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDescriptor(toolName: string, whenNotToUse: string): AgentToolDescriptor {
  return {
    name: toolName,
    procedure: 'query',
    permission: `test:${toolName}:read`,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse: 'Use this tool when you need to retrieve data.',
      whenNotToUse,
      examples: [{ input: 'example input', callArgs: { param: 'value' } }],
    },
  }
}

function makeToolRegistry(descriptors: AgentToolDescriptor[]): ToolRegistry {
  const map = new Map(descriptors.map((d) => [d.name, d]))
  return {
    getDescriptor: vi.fn((name: string) => map.get(name)),
    listAgentTools: vi.fn(() => Array.from(map.values())),
    resolveMenuFor: vi.fn(() => []),
    loadFromRouter: vi.fn(),
  } as unknown as ToolRegistry
}

function makeTrace(
  toolCalls: Array<{ toolName: string; invocationContext: string }>,
): ReplayedTrace {
  return {
    traceId: 'trace-001',
    tenantId: 'tenant-001',
    replayResult: {
      messages: [],
      pinnedVersions: {},
      canonicalizerVersionHash: 'v1',
      missedHashes: undefined as never,
    },
    toolCallsObserved: toolCalls,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('checkIntentDrift', () => {
  it('1. tool called in context matching whenNotToUse → passed: false, reason mentions tool name and context', () => {
    const registry = makeToolRegistry([
      makeDescriptor('planner.task.getBoard', 'bulk export context, reporting context'),
    ])
    const trace = makeTrace([
      { toolName: 'planner.task.getBoard', invocationContext: 'bulk export context' },
    ])

    const result = checkIntentDrift(trace.toolCallsObserved, registry)

    expect(result.passed).toBe(false)
    expect(result.score).toBe(0)
    expect(result.reason).toContain('planner.task.getBoard')
    expect(result.reason).toContain('bulk export context')
  })

  it('2. tool called in context NOT in whenNotToUse → passed: true, score: 1', () => {
    const registry = makeToolRegistry([
      makeDescriptor('planner.task.getBoard', 'reporting context, analytics context'),
    ])
    const trace = makeTrace([
      { toolName: 'planner.task.getBoard', invocationContext: 'daily standup' },
    ])

    const result = checkIntentDrift(trace.toolCallsObserved, registry)

    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)
    expect(result.reason).toBeUndefined()
  })

  it('3. multiple tools, one violates → passed: false', () => {
    const registry = makeToolRegistry([
      makeDescriptor('people.profile.get', 'bulk export, reporting'),
      makeDescriptor('time.attendance.get', 'payroll context'),
    ])
    const trace = makeTrace([
      { toolName: 'people.profile.get', invocationContext: 'user dashboard' },
      { toolName: 'time.attendance.get', invocationContext: 'payroll context' },
    ])

    const result = checkIntentDrift(trace.toolCallsObserved, registry)

    expect(result.passed).toBe(false)
    expect(result.score).toBe(0)
    expect(result.reason).toContain('time.attendance.get')
    expect(result.reason).toContain('payroll context')
  })

  it('4. empty toolCallsObserved → passed: true', () => {
    const registry = makeToolRegistry([])
    const trace = makeTrace([])

    const result = checkIntentDrift(trace.toolCallsObserved, registry)

    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)
  })

  it('5. tool not found in registry → treat as no-violation (skip)', () => {
    const registry = makeToolRegistry([
      // registry only has one tool, but trace calls a different one
      makeDescriptor('known.tool', 'forbidden context'),
    ])
    const trace = makeTrace([
      { toolName: 'unknown.tool.xyz', invocationContext: 'forbidden context' },
    ])

    const result = checkIntentDrift(trace.toolCallsObserved, registry)

    expect(result.passed).toBe(true)
    expect(result.score).toBe(1)
  })
})

describe('IntentDriftScorer', () => {
  it('run() delegates to checkIntentDrift via the injected ToolRegistry', async () => {
    const registry = makeToolRegistry([
      makeDescriptor('finance.invoice.list', 'bulk export context'),
    ])

    const scorer = new IntentDriftScorer(registry as unknown as ToolRegistry)

    const trace = makeTrace([
      { toolName: 'finance.invoice.list', invocationContext: 'bulk export context' },
    ])

    const result = await scorer.run({
      input: trace,
      output: { violatingPairs: [] },
    })

    expect(result.passed).toBe(false)
    expect(result.score).toBe(0)
  })

  it('has correct static metadata', () => {
    const registry = makeToolRegistry([])
    const scorer = new IntentDriftScorer(registry as unknown as ToolRegistry)

    expect(scorer.id).toBe('intent-drift-v1')
    expect(scorer.kind).toBe('deterministic')
    expect(scorer.scope).toBe('trace')
    expect(scorer.definitionSource).toBe('code')
  })
})
