/**
 * sub-agent-runner-adapter.integration.spec.ts — Plan 17 PR 2 Task 6.
 *
 * Proves the adapter drives the REAL ReAct-loop driver + REAL
 * tool-gateway-bridge end-to-end. The LLM client is scripted (no live OpenAI
 * call) but its scripted behaviour actually invokes the AI-SDK `tool.execute()`
 * function, which calls through `buildSubAgentTools` into a real
 * `ToolGatewayPort` implementation. This exercises:
 *
 *   - SubAgentRegistry.get → ValidatedSubAgentConfig resolution
 *   - buildSubAgentTools → real Vercel AI SDK `tool({...})` wiring
 *   - runReactLoop → translation of LLM result + accumulator into driver result
 *   - SubAgentRunnerAdapter → composition of all above into SubAgentOutput
 *
 * Scope decision: the production `ToolGateway` class has a deep dependency
 * graph (KernelAuditFacade, TrpcCallerImpl, FlowPolicyResolver, DraftProposer,
 * SemanticResultCache, all DB-bound). Standing up the full Nest test module +
 * seeded Postgres for one assertion is disproportionate. Instead we build a
 * minimal `ToolGatewayPort` stub that records invocations — the adapter +
 * bridge + driver code under test is fully real. A follow-up (Plan 18 Task X)
 * can promote this to a full Postgres-backed integration once the iterative
 * orchestrator wiring lands.
 */

