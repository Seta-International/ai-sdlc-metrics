import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Logger } from '@nestjs/common'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { ToolRegistry, ToolRegistryValidationError } from './tool-registry'
import type { AgentToolMeta } from '../../../../common/trpc/agent-tool-meta'

// ─── tRPC test fixtures ────────────────────────────────────────────────────────

/**
 * Build real tRPC router instances for tests. Using real initTRPC ensures
 * the walk logic tracks tRPC v11 internals without diverging via hand-rolled mocks.
 */
const t = initTRPC.meta<{ permission?: string; agent?: AgentToolMeta }>().create()
const r = t.router
const p = t.procedure

/** Full valid agent meta for a query tool */
const VALID_QUERY_META: AgentToolMeta = {
  whenToUse: 'Use to retrieve board items',
  whenNotToUse: 'Do not use for mutations',
  examples: [{ input: 'Get board for plan ABC', callArgs: { planId: 'abc' } }],
}

/** Full valid agent meta for a mutation tool */
const VALID_MUTATION_META: AgentToolMeta = {
  whenToUse: 'Use to create a new task',
  whenNotToUse: 'Do not use for reads',
  examples: [{ input: 'Create task "Onboard Alice"', callArgs: { title: 'Onboard Alice' } }],
  approvalFreshness: 'revalidate',
}

