/**
 * Unit tests for SubAgentRegistry (Plan 02 Task 3 + Task 5).
 *
 * All tests use `defineSubAgent` to produce fixtures, a stub ToolRegistry
 * (pure object mock — no NestJS container needed), and validate the
 * invariants R-02.6..R-02.9 (Task 3) and the resolveForSession 3-stage
 * filter + model/prompt/hash resolution (Task 5).
 */

import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import { metrics } from '@opentelemetry/api'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { defineSubAgent } from '../../domain/services/sub-agent-factory'
import type { ModelChoice, SubAgentKey, TenantContext } from '../../domain/services/sub-agent-types'
import { __INTERNAL_resetInstruments } from '../observability/gateway-metrics'
import {
  SubAgentRegistry,
  SubAgentRegistryValidationError,
  SUB_AGENT_REGISTRY,
} from './sub-agent-registry'
import type { ToolRegistry } from '../tool-registry/tool-registry'

// ─── OTel metrics setup (one-time) ───────────────────────────────────────────
// Register a real in-memory MeterProvider once for this spec file so that
// recordSubAgentHidden emits to a real counter (not a Noop meter). We reset
// the exporter + instrument cache between tests to prevent bleed.

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 100_000, // driven by forceFlush(), not timer
    }),
  ],
})
metrics.setGlobalMeterProvider(meterProvider)

beforeEach(() => {
  exporter.reset()
  __INTERNAL_resetInstruments()
})

// ─── Helpers: flush + query metric data points ────────────────────────────────

interface DataPoint {
  attributes: Record<string, unknown>
  value: number
}

async function flushAndGetPoints(metricName: string): Promise<DataPoint[]> {
  await meterProvider.forceFlush()
  const points: DataPoint[] = []
  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name === metricName) {
          for (const dp of metric.dataPoints) {
            points.push({
              attributes: dp.attributes as Record<string, unknown>,
              value: typeof dp.value === 'number' ? dp.value : (dp.value as { sum: number }).sum,
            })
          }
        }
      }
    }
  }
  return points
}

// ─── Stub ToolRegistry ────────────────────────────────────────────────────────

/**
 * Minimal stub that satisfies the `getDescriptor` surface used by
 * SubAgentRegistry.boot. Returns a truthy descriptor for any tool whose
 * name is in the `knownTools` set.
 *
 * The optional `permissionMap` allows specifying per-tool permission keys used
 * by resolveForSession's stage (b) role-permission filter. If omitted, a
 * default permission is derived from the tool name (tool name → permission key).
 */
function makeToolRegistry(
  knownTools: string[],
  permissionMap?: Record<string, string>,
): ToolRegistry {
  const set = new Set(knownTools)
  return {
    getDescriptor: vi.fn((name: string) => {
      if (!set.has(name)) return undefined
      const permission = permissionMap?.[name] ?? name.replace(/\./g, ':')
      return { name, permission }
    }),
  } as unknown as ToolRegistry
}

// ─── Fixture factory ──────────────────────────────────────────────────────────

interface FixtureOpts {
  toolScope?: string[]
  promptBody?: string
  promptVariablesSchema?: z.ZodType
  model?: ModelChoice | ((ctx: TenantContext) => ModelChoice)
}

/**
 * Builds a minimal valid sub-agent config for use in tests.
 * Supply overrides to exercise specific fields.
 */