import { describe, it, expect, vi } from 'vitest'
import * as z from 'zod'
import { SubAgentRunnerAdapter } from './sub-agent-runner-adapter'
import type { ToolGatewayPort, ToolGatewayInvokeInput } from './tool-gateway-contracts'
import { ok } from '../../infrastructure/guards/tripwire'
import type { ToolGatewayResult } from '../../infrastructure/guards/tripwire'
import type { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-types'
import type { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type {
  SubAgentLlmClient,
  SubAgentLlmClientOpts,
  SubAgentLlmClientResult,
} from '../../infrastructure/llm/sub-agent-llm-client'
import type { IterativeSubAgentRunOpts } from './iterative-orchestrator'
import type { PhaseExecutorTurnState } from './phase-executor-contracts'

// ─── Fixture sub-agent config ─────────────────────────────────────────────────

const ECHO_TOOL = 'agent.testEcho'

function makeConfig(): ValidatedSubAgentConfig {
  return {
    key: 'integration.echoer' as ValidatedSubAgentConfig['key'],
    domain: 'integration',
    description: 'Echo integration agent',
    whenToUse: 'Echo testing',
    promptTemplate: { body: 'Echo the input.', variables: z.object({}) },
    inputSchema: z.object({ utterance: z.string() }),
    outputSchema: z.object({ echoed: z.string() }),
    toolScope: Object.freeze([ECHO_TOOL]) as ReadonlyArray<string>,
    budgets: Object.freeze({ maxIterations: 4, wallclockMs: 15_000, costUsd: 0.05 }),
    memoryScope: Object.freeze({
      reads: Object.freeze(['L1']) as ReadonlyArray<never>,
      writes: Object.freeze([]) as ReadonlyArray<never>,
    }),
    model: Object.freeze({ provider: 'openai' as const, model: 'gpt-5.4-nano' as const }),
    source: 'code',
  } as unknown as ValidatedSubAgentConfig
}

function makeRegistry(config: ValidatedSubAgentConfig): SubAgentRegistry {
  return { get: vi.fn().mockReturnValue(config) } as unknown as SubAgentRegistry
}

function makeToolRegistry(): ToolRegistry {
  const desc: AgentToolDescriptor = {
    name: ECHO_TOOL,
    procedure: 'query',
    permission: 'agent:test:read',
    inputSchema: z.object({ x: z.string() }),
    outputSchema: undefined,
    meta: {
      whenToUse: 'echoes the input',
      whenNotToUse: 'never',
      examples: [{ input: 'hi', callArgs: { x: 'hi' } }],
    },
  }
  return {
    getDescriptor: (name: string) => (name === ECHO_TOOL ? desc : undefined),
  } as unknown as ToolRegistry
}

// ─── Recording gateway: real-shaped, in-memory ────────────────────────────────

function makeRecordingGateway(): ToolGatewayPort & {
  invocations: ToolGatewayInvokeInput[]
} {
  const invocations: ToolGatewayInvokeInput[] = []
  return {
    invocations,
    invoke: async (input: ToolGatewayInvokeInput): Promise<ToolGatewayResult> => {
      invocations.push(input)
      const args = (input.args ?? {}) as { x?: string }
      return ok({ echoed: args.x ?? '' }, false)
    },
  }
}

// ─── Scripted LLM client that ACTUALLY invokes the bridge tool ────────────────

/**
 * Mimics a single-step ReAct loop: the model "decides" to call `agent.testEcho`
 * with `{ x: 'hello' }`, awaits the bridge-supplied tool's `execute()`, then
 * shapes the structured output. This is the load-bearing assertion: the tool
 * the bridge produces is invoked exactly the same way the AI SDK would invoke
 * it, and that path goes through the real `buildSubAgentTools.execute()`
 * closure into the recording gateway.
 */
function makeScriptedClient(): SubAgentLlmClient {
  return {
    runWithTools: async (opts: SubAgentLlmClientOpts): Promise<SubAgentLlmClientResult> => {
      const tool = opts.tools[ECHO_TOOL] as
        | { execute: (args: unknown, ctx: unknown) => Promise<unknown> }
        | undefined
      if (!tool) {
        throw new Error('scripted client: expected tool.testEcho to be wired by the bridge')
      }
      const echoResult = (await tool.execute({ x: 'hello' }, {})) as { echoed: string }
      return {
        rawStructured: { echoed: echoResult.echoed },
        text: 'echoed',
        steps: [],
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          inputCachedRead: 0,
          inputCachedWrite: 0,
          outputReasoning: 0,
          costUsd: 0,
        },
        finishReason: 'stop',
      }
    },
  }
}

function makeOpts(): IterativeSubAgentRunOpts {
  const turnState: PhaseExecutorTurnState = {
    traceId: 'trace-int-spec',
    tenantId: 'tenant-int',
    userId: 'user-int',
    conversationId: 'conv-int',
    sessionId: 'sess-int',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
  }
  return {
    directive: {
      sub_agent_key: 'integration.echoer',
      input: { utterance: 'echo this' },
      reason: 'integration sanity',
    },
    phase: 1,
    abortSignal: new AbortController().signal,
    turnState,
  }
}

// ─── Test ────────────────────────────────────────────────────────────────────

describe('SubAgentRunnerAdapter (integration)', () => {
  it('drives the bridge + driver end-to-end: gateway.invoke called, provenance recorded, kind=completed', async () => {
    const config = makeConfig()
    const registry = makeRegistry(config)
    const gateway = makeRecordingGateway()
    const toolRegistry = makeToolRegistry()
    const llm = makeScriptedClient()

    const adapter = new SubAgentRunnerAdapter(registry, llm, gateway, toolRegistry)
    const output = await adapter.run(makeOpts())

    // Output shape: completed (rawStructured satisfies outputSchema)
    expect(output.kind).toBe('completed')
    expect(output.usageTotals.inputTokens).toBe(12)

    // Gateway was invoked exactly once with the expected toolName + args
    expect(gateway.invocations).toHaveLength(1)
    expect(gateway.invocations[0]!.toolName).toBe(ECHO_TOOL)
    expect(gateway.invocations[0]!.args).toEqual({ x: 'hello' })
    // Invoke context carries the adapter-built scope/policy
    expect(gateway.invocations[0]!.subAgentKey).toBe('integration.echoer')
    expect(gateway.invocations[0]!.subAgentScope).toEqual([ECHO_TOOL])
    expect(gateway.invocations[0]!.policy.readOnly).toBe(false)

    // Provenance was captured by the bridge accumulator and threaded through
    expect(output.sourceToolProvenance).toHaveLength(1)
    expect(output.sourceToolProvenance[0]!.toolName).toBe(ECHO_TOOL)
    expect(output.sourceToolProvenance[0]!.iteration).toBe(1)
  })

  it('hard-tripwire from gateway propagates to kind=errored', async () => {
    const config = makeConfig()
    const registry = makeRegistry(config)
    const toolRegistry = makeToolRegistry()

    const gateway: ToolGatewayPort = {
      invoke: async () => ({
        kind: 'tripwire',
        variant: 'permission_denied',
        disposition: 'abort',
        context: { message: 'denied' },
      }),
    }

    const llm: SubAgentLlmClient = {
      runWithTools: async (opts) => {
        const tool = opts.tools[ECHO_TOOL] as
          | { execute: (a: unknown, c: unknown) => Promise<unknown> }
          | undefined
        // Calling execute() should throw HardTripwireError, which the driver
        // catches and surfaces on `hardTripwire`.
        await tool!.execute({ x: 'hi' }, {})
        // Unreachable — included only to satisfy the SubAgentLlmClientResult shape.
        return {
          rawStructured: {},
          text: '',
          steps: [],
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            inputCachedRead: 0,
            inputCachedWrite: 0,
            outputReasoning: 0,
            costUsd: 0,
          },
          finishReason: 'stop',
        }
      },
    }

    const adapter = new SubAgentRunnerAdapter(registry, llm, gateway, toolRegistry)
    const output = await adapter.run(makeOpts())

    expect(output.kind).toBe('errored')
    expect(output.summary).toContain('permission_denied')
  })
})
