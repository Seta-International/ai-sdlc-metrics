/**
 * iterative-replanner.spec.ts — Plan 12 Task 3
 *
 * Unit tests for IterativeRePlanner.replan().
 *
 * The service calls the router LLM (via generateObject from the AI SDK) to
 * decide what to do after each supervisor-loop iteration. Tests mock
 * generateObject and createOpenAI so no real HTTP requests are made.
 *
 * Coverage:
 * 1. Happy path: LLM returns continue → nextDirective populated correctly
 * 2. LLM returns exit(complete) → { kind: 'exit', reason: 'complete' }
 * 3. LLM returns exit(stuck) → { kind: 'exit', reason: 'stuck' }
 * 4. LLM returns exit(disambiguation) with question → disambiguationQuestion populated
 * 5. First parse fails → retry with correction prompt → second parse succeeds → returns continue
 * 6. Both parses fail → returns { kind: 'exit', reason: 'disambiguation', disambiguationQuestion: 'Unable to determine next step.' }
 * 7. abortSignal is passed through to the LLM call
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock Vercel AI SDK ────────────────────────────────────────────────────────

const { mockGenerateObject, mockCreateOpenAI } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn()
  const mockCreateOpenAI = vi.fn(() => vi.fn(() => 'mock-language-model'))
  return { mockGenerateObject, mockCreateOpenAI }
})

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

// Ensure OPENAI_API_KEY is present for the test environment
vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')

import { IterativeRePlanner, FALLBACK_DISAMBIGUATION_MESSAGE } from './iterative-replanner'
import type { ReplanOpts, ReplanResult } from './iterative-replanner'
import type {
  PhaseExecutorTurnState,
  CompletionSpec,
  IterationRecord,
} from './phase-executor-contracts'
import type { SubAgentOutput } from './phase-executor-contracts'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTurnState(overrides: Partial<PhaseExecutorTurnState> = {}): PhaseExecutorTurnState {
  return {
    traceId: 'trace-001',
    tenantId: 'tenant-abc',
    userId: 'user-xyz',
    conversationId: 'conv-111',
    sessionId: 'sess-222',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
    iterationNumber: 1,
    ...overrides,
  }
}

function makeSubAgentOutput(summary = 'some output'): SubAgentOutput {
  return {
    kind: 'completed',
    summary,
    semantics: 'test semantics',
    confidence: 'high',
    sourceToolProvenance: [],
    structured: null,
    circuitBreakerState: {},
    usageTotals: {
      inputTokens: 100,
      outputTokens: 50,
      inputCachedRead: 0,
      inputCachedWrite: 0,
      outputReasoning: 0,
      costUsd: 0.001,
    },
  }
}

function makeIterationRecord(overrides: Partial<IterationRecord> = {}): IterationRecord {
  return {
    iterationNumber: 1,
    subAgentKey: 'planner.reader',
    directive: {
      sub_agent_key: 'planner.reader',
      input: { query: 'fetch tasks' },
      reason: 'Initial iteration',
    },
    output: makeSubAgentOutput('Found 3 open tasks'),
    scorerResults: [{ score: 0, passed: false, reason: 'threshold not met' }],
    isComplete: false,
    ...overrides,
  }
}

function makeCompletionSpec(overrides: Partial<CompletionSpec> = {}): CompletionSpec {
  return {
    scorerIds: ['task-completion-scorer'],
    strategy: 'all',
    maxIterations: 5,
    hintToRouter: 'Complete when all tasks are closed',
    ...overrides,
  }
}

function makeReplanOpts(overrides: Partial<ReplanOpts> = {}): ReplanOpts {
  return {
    turnState: makeTurnState(),
    priorIteration: makeIterationRecord(),
    iterationHistory: [],
    completionCriteria: makeCompletionSpec(),
    userUtterance: 'Close all my open tasks',
    abortSignal: new AbortController().signal,
    ...overrides,
  }
}

// ─── Mock LLM responses ───────────────────────────────────────────────────────

const MOCK_USAGE = {
  inputTokens: 120,
  outputTokens: 45,
  totalTokens: 165,
  inputTokenDetails: { noCacheTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 45, reasoningTokens: 0 },
}

function mockContinueResponse() {
  return {
    object: {
      action: 'continue',
      next_sub_agent_key: 'planner.writer',
      next_reason: 'Previous agent found tasks; now close them',
      next_input: { action: 'close', task_ids: [1, 2, 3] },
    },
    usage: MOCK_USAGE,
  }
}

function mockExitResponse(exitReason: 'complete' | 'stuck' | 'disambiguation', question?: string) {
  return {
    object: {
      action: 'exit',
      exit_reason: exitReason,
      ...(question ? { disambiguation_question: question } : {}),
    },
    usage: MOCK_USAGE,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IterativeRePlanner', () => {
  let replanner: IterativeRePlanner

  beforeEach(() => {
    replanner = new IterativeRePlanner()
    vi.clearAllMocks()
    mockCreateOpenAI.mockReturnValue(vi.fn(() => 'mock-language-model'))
  })

  // ── 0. onModuleInit API key guard ─────────────────────────────────────────

  it('0. onModuleInit throws when OPENAI_API_KEY and LOCAL_DEV are both absent', () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('LOCAL_DEV', '')
    const freshReplanner = new IterativeRePlanner()
    expect(() => freshReplanner.onModuleInit()).toThrow('OPENAI_API_KEY missing')
    // Restore the key for subsequent tests
    vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
    vi.unstubAllEnvs()
    vi.stubEnv('OPENAI_API_KEY', 'test-key-for-unit-tests')
  })

  it('0b. onModuleInit does not throw when OPENAI_API_KEY is present', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const freshReplanner = new IterativeRePlanner()
    expect(() => freshReplanner.onModuleInit()).not.toThrow()
  })

  it('0c. onModuleInit does not throw when LOCAL_DEV is set (even without OPENAI_API_KEY)', () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('LOCAL_DEV', 'true')
    const freshReplanner = new IterativeRePlanner()
    expect(() => freshReplanner.onModuleInit()).not.toThrow()
  })

  // ── 1. Happy path: continue ────────────────────────────────────────────────

  it('1. returns { kind: "continue", nextDirective } when LLM returns action=continue', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    const result = await replanner.replan(makeReplanOpts())

    expect(result.kind).toBe('continue')
    if (result.kind === 'continue') {
      expect(result.nextDirective.sub_agent_key).toBe('planner.writer')
      expect(result.nextDirective.reason).toBe('Previous agent found tasks; now close them')
      expect(result.nextDirective.input).toEqual({ action: 'close', task_ids: [1, 2, 3] })
    }
  })

  // ── 2. Exit: complete ──────────────────────────────────────────────────────

  it('2. returns { kind: "exit", reason: "complete" } when LLM returns exit_reason=complete', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockExitResponse('complete'))

    const result = await replanner.replan(makeReplanOpts())

    expect(result.kind).toBe('exit')
    if (result.kind === 'exit') {
      expect(result.reason).toBe('complete')
      expect(result.disambiguationQuestion).toBeUndefined()
    }
  })

  // ── 3. Exit: stuck ─────────────────────────────────────────────────────────

  it('3. returns { kind: "exit", reason: "stuck" } when LLM returns exit_reason=stuck', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockExitResponse('stuck'))

    const result = await replanner.replan(makeReplanOpts())

    expect(result.kind).toBe('exit')
    if (result.kind === 'exit') {
      expect(result.reason).toBe('stuck')
      expect(result.disambiguationQuestion).toBeUndefined()
    }
  })

  // ── 4. Exit: disambiguation with question ──────────────────────────────────

  it('4. returns disambiguationQuestion when LLM returns exit_reason=disambiguation with a question', async () => {
    mockGenerateObject.mockResolvedValueOnce(
      mockExitResponse('disambiguation', 'Which project should I close tasks for?'),
    )

    const result = await replanner.replan(makeReplanOpts())

    expect(result.kind).toBe('exit')
    if (result.kind === 'exit') {
      expect(result.reason).toBe('disambiguation')
      expect(result.disambiguationQuestion).toBe('Which project should I close tasks for?')
    }
  })

  // ── 5. Parse-retry: first fails, second succeeds ───────────────────────────

  it('5. retries once when first parse fails; returns continue on second success', async () => {
    // First call: generateObject throws (malformed response)
    mockGenerateObject.mockRejectedValueOnce(new Error('NoObjectGeneratedError: invalid JSON'))
    // Second call: returns valid continue response
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    const result = await replanner.replan(makeReplanOpts())

    expect(mockGenerateObject).toHaveBeenCalledTimes(2)
    expect(result.kind).toBe('continue')
    if (result.kind === 'continue') {
      expect(result.nextDirective.sub_agent_key).toBe('planner.writer')
    }
  })

  it('5b. second call includes error-correction prompt context', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('schema mismatch'))
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    await replanner.replan(makeReplanOpts())

    // The second call should include a correction message (user message references prior failure)
    const secondCallArgs = mockGenerateObject.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const userMsg = secondCallArgs.messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toContain('schema mismatch')
  })

  // ── 6. Both parses fail → fallback exit ───────────────────────────────────

  it('6. returns { kind: "exit", reason: "disambiguation", disambiguationQuestion: FALLBACK_DISAMBIGUATION_MESSAGE } when both calls fail', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('first failure'))
    mockGenerateObject.mockRejectedValueOnce(new Error('second failure'))

    const result = await replanner.replan(makeReplanOpts())

    expect(mockGenerateObject).toHaveBeenCalledTimes(2)
    expect(result.kind).toBe('exit')
    if (result.kind === 'exit') {
      expect(result.reason).toBe('disambiguation')
      expect(result.disambiguationQuestion).toBe(FALLBACK_DISAMBIGUATION_MESSAGE)
    }
  })

  // ── 7. abortSignal is passed through ──────────────────────────────────────

  it('7. passes the abortSignal through to the generateObject call', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    const controller = new AbortController()
    const opts = makeReplanOpts({ abortSignal: controller.signal })

    await replanner.replan(opts)

    const callArgs = mockGenerateObject.mock.calls[0][0] as { abortSignal?: AbortSignal }
    expect(callArgs.abortSignal).toBe(controller.signal)
  })

  // ── Additional: prompt content sanity checks ──────────────────────────────

  it('includes the user utterance in the LLM prompt', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    await replanner.replan(makeReplanOpts({ userUtterance: 'Close all my open tasks' }))

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const allContent = callArgs.messages.map((m) => m.content).join('\n')
    expect(allContent).toContain('Close all my open tasks')
  })

  it('includes the completion criteria hint in the LLM prompt', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    const completionCriteria = makeCompletionSpec({
      hintToRouter: 'Complete when all tasks are closed',
    })
    await replanner.replan(makeReplanOpts({ completionCriteria }))

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      system?: string
      messages: Array<{ role: string; content: string }>
    }
    const allContent = [callArgs.system ?? '', ...callArgs.messages.map((m) => m.content)].join(
      '\n',
    )
    expect(allContent).toContain('Complete when all tasks are closed')
  })

  it('includes the prior iteration summary in the LLM prompt', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    // makeIterationRecord defaults output.summary to 'Found 3 open tasks'
    const priorIteration = makeIterationRecord()
    await replanner.replan(makeReplanOpts({ priorIteration }))

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const allContent = callArgs.messages.map((m) => m.content).join('\n')
    expect(allContent).toContain('Found 3 open tasks')
  })

  // ── History section inclusion ─────────────────────────────────────────────

  it('8. includes iterationHistory in the LLM prompt when non-empty', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    const historyRecord1 = makeIterationRecord({
      iterationNumber: 1,
      subAgentKey: 'planner.reader',
      output: makeSubAgentOutput('Retrieved task list from the board'),
      isComplete: false,
    })
    const historyRecord2 = makeIterationRecord({
      iterationNumber: 2,
      subAgentKey: 'planner.analyzer',
      output: makeSubAgentOutput('Identified 5 overdue tasks needing closure'),
      isComplete: false,
    })

    const priorIteration = makeIterationRecord({
      iterationNumber: 3,
      subAgentKey: 'planner.writer',
      output: makeSubAgentOutput('Closed 3 out of 5 tasks'),
      isComplete: false,
    })

    await replanner.replan(
      makeReplanOpts({
        iterationHistory: [historyRecord1, historyRecord2],
        priorIteration,
      }),
    )

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const allContent = callArgs.messages.map((m) => m.content).join('\n')

    // History section header
    expect(allContent).toContain('Iteration history')
    // First history entry
    expect(allContent).toContain('sub-agent=planner.reader')
    expect(allContent).toContain('Retrieved task list from the board')
    // Second history entry
    expect(allContent).toContain('sub-agent=planner.analyzer')
    expect(allContent).toContain('Identified 5 overdue tasks needing closure')
    // Prior iteration still present
    expect(allContent).toContain('Closed 3 out of 5 tasks')
  })

  it('8b. omits the history section when iterationHistory is empty', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    await replanner.replan(makeReplanOpts({ iterationHistory: [] }))

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const allContent = callArgs.messages.map((m) => m.content).join('\n')
    expect(allContent).not.toContain('Iteration history')
  })

  it('8c. caps iterationHistory to the last 5 entries', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    // Build 7 history entries — only the last 5 should appear in the prompt
    const history: IterationRecord[] = Array.from({ length: 7 }, (_, i) =>
      makeIterationRecord({
        iterationNumber: i + 1,
        subAgentKey: `agent.step${i + 1}`,
        output: makeSubAgentOutput(`Output of step ${i + 1}`),
      }),
    )

    await replanner.replan(makeReplanOpts({ iterationHistory: history }))

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const allContent = callArgs.messages.map((m) => m.content).join('\n')

    // Entries 1 and 2 should be dropped (beyond cap of 5)
    expect(allContent).not.toContain('agent.step1')
    expect(allContent).not.toContain('agent.step2')
    // Entries 3–7 should be present
    expect(allContent).toContain('agent.step3')
    expect(allContent).toContain('agent.step7')
  })

  it('8d. truncates long summaries in history to ~200 chars', async () => {
    mockGenerateObject.mockResolvedValueOnce(mockContinueResponse())

    const longSummary = 'x'.repeat(300)
    const historyRecord = makeIterationRecord({
      iterationNumber: 1,
      output: makeSubAgentOutput(longSummary),
    })

    await replanner.replan(makeReplanOpts({ iterationHistory: [historyRecord] }))

    const callArgs = mockGenerateObject.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const allContent = callArgs.messages.map((m) => m.content).join('\n')

    // The full 300-char summary should NOT appear verbatim; truncation marker should be present
    expect(allContent).not.toContain(longSummary)
    expect(allContent).toContain('…')
  })
})