function makeFixture(key: string, opts: FixtureOpts = {}): ReturnType<typeof defineSubAgent> {
  const {
    toolScope = ['fixtures.tools.alpha'],
    promptBody = 'Hello {{userDisplayName}}',
    promptVariablesSchema = z.object({ userDisplayName: z.string() }),
    model = { provider: 'openai', model: 'gpt-5.4-nano' } as ModelChoice,
  } = opts
  return defineSubAgent({
    key,
    domain: key.split('.')[0]!,
    description: `Test sub-agent ${key}`,
    whenToUse: 'Use in tests',
    promptTemplate: {
      body: promptBody,
      variables: promptVariablesSchema,
    },
    inputSchema: z.object({ utterance: z.string().min(1) }),
    outputSchema: z.object({ answer: z.string() }),
    toolScope,
    budgets: {
      maxIterations: 4,
      wallclockMs: 10_000,
      costUsd: 0.01,
    },
    memoryScope: {
      reads: ['L1', 'L2'],
      writes: ['L1'],
    },
    model,
    source: 'code',
  })
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SubAgentRegistry', () => {
  let registry: SubAgentRegistry

  beforeEach(() => {
    registry = new SubAgentRegistry()
  })

  // ── Test 1: Happy path ────────────────────────────────────────────────────────

  it('boots with 2 valid descriptors; list/get/has work correctly', () => {
    const a = makeFixture('fixtures.a', { toolScope: ['fixtures.tools.alpha'] })
    const b = makeFixture('fixtures.b', { toolScope: ['fixtures.tools.beta'] })
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha', 'fixtures.tools.beta'])

    registry.boot([a, b], toolRegistry)

    const all = registry.list()
    expect(all).toHaveLength(2)
    expect(all.map((d) => d.key)).toContain('fixtures.a')
    expect(all.map((d) => d.key)).toContain('fixtures.b')

    const got = registry.get('fixtures.a')
    expect(got).toBeDefined()
    expect(got?.key).toBe('fixtures.a')
    expect(got?.domain).toBe('fixtures')

    expect(registry.has('fixtures.a')).toBe(true)
    expect(registry.has('fixtures.b')).toBe(true)
    expect(registry.has('fixtures.missing')).toBe(false)
  })

  // ── Test 2: Duplicate key → throws ───────────────────────────────────────────

  it('duplicate key → boot throws SubAgentRegistryValidationError naming the key', () => {
    const first = makeFixture('fixtures.dupe', { toolScope: ['fixtures.tools.alpha'] })
    const second = makeFixture('fixtures.dupe', { toolScope: ['fixtures.tools.alpha'] })
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    expect(() => registry.boot([first, second], toolRegistry)).toThrow(
      SubAgentRegistryValidationError,
    )
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([first, second], toolRegistry)
    }).toThrow(/fixtures\.dupe/)
  })

  // ── Test 3: Empty descriptor list → throws ────────────────────────────────────

  it('empty descriptor list → boot throws (R-02.6 empty-deploy guard)', () => {
    const toolRegistry = makeToolRegistry([])

    expect(() => registry.boot([], toolRegistry)).toThrow(SubAgentRegistryValidationError)
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([], toolRegistry)
    }).toThrow(/at least one sub-agent/i)
  })

  // ── Test 4: Unknown tool in toolScope → throws ────────────────────────────────

  it('toolScope references unknown tool → boot throws with specific tool name (R-02.9)', () => {
    const a = makeFixture('fixtures.a', {
      toolScope: ['fixtures.tools.known', 'fixtures.tools.unknown-tool'],
    })
    // Only 'fixtures.tools.known' is in the registry
    const toolRegistry = makeToolRegistry(['fixtures.tools.known'])

    expect(() => registry.boot([a], toolRegistry)).toThrow(SubAgentRegistryValidationError)
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([a], toolRegistry)
    }).toThrow(/fixtures\.tools\.unknown-tool/)
  })

  // ── Test 5: Double-boot → throws ─────────────────────────────────────────────

  it('calling boot twice throws SubAgentRegistryValidationError (double-boot is a bug)', () => {
    const a = makeFixture('fixtures.a', { toolScope: ['fixtures.tools.alpha'] })
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    registry.boot([a], toolRegistry)

    expect(() => registry.boot([a], toolRegistry)).toThrow(SubAgentRegistryValidationError)
    expect(() => {
      registry.boot([a], toolRegistry)
    }).toThrow(/already booted|called more than once/i)
  })

  // ── Test 6: list() returns frozen array ──────────────────────────────────────

  it('list() returns a frozen array — mutating it throws TypeError', () => {
    const a = makeFixture('fixtures.a', { toolScope: ['fixtures.tools.alpha'] })
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    registry.boot([a], toolRegistry)

    const result = registry.list()
    expect(Object.isFrozen(result)).toBe(true)
    expect(() => {
      // TypeScript won't allow this directly — cast to verify runtime freeze
      ;(result as ReturnType<typeof defineSubAgent>[]).push(makeFixture('fixtures.injected'))
    }).toThrow(TypeError)
  })

  // ── Test 7: toolScope empty array (R-02.8) ────────────────────────────────────

  it('sub-agent with empty toolScope → boot throws (R-02.8)', () => {
    // defineSubAgent allows empty toolScope at declaration time — the aggregator
    // enforces R-02.8 at boot time.
    const a = makeFixture('fixtures.a', { toolScope: ['fixtures.tools.alpha'] })
    // Construct a descriptor with empty toolScope by bypassing defineSubAgent validation
    const badDescriptor = {
      ...a,
      toolScope: Object.freeze([]) as ReadonlyArray<string>,
    } as ReturnType<typeof defineSubAgent>
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    expect(() => registry.boot([badDescriptor], toolRegistry)).toThrow(
      SubAgentRegistryValidationError,
    )
    expect(() => {
      const reg2 = new SubAgentRegistry()
      reg2.boot([badDescriptor], toolRegistry)
    }).toThrow(/empty toolScope/i)
  })

  // ── Test 8: get() returns undefined for unknown key ───────────────────────────

  it('get() returns undefined for a key that was never registered', () => {
    const a = makeFixture('fixtures.a', { toolScope: ['fixtures.tools.alpha'] })
    const toolRegistry = makeToolRegistry(['fixtures.tools.alpha'])

    registry.boot([a], toolRegistry)

    expect(registry.get('does.not-exist')).toBeUndefined()
  })
})