// ─── describe: ToolRegistry ───────────────────────────────────────────────────

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  // ── Test 1: Harvest ──────────────────────────────────────────────────────────

  it('harvests only agent-annotated procedures; nested dot-path canonicalized', () => {
    const testRouter = r({
      // Procedure with full agent meta — the only one that should appear
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
      // Procedure with permission only — NOT an agent tool
      people: r({
        getProfile: p.meta({ permission: 'people:profile:read' }).query(() => 'profile'),
      }),
      // Procedure with no meta at all
      kernel: r({
        ping: p.query(() => 'pong'),
      }),
    })

    registry.loadFromRouter(testRouter)

    const tools = registry.listAgentTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('planner.task.getBoard')
  })

  // ── Test 2: getDescriptor ────────────────────────────────────────────────────

  it('getDescriptor returns descriptor for known name', () => {
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })
    registry.loadFromRouter(testRouter)

    const desc = registry.getDescriptor('planner.task.getBoard')
    expect(desc).toBeDefined()
    expect(desc?.name).toBe('planner.task.getBoard')
    expect(desc?.procedure).toBe('query')
    expect(desc?.permission).toBe('planner:task:read')
  })

  it('getDescriptor returns undefined for unknown name', () => {
    registry.loadFromRouter(r({}))
    expect(registry.getDescriptor('nonexistent.tool')).toBeUndefined()
  })

  it('getDescriptor returns undefined for a non-agent-tool procedure', () => {
    const testRouter = r({
      people: r({
        getProfile: p.meta({ permission: 'people:profile:read' }).query(() => 'profile'),
      }),
    })
    registry.loadFromRouter(testRouter)
    expect(registry.getDescriptor('people.getProfile')).toBeUndefined()
  })

  // ── Test 3: Validation — missing whenToUse ───────────────────────────────────

  it('throws ToolRegistryValidationError when whenToUse is missing', () => {
    const badMeta = { ...VALID_QUERY_META, whenToUse: '' }
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: badMeta })
            .query(() => 'board'),
        }),
      }),
    })
    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
    expect(() => {
      const reg2 = new ToolRegistry()
      reg2.loadFromRouter(testRouter)
    }).toThrow(/planner\.task\.getBoard/)
  })

  // ── Test 4: Validation — missing whenNotToUse / empty examples / empty example.input ──

  it('throws ToolRegistryValidationError when whenNotToUse is missing', () => {
    const badMeta = { ...VALID_QUERY_META, whenNotToUse: '' }
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: badMeta })
            .query(() => 'board'),
        }),
      }),
    })
    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
  })

  it('throws ToolRegistryValidationError when examples is empty array', () => {
    const badMeta: AgentToolMeta = { ...VALID_QUERY_META, examples: [] }
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: badMeta })
            .query(() => 'board'),
        }),
      }),
    })
    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
  })

  it('throws ToolRegistryValidationError when an example has empty input', () => {
    const badMeta: AgentToolMeta = {
      ...VALID_QUERY_META,
      examples: [{ input: '', callArgs: { planId: 'abc' } }],
    }
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: badMeta })
            .query(() => 'board'),
        }),
      }),
    })
    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
  })

  // ── Test 5: Validation — mutation without approvalFreshness ─────────────────

  it('throws ToolRegistryValidationError for mutation without approvalFreshness', () => {
    const badMeta: AgentToolMeta = {
      whenToUse: 'Create task',
      whenNotToUse: 'Not for reads',
      examples: [{ input: 'Create task', callArgs: { title: 'Task A' } }],
      // approvalFreshness intentionally omitted
    }
    const testRouter = r({
      planner: r({
        task: r({
          createTask: p
            .meta({ permission: 'planner:task:create', agent: badMeta })
            .mutation(() => 'created'),
        }),
      }),
    })
    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
    expect(() => {
      const reg2 = new ToolRegistry()
      reg2.loadFromRouter(testRouter)
    }).toThrow(/approvalFreshness/)
  })

  // ── Test 6: Validation — mutation with approvalFreshness passes ──────────────

  it('accepts mutation with approvalFreshness = "revalidate"', () => {
    const testRouter = r({
      planner: r({
        task: r({
          createTask: p
            .meta({ permission: 'planner:task:create', agent: VALID_MUTATION_META })
            .mutation(() => 'created'),
        }),
      }),
    })
    expect(() => registry.loadFromRouter(testRouter)).not.toThrow()
    const tools = registry.listAgentTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].procedure).toBe('mutation')
  })

  // ── Test 7: resolveMenuFor — sub-agent scope (segment boundary) ──────────────

  it('resolveMenuFor: scope filter uses segment-boundary match, not substring', () => {
    const taskReadMeta: AgentToolMeta = {
      ...VALID_QUERY_META,
      examples: [{ input: 'Get board', callArgs: {} }],
    }
    const tasksReadMeta: AgentToolMeta = {
      ...VALID_QUERY_META,
      examples: [{ input: 'List tasks', callArgs: {} }],
    }

    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: taskReadMeta })
            .query(() => 'board'),
        }),
        tasks: r({
          list: p
            .meta({ permission: 'planner:tasks:list', agent: tasksReadMeta })
            .query(() => 'tasks'),
        }),
      }),
    })
    registry.loadFromRouter(testRouter)

    const results = registry.resolveMenuFor({
      subAgentScope: ['planner:task'],
      roleAllowedPermissions: new Set(['planner:task:read', 'planner:tasks:list']),
      surfaceContext: { screen: 'planner/task/board' },
    })

    // planner:task:read matches prefix planner:task (same segments)
    // planner:tasks:list does NOT match (second segment is 'tasks' ≠ 'task')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('planner.task.getBoard')
  })

  // ── Test 8: resolveMenuFor — role filter ─────────────────────────────────────

  it('resolveMenuFor: excludes tool in scope but not in roleAllowedPermissions', () => {
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })
    registry.loadFromRouter(testRouter)

    const results = registry.resolveMenuFor({
      subAgentScope: ['planner:task'],
      roleAllowedPermissions: new Set<string>(), // empty — nothing allowed
      surfaceContext: { screen: 'planner/task/board' },
    })

    expect(results).toHaveLength(0)
  })

  // ── Test 9: resolveMenuFor — screen filter ───────────────────────────────────

  it('resolveMenuFor: excludes tool whose permission segments do not appear in screen path', () => {
    const plannerMeta: AgentToolMeta = { ...VALID_QUERY_META }
    const peopleMeta: AgentToolMeta = {
      whenToUse: 'Use to read profile',
      whenNotToUse: 'Not for mutations',
      examples: [{ input: 'Get profile for Alice', callArgs: { userId: 'alice' } }],
    }

    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: plannerMeta })
            .query(() => 'board'),
        }),
      }),
      people: r({
        getProfile: p
          .meta({ permission: 'people:profile:read', agent: peopleMeta })
          .query(() => 'profile'),
      }),
    })
    registry.loadFromRouter(testRouter)

    // Screen is planner/my-day — segments: ['planner', 'my-day']
    // planner:task:read has 'planner' in segments → matches
    // people:profile:read has no segment in ['planner', 'my-day'] → excluded
    const results = registry.resolveMenuFor({
      subAgentScope: ['planner:task', 'people:profile'],
      roleAllowedPermissions: new Set(['planner:task:read', 'people:profile:read']),
      surfaceContext: { screen: 'planner/my-day' },
    })

    expect(results).toHaveLength(1)
    expect(results[0].permission).toBe('planner:task:read')
  })

  // ── Test 10: resolveMenuFor — stable order ────────────────────────────────────

  it('resolveMenuFor: results sorted by name ascending regardless of insertion order', () => {
    const makeMeta = (hint: string): AgentToolMeta => ({
      whenToUse: `Use for ${hint}`,
      whenNotToUse: `Not for ${hint}`,
      examples: [{ input: hint, callArgs: {} }],
    })

    // Insert in reverse alphabetical order
    const testRouter = r({
      planner: r({
        task: r({
          updateTask: p
            .meta({
              permission: 'planner:task:update',
              agent: { ...makeMeta('update'), approvalFreshness: 'revalidate' },
            })
            .mutation(() => 'updated'),
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: makeMeta('getBoard') })
            .query(() => 'board'),
          createTask: p
            .meta({
              permission: 'planner:task:create',
              agent: { ...makeMeta('create'), approvalFreshness: 'revalidate' },
            })
            .mutation(() => 'created'),
        }),
      }),
    })
    registry.loadFromRouter(testRouter)

    const results = registry.resolveMenuFor({
      subAgentScope: ['planner:task'],
      roleAllowedPermissions: new Set([
        'planner:task:update',
        'planner:task:read',
        'planner:task:create',
      ]),
      surfaceContext: { screen: 'planner/task/board' },
    })

    expect(results).toHaveLength(3)
    expect(results.map((d) => d.name)).toEqual([
      'planner.task.createTask',
      'planner.task.getBoard',
      'planner.task.updateTask',
    ])
  })

  // ── Test 11: tenant_id ban — boot-time check ─────────────────────────────────

  it('throws ToolRegistryValidationError when input schema has tenant_id field', () => {
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .input(z.object({ planId: z.string(), tenant_id: z.string() }))
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })

    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
    expect(() => {
      const reg2 = new ToolRegistry()
      reg2.loadFromRouter(testRouter)
    }).toThrow(/tenant_id/)
  })

  it('accepts input schema without tenant_id', () => {
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .input(z.object({ planId: z.string() }))
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })

    expect(() => registry.loadFromRouter(testRouter)).not.toThrow()
  })

  // ── Test 12: Idempotence — calling loadFromRouter twice is a no-op ────────────

  it('loadFromRouter is idempotent: second call with same router is a no-op', () => {
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })

    registry.loadFromRouter(testRouter)
    expect(registry.listAgentTools()).toHaveLength(1)

    // Second call must not accumulate descriptors
    registry.loadFromRouter(testRouter)
    expect(registry.listAgentTools()).toHaveLength(1)
  })

  it('loadFromRouter is idempotent: second call with different router is also a no-op (first wins)', () => {
    const router1 = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })
    const router2 = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
          createTask: p
            .meta({ permission: 'planner:task:create', agent: VALID_MUTATION_META })
            .mutation(() => 'created'),
        }),
      }),
    })

    registry.loadFromRouter(router1)
    expect(registry.listAgentTools()).toHaveLength(1)

    // Second call ignored — first-loaded state preserved
    registry.loadFromRouter(router2)
    expect(registry.listAgentTools()).toHaveLength(1)
  })

  it('loadFromRouter logs a warning when called a second time', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      const testRouter = r({
        planner: r({
          task: r({
            getBoard: p
              .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
              .query(() => 'board'),
          }),
        }),
      })

      registry.loadFromRouter(testRouter)
      expect(warnSpy).not.toHaveBeenCalled()

      registry.loadFromRouter(testRouter)
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0][0]).toMatch(/called more than once/)
    } finally {
      warnSpy.mockRestore()
    }
  })

  // ── Test: tenant_id ban bypassed via .transform() — R-01.30 pipe-unwrap ───────

  it('throws ToolRegistryValidationError when input schema with tenant_id is wrapped in .transform()', () => {
    // Without resolveRootSchema, the _def.type is 'pipe' and isZodObject returns false,
    // causing the guard to silently skip — allowing tenant_id to slip through.
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .input(z.object({ planId: z.string(), tenant_id: z.string() }).transform((d) => d))
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })

    expect(() => registry.loadFromRouter(testRouter)).toThrow(ToolRegistryValidationError)
    expect(() => {
      const reg2 = new ToolRegistry()
      reg2.loadFromRouter(testRouter)
    }).toThrow(/tenant_id/)
  })

  it('accepts input schema without tenant_id wrapped in .transform()', () => {
    // Unwrapping should not cause false positives when tenant_id is absent.
    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .input(z.object({ planId: z.string() }).transform((d) => d))
            .meta({ permission: 'planner:task:read', agent: VALID_QUERY_META })
            .query(() => 'board'),
        }),
      }),
    })

    expect(() => registry.loadFromRouter(testRouter)).not.toThrow()
  })

  // ── Test: error message lists all offending tools ─────────────────────────────

  it('ToolRegistryValidationError message names all offending tools', () => {
    const badMeta1 = { ...VALID_QUERY_META, whenToUse: '' }
    const badMeta2: AgentToolMeta = {
      whenToUse: 'good',
      whenNotToUse: 'good',
      examples: [{ input: 'x', callArgs: {} }],
      // mutation without approvalFreshness
    }

    const testRouter = r({
      planner: r({
        task: r({
          getBoard: p
            .meta({ permission: 'planner:task:read', agent: badMeta1 })
            .query(() => 'board'),
          createTask: p
            .meta({ permission: 'planner:task:create', agent: badMeta2 })
            .mutation(() => 'created'),
        }),
      }),
    })

    let err: ToolRegistryValidationError | undefined
    try {
      registry.loadFromRouter(testRouter)
    } catch (e) {
      err = e as ToolRegistryValidationError
    }

    expect(err).toBeInstanceOf(ToolRegistryValidationError)
    expect(err?.message).toContain('planner.task.getBoard')
    expect(err?.message).toContain('planner.task.createTask')
  })
})
