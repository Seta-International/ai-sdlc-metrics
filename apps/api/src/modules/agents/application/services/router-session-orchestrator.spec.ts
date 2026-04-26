/**
 * router-session-orchestrator.spec.ts — Plan 02 Task 10 unit tests
 *
 * All external dependencies are stubbed via vi.fn(). No NestJS DI container,
 * no real DB, no real LLM.
 *
 * Test matrix:
 *  1.  Happy path — new session: session created, bounded plan returned, parseRetries=0
 *  2.  Existing session: pinned hashes used; bounded plan returned
 *  3.  Retry path: first LLM call malformed → second succeeds → parseRetries=1
 *  4.  Escalation: both calls fail → disambiguation + audit event emitted
 *  5.  LLM-emitted disambiguation: plan.disambiguation set → disambiguation result
 *  6.  Token-budget activation: estimated > ceiling → retriever called
 *  7.  Token-budget dormant: estimated <= ceiling → retriever NOT called
 *  8.  Hash stability on existing session: rebuilt hash matches pinned → proceeds
 *  9.  Hash drift on existing session: rebuilt hash != pinned → internal_hash_drift
 * 10.  Audit event count: 2 phase1 + 1 phase2 = 3 sub_agent_invoked events
 * 11.  Metric: routerDecisionsTotal called with correct outcome
 * 12.  parse retry metric: recordRouterParseRetry called on retry turns
 * 13.  Span: escalation emits router-decision:parse span with parse_outcome='escalate'
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base'
import { trace, context } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { RouterSessionOrchestrator } from './router-session-orchestrator'
import type { RouteTurnOpts } from './router-session-orchestrator'
import { RouterLlmFailureError } from './pipeline-errors'
import type { AgentSessionEntry } from '../../domain/ports/agent-session.port'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import type { WindowedSummaries } from '../../domain/value-objects/windowed-summaries'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import type { PhaseExecutionResult } from './phase-executor-contracts'
import { estimateTokens } from './sub-agent-retriever'

// ─── OTel span capture setup ──────────────────────────────────────────────────
// Registers a global TracerProvider once for the entire spec file.
// OTel API intentionally prevents re-registration; we reset the exporter between tests.

const spanExporter = new InMemorySpanExporter()
const spanProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spanExporter)],
})
trace.setGlobalTracerProvider(spanProvider)

// AsyncLocalStorage context manager required for context.with() to propagate spans.
const ctxMgr = new AsyncLocalStorageContextManager()
ctxMgr.enable()
context.setGlobalContextManager(ctxMgr)

afterAll(async () => {
  await spanProvider.shutdown()
})

// ─── Mock sub-agent-retriever (preserves ROUTER_PROMPT_TOKEN_CEILING + other exports,
//     mocks the module-level estimateTokens function so tests can control it) ──────

vi.mock('./sub-agent-retriever', async (importOriginal) => {
  const mod = (await importOriginal()) as typeof import('./sub-agent-retriever')
  return { ...mod, estimateTokens: vi.fn() }
})

// ─── Mock gateway-metrics (hoisted so vi.mock factory can reference them) ─────

const {
  mockRecordRouterDecision,
  mockRecordRouterParseRetry,
  mockRecordSubAgentInvoked,
  mockRecordNarrativeCache,
  mockRecordTopologyDowngradeCandidateTotal,
} = vi.hoisted(() => ({
  mockRecordRouterDecision: vi.fn(),
  mockRecordRouterParseRetry: vi.fn(),
  mockRecordSubAgentInvoked: vi.fn(),
  mockRecordNarrativeCache: vi.fn(),
  mockRecordTopologyDowngradeCandidateTotal: vi.fn(),
}))

vi.mock('../../infrastructure/observability/gateway-metrics', () => ({
  recordRouterDecision: mockRecordRouterDecision,
  recordRouterParseRetry: mockRecordRouterParseRetry,
  recordSubAgentInvoked: mockRecordSubAgentInvoked,
  recordNarrativeCache: mockRecordNarrativeCache,
  recordSubAgentHidden: vi.fn(),
  recordTopologyDowngradeCandidateTotal: mockRecordTopologyDowngradeCandidateTotal,
}))

// ─── Mock router-budget ───────────────────────────────────────────────────────

vi.mock('./router-budget', () => ({
  ROUTER_PROMPT_TOKEN_CEILING: 120_000,
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const USER_ID = '00000000-0000-7000-8000-000000000002'
const CONVERSATION_ID = '00000000-0000-7000-8000-000000000003'
const TURN_TRACE_ID = '00000000-0000-7000-8000-000000000004'
const SESSION_ID = '00000000-0000-7000-8000-000000000005'
const FLOW_ID = '018e8b2a-4c1d-7000-8000-000000000001'

const VALID_PLAN: RouterPlan = {
  topology: 'bounded',
  intent_slug: 'planner.list-my-tasks',
  flow_id: FLOW_ID,
  phase1: [
    {
      sub_agent_key: 'planner.read-only',
      input: { utterance: 'show tasks' },
      reason: 'lists tasks',
    },
  ],
  phase2: [],
}

const VALID_PLAN_2P1_1P2: RouterPlan = {
  topology: 'bounded',
  intent_slug: 'planner.list-my-tasks',
  flow_id: FLOW_ID,
  phase1: [
    { sub_agent_key: 'planner.read-only', input: {}, reason: 'r1' },
    { sub_agent_key: 'planner.read-only-2', input: {}, reason: 'r2' },
  ],
  phase2: [{ sub_agent_key: 'planner.read-only-3', input: {}, reason: 'r3' }],
}

const DISAMBIG_PLAN: RouterPlan = {
  topology: 'bounded',
  intent_slug: 'unclassified',
  flow_id: FLOW_ID,
  phase1: [],
  phase2: [],
  disambiguation: 'Did you mean tasks or plans?',
}

const BASE_SUMMARY: WindowedSummaries = { verbatim: [], compressed: [], rolling: null }

const BASE_OPTS: RouteTurnOpts = {
  tenantId: TENANT_ID,
  userId: USER_ID,
  roleKey: 'employee',
  roleAllowedPermissions: new Set(['planner:tasks:read']),
  enabledModules: new Set(['planner']),
  surface: 'global-chat',
  conversationId: CONVERSATION_ID,
  turnTraceId: TURN_TRACE_ID,
  utterance: 'show my tasks',
  recentSummary: BASE_SUMMARY,
  promptVariables: new Map<SubAgentKey, Record<string, unknown>>(),
}

// ─── Stub factories ───────────────────────────────────────────────────────────

function makeSessionEntry(overrides: Partial<AgentSessionEntry> = {}): AgentSessionEntry {
  return {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    routerPromptHash: 'pinned-prompt-hash',
    permissionNarrativeHash: 'pinned-narrative-hash',
    toolCatalogHash: 'pinned-tool-hash',
    directiveSchemaHash: 'pinned-schema-hash',
    canonicalizerVersionHash: 'pinned-canonicalizer-hash',
    pinnedSubAgentPromptHashes: { 'planner.read-only': 'sa-hash-1' },
    startedAt: new Date('2026-04-22T00:00:00Z'),
    endedAt: null,
    ...overrides,
  }
}

// A stub ResolvedSubAgent matching a given key
function makeResolvedSubAgent(key: string, subAgentPromptHash = 'sa-hash-1') {
  return {
    config: {
      key,
      domain: 'planner',
      description: 'a sub-agent',
      whenToUse: 'always',
      promptTemplate: {
        body: 'prompt',
        variables: { safeParse: () => ({ success: true, data: {} }) },
      },
      inputSchema: {},
      outputSchema: {},
      toolScope: ['planner.personal.listTasks'],
      budgets: { maxIterations: 4, wallclockMs: 15_000, costUsd: 0.02 },
      memoryScope: { reads: ['L1'], writes: ['L1'] },
      model: { provider: 'openai', model: 'gpt-4o' },
      source: 'code',
    },
    resolvedModel: { provider: 'openai' as const, model: 'gpt-4o' },
    resolvedPromptBody: 'prompt',
    subAgentPromptHash,
  }
}

// ─── Build orchestrator with mocked dependencies ───────────────────────────────

const DEFAULT_LLM_USAGE = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }

function buildOrchestrator(opts: {
  existingSession?: AgentSessionEntry | null
  llmResults?: Array<
    | {
        kind: 'ok'
        plan: RouterPlan
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
      }
    | { kind: 'malformed'; error: Error; rawText: null }
  >
  parseResults?: Array<
    | { kind: 'ok'; plan: RouterPlan }
    | { kind: 'retry'; reason: string; schemaInjectedPrompt: string }
  >
  resolvedSubAgents?: ReturnType<typeof makeResolvedSubAgent>[]
  narrowedConfigs?: Array<{ key: string }>
  promptHash?: string
  canDoResult?: boolean
  iterativeOrchestratorResult?: PhaseExecutionResult
}) {
  const {
    existingSession = null,
    llmResults = [{ kind: 'ok', plan: VALID_PLAN, usage: DEFAULT_LLM_USAGE }],
    parseResults,
    resolvedSubAgents = [makeResolvedSubAgent('planner.read-only')],
    narrowedConfigs,
    promptHash = 'rebuilt-prompt-hash',
    canDoResult = true,
    iterativeOrchestratorResult,
  } = opts

  let llmCallCount = 0
  let parseCallCount = 0

  const sessionCreated: Partial<AgentSessionEntry>[] = []
  const auditEvents: Array<Parameters<typeof kernelAuditFacade.recordEvent>[0]> = []

  const agentSessionPort = {
    findByConversation: vi.fn().mockImplementation(async () => {
      // After session creation, return the newly created session
      if (sessionCreated.length > 0 && !existingSession) {
        return {
          ...sessionCreated[0],
          startedAt: new Date(),
          endedAt: null,
        } as AgentSessionEntry
      }
      return existingSession
    }),
    create: vi
      .fn()
      .mockImplementation(async (entry: Omit<AgentSessionEntry, 'startedAt' | 'endedAt'>) => {
        const created = { ...entry, startedAt: new Date(), endedAt: null }
        sessionCreated.push(created)
        return created as AgentSessionEntry
      }),
    endSession: vi.fn(),
  }

  const narrativeResult = {
    narrativeHash: existingSession ? existingSession.permissionNarrativeHash : 'narrative-hash',
    text: 'Acting as employee. You can create; you cannot admin.',
    fromCache: false,
  }
  const permissionNarrativeBuilder = {
    build: vi.fn().mockResolvedValue(narrativeResult),
  }

  const subAgentRegistry = {
    resolveForSession: vi.fn().mockReturnValue(resolvedSubAgents),
    has: vi.fn().mockReturnValue(true),
  }

  const routerPromptBuilder = {
    build: vi.fn().mockReturnValue({
      systemPrompt: 'system prompt',
      developerMessage: 'dev message',
      routerPromptHash: promptHash,
    }),
  }

  const subAgentRetriever = {
    retrieve: vi.fn().mockResolvedValue(narrowedConfigs ?? resolvedSubAgents.map((r) => r.config)),
    // estimateTokens instance method present for DI compatibility;
    // the orchestrator uses the module-level estimateTokens (mocked via vi.mock above)
    estimateTokens: vi.fn(),
  }

  const llmClient = {
    generate: vi.fn().mockImplementation(async () => {
      const result = llmResults[llmCallCount] ?? llmResults[llmResults.length - 1]
      llmCallCount++
      // Ensure ok results always carry a usage object (RouterLlmClient contract)
      if (result && result.kind === 'ok' && !('usage' in result)) {
        return { ...result, usage: DEFAULT_LLM_USAGE }
      }
      return result
    }),
  }

  const defaultParseResults = [
    { kind: 'ok', plan: VALID_PLAN },
    { kind: 'ok', plan: VALID_PLAN },
  ]
  const effectiveParseResults = parseResults ?? defaultParseResults

  const parser = {
    parsePlan: vi.fn().mockImplementation(() => {
      const result =
        effectiveParseResults[parseCallCount] ??
        effectiveParseResults[effectiveParseResults.length - 1]
      parseCallCount++
      return result
    }),
  }

  const toolRegistry = {
    listAgentTools: vi
      .fn()
      .mockReturnValue([
        { name: 'planner.personal.listTasks', permission: 'planner:tasks:read', meta: {} },
      ]),
  }

  const kernelAuditFacade = {
    recordEvent: vi
      .fn()
      .mockImplementation(async (event: Parameters<typeof kernelAuditFacade.recordEvent>[0]) => {
        auditEvents.push(event)
      }),
  }

  const kernelQueryFacadeMock = {
    canDo: vi.fn().mockResolvedValue(canDoResult),
  }

  const iterativeOrchestratorMock = {
    execute: vi.fn().mockResolvedValue(
      iterativeOrchestratorResult ?? {
        kind: 'synthesized',
        answer: { text: 'done' },
        drafts: [],
      },
    ),
  }

  const orchestrator = new RouterSessionOrchestrator(
    agentSessionPort as never,
    permissionNarrativeBuilder as never,
    subAgentRegistry as never,
    routerPromptBuilder as never,
    subAgentRetriever as never,
    parser as never,
    llmClient as never,
    toolRegistry as never,
    kernelAuditFacade as never,
    kernelQueryFacadeMock as never,
    iterativeOrchestratorMock as never,
  )

  return {
    orchestrator,
    agentSessionPort,
    permissionNarrativeBuilder,
    subAgentRegistry,
    routerPromptBuilder,
    subAgentRetriever,
    llmClient,
    parser,
    toolRegistry,
    kernelAuditFacade,
    kernelQueryFacade: kernelQueryFacadeMock,
    iterativeOrchestrator: iterativeOrchestratorMock,
    sessionCreated,
    auditEvents,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RouterSessionOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordRouterDecision.mockReset()
    mockRecordRouterParseRetry.mockReset()
    mockRecordSubAgentInvoked.mockReset()
    mockRecordTopologyDowngradeCandidateTotal.mockReset()
    // Default: return well below ceiling so retrieval is dormant in most tests
    vi.mocked(estimateTokens).mockReturnValue(1_000)
    // Reset span exporter between tests so spans don't bleed across test cases
    spanExporter.reset()
  })

  // ── 1. Happy path — new session ─────────────────────────────────────────────

  it('new session: creates session row, returns bounded plan with parseRetries=0', async () => {
    const { orchestrator, agentSessionPort, sessionCreated } = buildOrchestrator({
      existingSession: null,
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('bounded')
    expect(result.parseRetries).toBe(0)
    expect(result.sessionId).toBeDefined()
    expect(agentSessionPort.create).toHaveBeenCalledOnce()
    // Session was created with all 5 hashes
    const createArg = sessionCreated[0]
    expect(createArg).toHaveProperty('routerPromptHash')
    expect(createArg).toHaveProperty('permissionNarrativeHash')
    expect(createArg).toHaveProperty('toolCatalogHash')
    expect(createArg).toHaveProperty('directiveSchemaHash')
    expect(createArg).toHaveProperty('canonicalizerVersionHash')
  })

  // ── 2. Existing session — uses pinned hashes ─────────────────────────────────

  it('existing session: does NOT create a new session row', async () => {
    const session = makeSessionEntry({ routerPromptHash: 'rebuilt-prompt-hash' })
    const { orchestrator, agentSessionPort } = buildOrchestrator({
      existingSession: session,
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
      promptHash: 'rebuilt-prompt-hash', // matches pinned
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('bounded')
    expect(agentSessionPort.create).not.toHaveBeenCalled()
  })

  // ── 3. Retry path ──────────────────────────────────────────────────────────

  // NOTE: Plan 18 R-18.24 — LLM-call malformed results (from RouterLlmClient.generate)
  // now throw RouterLlmFailureError instead of triggering a retry. The
  // schema-parse retry path (parser.parsePlan returning kind: 'retry') is
  // preserved — see test below.

  it('retry: first parse returns retry → second LLM + parse succeeds → parseRetries=1', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [
        { kind: 'ok', plan: VALID_PLAN },
        { kind: 'ok', plan: VALID_PLAN },
      ],
      parseResults: [
        { kind: 'retry', reason: 'bad schema', schemaInjectedPrompt: 'fix your output' },
        { kind: 'ok', plan: VALID_PLAN },
      ],
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('bounded')
    if (result.kind === 'bounded') {
      expect(result.parseRetries).toBe(1)
    }
    expect(mockRecordRouterParseRetry).toHaveBeenCalledOnce()
  })

  // ── 4. Escalation ──────────────────────────────────────────────────────────

  // NOTE: Plan 18 R-18.24 — the "both LLM calls malformed → disambiguation"
  // path is gone; the first malformed result throws RouterLlmFailureError
  // before a retry is attempted. The escalation path that REMAINS is when
  // BOTH parser.parsePlan attempts return kind: 'retry' (see test below).

  it('escalation via parse: both parse calls return retry → escalate', async () => {
    const { orchestrator, kernelAuditFacade } = buildOrchestrator({
      llmResults: [
        { kind: 'ok', plan: VALID_PLAN },
        { kind: 'ok', plan: VALID_PLAN },
      ],
      parseResults: [
        { kind: 'retry', reason: 'fail1', schemaInjectedPrompt: 'fix' },
        { kind: 'retry', reason: 'fail2', schemaInjectedPrompt: 'fix again' },
      ],
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('disambiguation')
    expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'refusal.started' }),
    )
  })

  // ── 5. LLM-emitted disambiguation plan ────────────────────────────────────

  it('LLM-emitted disambiguation: disambiguation field set → disambiguation result, parseRetries=0', async () => {
    const { orchestrator, kernelAuditFacade } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: DISAMBIG_PLAN }],
      parseResults: [{ kind: 'ok', plan: DISAMBIG_PLAN }],
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      expect(result.reason).toBe('Did you mean tasks or plans?')
      expect(result.parseRetries).toBe(0)
    }
    expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'refusal.started',
        payload: expect.objectContaining({
          reason: 'disambiguation',
          underlying_reason: 'Did you mean tasks or plans?',
        }),
      }),
    )
    expect(mockRecordRouterDecision).toHaveBeenCalledWith(TENANT_ID, 'disambiguation')
  })

  // ── 6. Token-budget activation (R-02.26) ─────────────────────────────────

  it('token budget > ceiling: retriever is called, resolvedSubAgents narrowed', async () => {
    const allSubAgents = [
      makeResolvedSubAgent('planner.read-only', 'hash-1'),
      makeResolvedSubAgent('people.profile', 'hash-2'),
      makeResolvedSubAgent('projects.assignments', 'hash-3'),
    ]
    const narrowed = [allSubAgents[0]!.config, allSubAgents[1]!.config]

    const { orchestrator, subAgentRetriever, routerPromptBuilder } = buildOrchestrator({
      existingSession: null,
      resolvedSubAgents: allSubAgents,
      narrowedConfigs: narrowed,
    })

    // Override module-level estimateTokens to exceed ceiling (120_000)
    vi.mocked(estimateTokens).mockReturnValue(150_000)
    // Ensure retrieve returns only the two narrowed configs
    subAgentRetriever.retrieve.mockResolvedValue(narrowed)

    const result = await orchestrator.routeTurn(BASE_OPTS)

    // Retriever must have been called exactly once (gate triggered)
    expect(subAgentRetriever.retrieve).toHaveBeenCalledTimes(1)

    // The resolved set passed to the prompt builder must be the narrowed subset
    const buildCall = routerPromptBuilder.build.mock.calls[0]![0] as { subAgents: unknown[] }
    expect(buildCall.subAgents).toHaveLength(2)

    expect(result.kind).toBe('bounded')
  })

  // ── 7. Token-budget dormant (R-02.26) ────────────────────────────────────

  it('token budget <= ceiling: retriever NOT called', async () => {
    const { orchestrator, subAgentRetriever } = buildOrchestrator({
      existingSession: null,
    })

    // Module-level estimateTokens returns well below ceiling
    vi.mocked(estimateTokens).mockReturnValue(1_000)

    await orchestrator.routeTurn(BASE_OPTS)

    expect(subAgentRetriever.retrieve).not.toHaveBeenCalled()
  })

  // ── 8. Hash stability on existing session ─────────────────────────────────

  it('existing session: rebuilt hash matches pinned → proceeds normally', async () => {
    const session = makeSessionEntry({ routerPromptHash: 'the-hash' })
    const { orchestrator } = buildOrchestrator({
      existingSession: session,
      promptHash: 'the-hash', // matches
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('bounded')
  })

  // ── 9. Hash drift on existing session ────────────────────────────────────

  it('existing session: rebuilt hash != pinned → internal_hash_drift', async () => {
    const session = makeSessionEntry({ routerPromptHash: 'old-pinned-hash' })
    const { orchestrator } = buildOrchestrator({
      existingSession: session,
      promptHash: 'different-new-hash', // does NOT match
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      expect(result.reason).toBe('internal_hash_drift')
      expect(result.parseRetries).toBe(0)
    }
    expect(mockRecordRouterDecision).toHaveBeenCalledWith(TENANT_ID, 'disambiguation')
  })

  // ── 10. Audit event count: 2 phase1 + 1 phase2 = 3 events ────────────────

  it('emits 3 agent.sub_agent_invoked events for 2 phase1 + 1 phase2 plan', async () => {
    const plan = VALID_PLAN_2P1_1P2
    const { orchestrator, auditEvents } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan }],
      parseResults: [{ kind: 'ok', plan }],
      resolvedSubAgents: [
        makeResolvedSubAgent('planner.read-only', 'h1'),
        makeResolvedSubAgent('planner.read-only-2', 'h2'),
        makeResolvedSubAgent('planner.read-only-3', 'h3'),
      ],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    const invokedEvents = auditEvents.filter((e) => e.eventType === 'agent.sub_agent_invoked')
    expect(invokedEvents).toHaveLength(3)
    expect(
      invokedEvents.filter((e) => (e.payload as { phase: string }).phase === 'phase1'),
    ).toHaveLength(2)
    expect(
      invokedEvents.filter((e) => (e.payload as { phase: string }).phase === 'phase2'),
    ).toHaveLength(1)
  })

  // ── 11. Metric: routerDecisionsTotal ────────────────────────────────────

  it('records bounded_plan metric on bounded result', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    expect(mockRecordRouterDecision).toHaveBeenCalledWith(TENANT_ID, 'bounded_plan')
  })

  it('records disambiguation metric on LLM-emitted disambiguation', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: DISAMBIG_PLAN }],
      parseResults: [{ kind: 'ok', plan: DISAMBIG_PLAN }],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    expect(mockRecordRouterDecision).toHaveBeenCalledWith(TENANT_ID, 'disambiguation')
  })

  // ── 12. Parse retry metric ────────────────────────────────────────────────

  it('does NOT call recordRouterParseRetry on first-attempt success', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    expect(mockRecordRouterParseRetry).not.toHaveBeenCalled()
  })

  // ── Audit event payload correctness ──────────────────────────────────────

  it('audit events contain correct payload fields (R-02.23a)', async () => {
    const { orchestrator, auditEvents } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    const invokedEvents = auditEvents.filter((e) => e.eventType === 'agent.sub_agent_invoked')
    expect(invokedEvents).toHaveLength(1)
    const ev = invokedEvents[0]!
    const payload = ev.payload as Record<string, unknown>
    expect(payload['sub_agent_key']).toBe('planner.read-only')
    expect(payload['phase']).toBe('phase1')
    expect(payload['iteration']).toBeNull()
    expect(payload['caller_user_id']).toBe(USER_ID)
    expect(payload['role_key']).toBe('employee')
    expect(payload['turn_trace_id']).toBe(TURN_TRACE_ID)
  })

  // ── New session: 5 hashes are persisted ────────────────────────────────

  it('new session: all 5 hashes are persisted on create', async () => {
    const { orchestrator, agentSessionPort } = buildOrchestrator({ existingSession: null })

    await orchestrator.routeTurn(BASE_OPTS)

    expect(agentSessionPort.create).toHaveBeenCalledOnce()
    const arg = agentSessionPort.create.mock.calls[0]![0] as Record<string, unknown>
    expect(arg['routerPromptHash']).toBeDefined()
    expect(arg['permissionNarrativeHash']).toBeDefined()
    expect(arg['toolCatalogHash']).toBeDefined()
    expect(arg['directiveSchemaHash']).toBeDefined()
    expect(arg['canonicalizerVersionHash']).toBeDefined()
  })

  // ── 13. Span: escalation emits router-decision:parse with parse_outcome='escalate' ──

  it('escalation: emits router-decision:parse span with parse_outcome=escalate (Plan 02 §8)', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [
        { kind: 'ok', plan: VALID_PLAN },
        { kind: 'ok', plan: VALID_PLAN },
      ],
      parseResults: [
        { kind: 'retry', reason: 'fail1', schemaInjectedPrompt: 'fix' },
        { kind: 'retry', reason: 'fail2', schemaInjectedPrompt: 'fix again' },
      ],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    const finished = spanExporter.getFinishedSpans() as ReadableSpan[]
    const parseSpans = finished.filter((s) => s.name === 'router-decision:parse')

    // Both parse attempts return retry → escalation → parse_outcome='escalate'
    const escalateSpan = parseSpans.find((s) => s.attributes['parse_outcome'] === 'escalate')
    expect(escalateSpan).toBeDefined()
    expect(escalateSpan?.attributes['retry_round']).toBe(1)
  })

  // ── 14. LLM usage span attrs (F4 — R-02 follow-up) ────────────────────────

  it('LLM usage attrs appear on router-llm:call span when call succeeds', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: VALID_PLAN, usage: DEFAULT_LLM_USAGE }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    await orchestrator.routeTurn(BASE_OPTS)

    const finished = spanExporter.getFinishedSpans() as ReadableSpan[]
    const llmSpan = finished.find((s) => s.name === 'router-llm:call')
    expect(llmSpan).toBeDefined()
    expect(llmSpan?.attributes['agent.llm.usage.prompt_tokens']).toBe(
      DEFAULT_LLM_USAGE.promptTokens,
    )
    expect(llmSpan?.attributes['agent.llm.usage.completion_tokens']).toBe(
      DEFAULT_LLM_USAGE.completionTokens,
    )
    expect(llmSpan?.attributes['agent.llm.usage.total_tokens']).toBe(DEFAULT_LLM_USAGE.totalTokens)
  })

  // ── 15. Audit error boundary (P1.2) ────────────────────────────────────────

  it('audit error boundary: kernelAuditFacade.recordEvent throws → routeTurn still returns bounded ok', async () => {
    const { orchestrator, kernelAuditFacade } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    // Force all audit calls to throw
    kernelAuditFacade.recordEvent.mockRejectedValue(new Error('audit DB unavailable'))

    // Turn must still complete — audit failure must not abort the user turn
    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('bounded')
  })

  it('audit error boundary: recordEvent throws on parse-escalation → routeTurn returns disambiguation ok', async () => {
    const { orchestrator, kernelAuditFacade } = buildOrchestrator({
      llmResults: [
        { kind: 'ok', plan: VALID_PLAN },
        { kind: 'ok', plan: VALID_PLAN },
      ],
      parseResults: [
        { kind: 'retry', reason: 'fail1', schemaInjectedPrompt: 'fix' },
        { kind: 'retry', reason: 'fail2', schemaInjectedPrompt: 'fix again' },
      ],
    })

    kernelAuditFacade.recordEvent.mockRejectedValue(new Error('audit DB unavailable'))

    const result = await orchestrator.routeTurn(BASE_OPTS)

    // Still returns disambiguation even though audit threw
    expect(result.kind).toBe('disambiguation')
  })

  // ── 16. Metric error boundary (P1.2) ───────────────────────────────────────

  // ── Plan 18 R-18.24: typed throw on router LLM infra failures ───────────────

  it('Plan 18 R-18.24: LLM 5xx → throws RouterLlmFailureError(failureCause: llm_5xx)', async () => {
    const llm5xx = Object.assign(new Error('upstream 503'), { statusCode: 503 })
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'malformed', error: llm5xx, rawText: null }],
    })

    await expect(orchestrator.routeTurn(BASE_OPTS)).rejects.toBeInstanceOf(RouterLlmFailureError)
    await expect(orchestrator.routeTurn(BASE_OPTS)).rejects.toMatchObject({
      failureCause: 'llm_5xx',
    })
  })

  it('Plan 18 R-18.24: LLM timeout (AbortError) → failureCause: llm_timeout', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'malformed', error: abortErr, rawText: null }],
    })

    await expect(orchestrator.routeTurn(BASE_OPTS)).rejects.toMatchObject({
      failureCause: 'llm_timeout',
    })
  })

  it('Plan 18 R-18.24: LLM auth error (401) → failureCause: auth_error', async () => {
    const authErr = Object.assign(new Error('unauthorized'), { statusCode: 401 })
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'malformed', error: authErr, rawText: null }],
    })

    await expect(orchestrator.routeTurn(BASE_OPTS)).rejects.toMatchObject({
      failureCause: 'auth_error',
    })
  })

  it('Plan 18 R-18.24: LLM auth error (403) → failureCause: auth_error', async () => {
    const authErr = Object.assign(new Error('forbidden'), { statusCode: 403 })
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'malformed', error: authErr, rawText: null }],
    })

    await expect(orchestrator.routeTurn(BASE_OPTS)).rejects.toMatchObject({
      failureCause: 'auth_error',
    })
  })

  it('Plan 18 R-18.24: underlying error preserved on standard Error.cause', async () => {
    const origin = Object.assign(new Error('upstream 502'), { statusCode: 502 })
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'malformed', error: origin, rawText: null }],
    })

    await expect(orchestrator.routeTurn(BASE_OPTS)).rejects.toMatchObject({
      failureCause: 'llm_5xx',
      cause: origin,
    })
  })

  it('metric error boundary: recordRouterDecision throws → routeTurn still returns bounded ok', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: VALID_PLAN }],
      parseResults: [{ kind: 'ok', plan: VALID_PLAN }],
    })

    // Force the metric helper to throw
    mockRecordRouterDecision.mockImplementationOnce(() => {
      throw new Error('metrics provider unavailable')
    })

    const result = await orchestrator.routeTurn(BASE_OPTS)

    expect(result.kind).toBe('bounded')
  })
})

// ─── Plan 12 Task 5: Inline surface guard + permission gate ─────────────────

const ITERATIVE_PLAN: RouterPlan = {
  topology: 'iterative',
  intent_slug: 'planner.list-my-tasks',
  flow_id: FLOW_ID,
  initialDirective: {
    sub_agent_key: 'planner.read-only',
    input: { utterance: 'refine plan' },
    reason: 'iterative refinement',
  },
  completionCriteria: {
    scorerIds: ['scorer-det-1'],
    strategy: 'all',
    maxIterations: 3,
    hintToRouter: 'done when refined',
  },
}

describe('RouterSessionOrchestrator — Plan 12 Task 5: inline surface guard + permission gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordRouterDecision.mockReset()
    mockRecordRouterParseRetry.mockReset()
    mockRecordSubAgentInvoked.mockReset()
    mockRecordTopologyDowngradeCandidateTotal.mockReset()
    vi.mocked(estimateTokens).mockReturnValue(1_000)
    spanExporter.reset()
  })

  // ── 4. Inline surface + iterative plan → second iterative → disambiguation ──

  it('4a. inline surface + first iterative plan → re-invokes router with inline hint', async () => {
    // First parse returns iterative, second parse returns bounded
    const { orchestrator, llmClient } = buildOrchestrator({
      llmResults: [
        { kind: 'ok', plan: ITERATIVE_PLAN },
        { kind: 'ok', plan: VALID_PLAN }, // second call: router returns bounded
        { kind: 'ok', plan: VALID_PLAN }, // third call (after inline retry): bounded
      ],
      parseResults: [
        { kind: 'ok', plan: ITERATIVE_PLAN }, // attempt 1: iterative (inline surface → retry)
        { kind: 'ok', plan: VALID_PLAN }, // attempt 2: bounded — ok
      ],
    })

    const result = await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'inline',
    })

    // The router was re-invoked at least twice (original + inline hint call)
    expect(llmClient.generate).toHaveBeenCalledTimes(2)
    // Second LLM call's system prompt must contain the inline hint
    const secondCallArgs = llmClient.generate.mock.calls[1]![0] as { systemPrompt: string }
    expect(secondCallArgs.systemPrompt).toContain('Use bounded topology')
    // Final result should be bounded (second attempt returned bounded)
    expect(result.kind).toBe('bounded')
  })

  it('4b. inline surface + iterative AGAIN on second attempt → disambiguation', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [
        { kind: 'ok', plan: ITERATIVE_PLAN },
        { kind: 'ok', plan: ITERATIVE_PLAN }, // second call: still iterative
      ],
      parseResults: [
        { kind: 'ok', plan: ITERATIVE_PLAN }, // attempt 1: iterative
        { kind: 'ok', plan: ITERATIVE_PLAN }, // inline-retry attempt: still iterative
      ],
    })

    const result = await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'inline',
    })

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      expect(result.reason).toContain('inline')
    }
  })

  it('4c. global-chat surface + iterative plan → dispatches IterativeOrchestrator (no inline block)', async () => {
    const { orchestrator, iterativeOrchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      parseResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      canDoResult: true,
    })

    await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'global-chat',
    })

    expect(iterativeOrchestrator.execute).toHaveBeenCalledOnce()
  })

  // ── 5. canDo('agent.iterative') denied → disambiguation (not bounded downgrade) ──

  it('5a. canDo denied → returns disambiguation (not a silent bounded downgrade)', async () => {
    const { orchestrator, kernelQueryFacade, kernelAuditFacade } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      parseResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      canDoResult: false,
    })

    const result = await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'global-chat',
    })

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      // Must be explicit message about the feature gate — not a generic "parse error"
      expect(result.reason).toContain('iterative')
    }
    // canDo must have been called with the correct permission
    expect(kernelQueryFacade.canDo).toHaveBeenCalledWith(
      USER_ID,
      'agent.iterative',
      expect.objectContaining({ tenantId: TENANT_ID }),
    )
    // Audit event must be emitted on permission denial
    expect(kernelAuditFacade.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'refusal.started',
        payload: expect.objectContaining({
          underlying_reason: 'iterative_permission_denied',
        }),
      }),
    )
  })

  it('5b. canDo denied → IterativeOrchestrator NOT invoked', async () => {
    const { orchestrator, iterativeOrchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      parseResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      canDoResult: false,
    })

    await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'global-chat',
    })

    expect(iterativeOrchestrator.execute).not.toHaveBeenCalled()
  })

  it('5c. canDo granted + global-chat → IterativeOrchestrator.execute called with correct args', async () => {
    const mockIterativeResult: import('./phase-executor-contracts').PhaseExecutionResult = {
      kind: 'synthesized',
      answer: { text: 'mock iterative answer' },
      drafts: [],
    }
    const { orchestrator, iterativeOrchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      parseResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      canDoResult: true,
      iterativeOrchestratorResult: mockIterativeResult,
    })

    const result = await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'global-chat',
    })

    expect(iterativeOrchestrator.execute).toHaveBeenCalledOnce()
    const execCall = iterativeOrchestrator.execute.mock.calls[0]![0] as Record<string, unknown>
    expect(execCall['initialPlan']).toEqual(ITERATIVE_PLAN)
    expect(execCall['userUtterance']).toBe(BASE_OPTS.utterance)
    // Assert RouteTurnResult shape
    expect(result.kind).toBe('iterative')
    if (result.kind === 'iterative') {
      expect(result.result).toEqual(mockIterativeResult)
    }
  })

  // ── 6. Topology-downgrade signal (R-12.20, R-12.21) ─────────────────────────

  it('6a. iterative turn with routerReplanCount=1 → topology_downgrade_candidate span attr + metric', async () => {
    // Simulate the iterative orchestrator doing a bounded re-plan by incrementing
    // turnState.routerReplanCount to 1 during execution.
    const mockIterativeResult: import('./phase-executor-contracts').PhaseExecutionResult = {
      kind: 'synthesized',
      answer: { text: 'answer after replan' },
      drafts: [],
    }
    const { orchestrator, iterativeOrchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      parseResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      canDoResult: true,
    })

    // Override execute to also mutate turnState.routerReplanCount = 1
    iterativeOrchestrator.execute.mockImplementation(
      async (opts: { turnState: { routerReplanCount: 0 | 1 } }) => {
        opts.turnState.routerReplanCount = 1
        return mockIterativeResult
      },
    )

    const result = await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'global-chat',
    })

    expect(result.kind).toBe('iterative')
    // topology-downgrade metric must fire
    expect(mockRecordTopologyDowngradeCandidateTotal).toHaveBeenCalledOnce()
    expect(mockRecordTopologyDowngradeCandidateTotal).toHaveBeenCalledWith(TENANT_ID)
    // topology_downgrade_candidate span attribute must be set
    const finished = spanExporter.getFinishedSpans() as ReadableSpan[]
    const routerPlanSpan = finished.find((s) => s.name === 'ROUTER_PLAN')
    expect(routerPlanSpan?.attributes['topology_downgrade_candidate']).toBe(true)
  })

  it('6b. iterative turn with routerReplanCount=0 (no replan) → NO topology-downgrade signal', async () => {
    const { orchestrator } = buildOrchestrator({
      llmResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      parseResults: [{ kind: 'ok', plan: ITERATIVE_PLAN }],
      canDoResult: true,
      iterativeOrchestratorResult: {
        kind: 'synthesized',
        answer: { text: 'clean iterative answer' },
        drafts: [],
      },
    })

    const result = await orchestrator.routeTurn({
      ...BASE_OPTS,
      surface: 'global-chat',
    })

    expect(result.kind).toBe('iterative')
    // topology-downgrade metric must NOT fire when no re-plan happened
    expect(mockRecordTopologyDowngradeCandidateTotal).not.toHaveBeenCalled()
  })
})