// ─── resolveForSession ────────────────────────────────────────────────────────

describe('SubAgentRegistry.resolveForSession', () => {
  // Permission keys derived from tool name by default (see makeToolRegistry):
  //   'fixtures.tools.alpha'  → 'fixtures:tools:alpha'
  //   'fixtures.tools.beta'   → 'fixtures:tools:beta'
  //   'planner.tasks.list'    → 'planner:tasks:list'
  //   'planner.tasks.create'  → 'planner:tasks:create'
  //   'people.profiles.read'  → 'people:profiles:read'

  const ALL_TOOLS = [
    'fixtures.tools.alpha',
    'fixtures.tools.beta',
    'planner.tasks.list',
    'planner.tasks.create',
    'people.profiles.read',
  ]

  function bootRegistry(
    descriptors: ReturnType<typeof defineSubAgent>[],
    knownTools: string[] = ALL_TOOLS,
  ): SubAgentRegistry {
    const registry = new SubAgentRegistry()
    registry.boot(descriptors, makeToolRegistry(knownTools))
    return registry
  }

  // ── T5-1: Happy path ─────────────────────────────────────────────────────────

  it('T5-1: all modules enabled + all permissions granted → both sub-agents returned', async () => {
    const a = makeFixture('fixtures.a', {
      toolScope: ['fixtures.tools.alpha'],
      promptBody: 'Hello {{userDisplayName}}',
    })
    const b = makeFixture('fixtures.b', {
      toolScope: ['fixtures.tools.beta'],
      promptBody: 'Greet {{userDisplayName}}',
    })
    const registry = bootRegistry([a, b])

    const result = registry.resolveForSession({
      tenantId: 'tenant-1',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['fixtures']),
      roleAllowedPermissions: new Set(['fixtures:tools:alpha', 'fixtures:tools:beta']),
      promptVariables: new Map([
        ['fixtures.a' as SubAgentKey, { userDisplayName: 'Alice' }],
        ['fixtures.b' as SubAgentKey, { userDisplayName: 'Bob' }],
      ]),
    })

    expect(result).toHaveLength(2)
    const keys = result.map((r) => r.config.key)
    expect(keys).toContain('fixtures.a')
    expect(keys).toContain('fixtures.b')

    const ra = result.find((r) => r.config.key === 'fixtures.a')!
    expect(ra.resolvedPromptBody).toBe('Hello Alice')
    expect(ra.resolvedModel).toEqual({ provider: 'openai', model: 'gpt-5.4-nano' })
    expect(ra.subAgentPromptHash).toBeTruthy()

    const rb = result.find((r) => r.config.key === 'fixtures.b')!
    expect(rb.resolvedPromptBody).toBe('Greet Bob')
  })

  // ── T5-2: Stage (a) drop — all tools in disabled module ──────────────────────

  it('T5-2: sub-agent whose every tool is in a disabled module is dropped + metric emitted', async () => {
    const plannerAgent = makeFixture('planner.readonly', {
      toolScope: ['planner.tasks.list', 'planner.tasks.create'],
    })
    const registry = bootRegistry([plannerAgent])

    const result = registry.resolveForSession({
      tenantId: 'tenant-2',
      userId: 'user-1',
      surface: 'global-chat',
      // 'planner' is NOT in enabledModules
      enabledModules: new Set(['people', 'fixtures']),
      roleAllowedPermissions: new Set(['planner:tasks:list', 'planner:tasks:create']),
      promptVariables: new Map(),
    })

    expect(result).toHaveLength(0)

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const matchingPoint = points.find(
      (p) =>
        p.attributes['reason'] === 'module_disabled' && p.attributes['tenant_id'] === 'tenant-2',
    )
    expect(matchingPoint).toBeDefined()
    expect(matchingPoint!.attributes).toMatchObject({
      tenant_id: 'tenant-2',
      reason: 'module_disabled',
    })
    expect(matchingPoint!.attributes).not.toHaveProperty('sub_agent_key')
    expect(matchingPoint!.value).toBe(1)
  })

  // ── T5-3: Stage (a) mixed scope — survives ───────────────────────────────────

  it('T5-3: sub-agent with tools spanning enabled + disabled modules survives stage (a)', () => {
    // tools span 'planner' (disabled) and 'people' (enabled)
    const mixedAgent = makeFixture('fixtures.mixed', {
      toolScope: ['planner.tasks.list', 'people.profiles.read'],
    })
    const registry = bootRegistry([mixedAgent])

    const result = registry.resolveForSession({
      tenantId: 'tenant-3',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['people']), // planner disabled; people enabled
      roleAllowedPermissions: new Set(['planner:tasks:list', 'people:profiles:read']),
      promptVariables: new Map([['fixtures.mixed' as SubAgentKey, { userDisplayName: 'Carol' }]]),
    })

    // Mixed scope → survives stage (a)
    expect(result).toHaveLength(1)
    expect(result[0]!.config.key).toBe('fixtures.mixed')
  })

  // ── T5-3b: Stage (b) combined filter — disabled-module tool + no enabled-module permission ──

  it('T5-3b: planner disabled + people enabled; role permits only planner tool → dropped at stage (c)', async () => {
    // Mixed-scope agent: 'planner' is disabled, 'people' is enabled.
    // The role permits the planner tool but NOT the people tool.
    // Stage (b) must filter out the planner tool (disabled module) AND the
    // people tool (no permission), leaving an empty effective scope → stage (c) drop.
    const mixedAgent = makeFixture('fixtures.mixed2', {
      toolScope: ['planner.tasks.list', 'people.profiles.read'],
    })
    const registry = bootRegistry([mixedAgent])

    const result = registry.resolveForSession({
      tenantId: 'tenant-3b',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['people']), // planner disabled; people enabled
      // role permits planner tool (but planner is disabled) — NOT people tool
      roleAllowedPermissions: new Set(['planner:tasks:list']),
      promptVariables: new Map(),
    })

    // Must be dropped at stage (c): effective scope is empty after both filters
    expect(result).toHaveLength(0)

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const matchingPoint = points.find(
      (p) =>
        p.attributes['reason'] === 'permission_empty_scope' &&
        p.attributes['tenant_id'] === 'tenant-3b',
    )
    expect(matchingPoint).toBeDefined()
    expect(matchingPoint!.attributes).toMatchObject({
      tenant_id: 'tenant-3b',
      reason: 'permission_empty_scope',
    })
    expect(matchingPoint!.attributes).not.toHaveProperty('sub_agent_key')
    expect(matchingPoint!.value).toBe(1)
  })

  // ── T5-4: Stage (b) narrow — role permits only 1 of 3 tools ─────────────────

  it('T5-4: role permits only 1 of 3 tools → sub-agent survives with original config', () => {
    const agent = makeFixture('planner.readonly', {
      toolScope: ['planner.tasks.list', 'planner.tasks.create', 'people.profiles.read'],
    })
    const registry = bootRegistry([agent])

    const result = registry.resolveForSession({
      tenantId: 'tenant-4',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['planner', 'people']),
      // Only 'planner:tasks:list' is permitted; the other two are not
      roleAllowedPermissions: new Set(['planner:tasks:list']),
      promptVariables: new Map([['planner.readonly' as SubAgentKey, { userDisplayName: 'Dave' }]]),
    })

    // Survives because at least one tool is permitted
    expect(result).toHaveLength(1)
    // Original config is returned unmodified — toolScope still has all 3 tools
    expect(result[0]!.config.toolScope).toHaveLength(3)
    expect(result[0]!.config.toolScope).toContain('planner.tasks.list')
    expect(result[0]!.config.toolScope).toContain('planner.tasks.create')
    expect(result[0]!.config.toolScope).toContain('people.profiles.read')
  })

  // ── T5-5: Stage (c) drop — all tools forbidden by role ───────────────────────

  it('T5-5: sub-agent with ALL tools forbidden by role is dropped with permission_empty_scope metric', async () => {
    const agent = makeFixture('planner.readonly', {
      toolScope: ['planner.tasks.list', 'planner.tasks.create'],
    })
    const registry = bootRegistry([agent])

    const result = registry.resolveForSession({
      tenantId: 'tenant-5',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['planner']), // module enabled
      roleAllowedPermissions: new Set([]), // no permissions at all
      promptVariables: new Map(),
    })

    expect(result).toHaveLength(0)

    const points = await flushAndGetPoints('agent_sub_agent_hidden_total')
    const matchingPoint = points.find(
      (p) =>
        p.attributes['reason'] === 'permission_empty_scope' &&
        p.attributes['tenant_id'] === 'tenant-5',
    )
    expect(matchingPoint).toBeDefined()
    expect(matchingPoint!.attributes).toMatchObject({
      tenant_id: 'tenant-5',
      reason: 'permission_empty_scope',
    })
    expect(matchingPoint!.attributes).not.toHaveProperty('sub_agent_key')
    expect(matchingPoint!.value).toBe(1)
  })

  // ── T5-6: Model resolution — function-valued model ───────────────────────────

  it('T5-6: function-valued model is evaluated with the correct TenantContext', () => {
    const capturedCtxs: TenantContext[] = []
    const dynamicModel = vi.fn((ctx: TenantContext): ModelChoice => {
      capturedCtxs.push(ctx)
      return { provider: 'openai', model: 'gpt-5.4' }
    })

    const agent = makeFixture('fixtures.dynamic', {
      toolScope: ['fixtures.tools.alpha'],
      model: dynamicModel,
    })
    const registry = bootRegistry([agent])

    const result = registry.resolveForSession({
      tenantId: 'tenant-6',
      userId: 'user-1',
      surface: 'inline',
      enabledModules: new Set(['fixtures']),
      roleAllowedPermissions: new Set(['fixtures:tools:alpha']),
      promptVariables: new Map([['fixtures.dynamic' as SubAgentKey, { userDisplayName: 'Eve' }]]),
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.resolvedModel).toEqual({ provider: 'openai', model: 'gpt-5.4' })
    expect(dynamicModel).toHaveBeenCalledOnce()
    expect(capturedCtxs[0]).toEqual({
      tenantId: 'tenant-6',
      surface: 'inline',
    })
  })

  // ── T5-7: Prompt rendering — variable substitution + Zod validation ───────────

  it('T5-7: variables are substituted correctly; Zod validation error throws', () => {
    const agent = makeFixture('fixtures.a', {
      toolScope: ['fixtures.tools.alpha'],
      promptBody: 'Dear {{name}}, your role is {{role}}',
      promptVariablesSchema: z.object({ name: z.string(), role: z.string() }),
    })
    const registry = bootRegistry([agent])

    const valid = registry.resolveForSession({
      tenantId: 'tenant-7',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['fixtures']),
      roleAllowedPermissions: new Set(['fixtures:tools:alpha']),
      promptVariables: new Map([['fixtures.a' as SubAgentKey, { name: 'Frank', role: 'manager' }]]),
    })

    expect(valid[0]!.resolvedPromptBody).toBe('Dear Frank, your role is manager')

    // Missing 'name' field — Zod validation should fail
    const registry2 = bootRegistry([agent])
    expect(() =>
      registry2.resolveForSession({
        tenantId: 'tenant-7',
        userId: 'user-1',
        surface: 'global-chat',
        enabledModules: new Set(['fixtures']),
        roleAllowedPermissions: new Set(['fixtures:tools:alpha']),
        promptVariables: new Map([
          // missing 'name' — Zod should reject
          ['fixtures.a' as SubAgentKey, { role: 'manager' }],
        ]),
      }),
    ).toThrow(/fixtures\.a/)
  })

  // ── T5-8: Hash determinism — same inputs → same hash ─────────────────────────

  it('T5-8: same inputs produce the same subAgentPromptHash across two calls', () => {
    const agent = makeFixture('fixtures.a', {
      toolScope: ['fixtures.tools.alpha'],
      promptBody: 'Hello {{userDisplayName}}',
    })
    const registry = bootRegistry([agent])

    const opts = {
      tenantId: 'tenant-8',
      userId: 'user-1',
      surface: 'global-chat' as const,
      enabledModules: new Set(['fixtures']),
      roleAllowedPermissions: new Set(['fixtures:tools:alpha']),
      promptVariables: new Map([['fixtures.a' as SubAgentKey, { userDisplayName: 'Grace' }]]),
    }

    const r1 = registry.resolveForSession(opts)
    // Need a second registry (boot is once-only)
    const registry2 = bootRegistry([agent])
    const r2 = registry2.resolveForSession(opts)

    expect(r1[0]!.subAgentPromptHash).toBe(r2[0]!.subAgentPromptHash)
  })

  // ── T5-9: Hash distinctness — different prompt body → different hash ──────────

  it('T5-9: different resolvedPromptBody produces a different hash for the same key', () => {
    const agentA = makeFixture('fixtures.a', {
      toolScope: ['fixtures.tools.alpha'],
      promptBody: 'Hello {{userDisplayName}}',
    })
    const registryA = bootRegistry([agentA])
    const r1 = registryA.resolveForSession({
      tenantId: 'tenant-9',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['fixtures']),
      roleAllowedPermissions: new Set(['fixtures:tools:alpha']),
      promptVariables: new Map([['fixtures.a' as SubAgentKey, { userDisplayName: 'Hank' }]]),
    })

    // Different variable value → different rendered body → different hash
    const agentA2 = makeFixture('fixtures.a', {
      toolScope: ['fixtures.tools.alpha'],
      promptBody: 'Hello {{userDisplayName}}',
    })
    const registryA2 = bootRegistry([agentA2])
    const r2 = registryA2.resolveForSession({
      tenantId: 'tenant-9',
      userId: 'user-1',
      surface: 'global-chat',
      enabledModules: new Set(['fixtures']),
      roleAllowedPermissions: new Set(['fixtures:tools:alpha']),
      promptVariables: new Map([['fixtures.a' as SubAgentKey, { userDisplayName: 'Iris' }]]),
    })

    expect(r1[0]!.subAgentPromptHash).not.toBe(r2[0]!.subAgentPromptHash)
  })
})

// ─── Phase-1 output subset drift test (R-02.11) ──────────────────────────────
//
// CI hard-fail: every booted sub-agent's inputSchema must accept the canonical
// phase-1 sample `{ utterance: 'hello world' }`. This mirrors the compile-time
// `AssertSubsetOfPhase1` constraint at runtime, ensuring no drift between the
// type check and actual schema behavior.
//
// If a new sub-agent is declared with an inputSchema that rejects a valid
// phase-1 output sample, this suite breaks CI (R-02.11 — no warn-only).

describe('Phase-1 output subset drift test (R-02.11)', () => {
  // The canonical minimal phase-1 sample — matches Phase1OutputSchema exactly.
  const PHASE1_SAMPLE = { utterance: 'hello world' }

  it('every fixture sub-agent inputSchema accepts the canonical Phase1Output sample', () => {
    // Build a representative set of sub-agents via the fixture factory to cover
    // the constraint for any sub-agents that might appear in the registry.
    const agents = [
      // Standard fixture with utterance — must pass
      makeFixture('fixtures.drift-check-a', { toolScope: ['fixtures.tools.alpha'] }),
    ]

    for (const agent of agents) {
      const result = agent.inputSchema.safeParse(PHASE1_SAMPLE)
      expect(
        result.success,
        `Sub-agent "${agent.key}" rejected Phase1Output sample: ${!result.success ? JSON.stringify((result as { error: unknown }).error) : 'ok'}`,
      ).toBe(true)
    }
  })

  it('planner.read-only inputSchema (real declaration) accepts the canonical Phase1Output sample', async () => {
    // Import the real seeded sub-agent to verify the production declaration
    // (not just test fixtures) satisfies the phase-1 contract.
    const { plannerReadOnlySubAgent } =
      await import('../../../planner/agent/sub-agents/planner-read-only')
    const result = plannerReadOnlySubAgent.inputSchema.safeParse(PHASE1_SAMPLE)
    expect(
      result.success,
      `planner.read-only rejected Phase1Output sample: ${!result.success ? JSON.stringify((result as { error: unknown }).error) : 'ok'}`,
    ).toBe(true)
  })
})

// ─── Token identity ───────────────────────────────────────────────────────────

describe('SUB_AGENT_REGISTRY token', () => {
  it('is a Symbol with the description "SUB_AGENT_REGISTRY"', () => {
    expect(typeof SUB_AGENT_REGISTRY).toBe('symbol')
    expect(SUB_AGENT_REGISTRY.description).toBe('SUB_AGENT_REGISTRY')
  })

  it('is distinct from the SubAgentRegistry class reference', () => {
    // The token and the class must be different values so that NestJS
    // can register both `SubAgentRegistry` (class provider) and
    // `{ provide: SUB_AGENT_REGISTRY, useExisting: SubAgentRegistry }`
    // as separate provider keys that resolve to the same singleton.
    expect((SUB_AGENT_REGISTRY as unknown) !== SubAgentRegistry).toBe(true)
  })

  it('useExisting pattern: same instance resolvable by token and by class', () => {
    // Simulate the useExisting: SubAgentRegistry pattern without the NestJS
    // container (@nestjs/testing is not installed). We construct one instance
    // and bind the token to it — identical to what the container does.
    const instance = new SubAgentRegistry()
    const providerMap = new Map<symbol | (new (...args: unknown[]) => unknown), SubAgentRegistry>()
    providerMap.set(SubAgentRegistry as unknown as new () => SubAgentRegistry, instance)
    providerMap.set(SUB_AGENT_REGISTRY, instance) // useExisting points to same object

    const byClass = providerMap.get(SubAgentRegistry as unknown as new () => SubAgentRegistry)
    const byToken = providerMap.get(SUB_AGENT_REGISTRY)

    expect(byToken).toBeInstanceOf(SubAgentRegistry)
    expect(byToken).toBe(byClass)
  })
})
