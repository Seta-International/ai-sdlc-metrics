/**
 * router-session-orchestrator.integration.spec.ts — Plan 02 Task 12
 * End-to-end integration tests for the router pipeline.
 *
 * Exercises REAL components:
 *   SubAgentRegistry, IntentRegistry, SubAgentRetriever,
 *   RouterPromptBuilder, RouterDecisionParser, PermissionNarrativeBuilder.
 *
 * Mocked:
 *   RouterLlmClient    — scripted vi.fn() returning planned results
 *   KernelQueryFacade  — in-memory permission map (no real DB)
 *   NarrativeStore     — InMemoryNarrativeStore (hash-keyed Map)
 *   AgentSessionPort   — InMemoryAgentSessionStore (Map-backed)
 *   KernelAuditFacade  — InMemoryAuditCapture (array of events)
 *
 * OTel traces + metrics use in-memory exporters throughout.
 *
 * Cases:
 *   1.  Happy path first turn — session created with 5 hashes, spans emitted.
 *   2.  Second turn — narrative cache hit (from_cache: true).
 *   3.  Registry freeze — session hashes stable when registry is separate instance.
 *   4.  Cross-tenant — permission_narrative_hash differs by tenant.
 *   5.  Malformed-then-valid retry — parseRetries=1, metric incremented.
 *   6.  Double parse failure — disambiguation + parse_escalated metric.
 *   7.  LLM-emitted disambiguation plan — disambiguation result, parseRetries=0.
 *   8.  Fuzzy-repair rejected (parser rejects malformed) — retry loop triggered.
 *   9.  Module toggle filter — hiring sub-agent dropped, span attr present.
 *  10.  Empty-permission-scope filter — sub-agent dropped, metric emitted.
 *  11.  Sub-agent-invoked audit count — 3 events for 2 phase1 + 1 phase2.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { trace } from '@opentelemetry/api'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import {
  initOtel,
  resetOtel,
  spanExporter,
  flushMetricPoints,
  InMemoryAgentSessionStore,
  InMemoryNarrativeStore,
  InMemoryAuditCapture,
  makeSubAgentFixture,
  makeIntentFixture,
  bootRegistries,
  buildRealOrchestrator,
} from './router-test-harness'
import type { RouterLlmResult } from './router-test-harness'
import type { RouteTurnOpts } from './router-session-orchestrator'
import { RouterLlmFailureError } from './pipeline-errors'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'

// ─── OTel setup ──────────────────────────────────────────────────────────────

beforeAll(() => {
  initOtel()
})

afterAll(async () => {
  await trace.getTracerProvider().shutdown?.()
})

beforeEach(() => {
  resetOtel()
})

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TENANT_A = '00000000-0000-7000-8000-000000000001'
const TENANT_B = '00000000-0000-7000-8000-000000000002'
const USER_ID = '00000000-0000-7000-8000-000000000010'
const CONVERSATION_ID = '00000000-0000-7000-8000-000000000020'
const TURN_TRACE_ID = '00000000-0000-7000-8000-000000000030'
const FLOW_ID = '018e8b2a-4c1d-7000-8000-000000000001'

// Sub-agent fixtures
const PLANNER_READ_ONLY = makeSubAgentFixture({
  key: 'planner.read-only',
  toolScope: ['planner.personal.listTasks'],
})
const PEOPLE_READER = makeSubAgentFixture({
  key: 'people.profile-reader',
  toolScope: ['people.profile.read'],
})
const HIRING_AGENT = makeSubAgentFixture({
  key: 'hiring.somebody-read',
  toolScope: ['hiring.somebody.read'],
})

// Intent fixtures
const INTENT_LIST_TASKS = makeIntentFixture('planner.list-my-tasks', 'planner')
const INTENT_VIEW_PROFILE = makeIntentFixture('people.view-profile', 'people')
const INTENT_UNCLASSIFIED = makeIntentFixture('unclassified', 'agents')

// Standard set of registries (no hiring module)
const STANDARD_REGISTRIES = bootRegistries({
  subAgents: [PLANNER_READ_ONLY, PEOPLE_READER],
  intents: [INTENT_LIST_TASKS, INTENT_VIEW_PROFILE, INTENT_UNCLASSIFIED],
})

// Permission map: employee role has planner + people permissions
const EMPLOYEE_PERMISSIONS = {
  employee: ['planner:personal:listTasks', 'people:profile:read'],
}

function makeTurnOpts(overrides?: Partial<RouteTurnOpts>): RouteTurnOpts {
  return {
    tenantId: TENANT_A,
    userId: USER_ID,
    roleKey: 'employee',
    roleAllowedPermissions: new Set(['planner:personal:listTasks', 'people:profile:read']),
    enabledModules: new Set(['planner', 'people']),
    surface: 'global-chat',
    conversationId: CONVERSATION_ID,
    turnTraceId: TURN_TRACE_ID,
    utterance: 'show my tasks',
    recentSummary: { verbatim: [], compressed: [], rolling: null },
    promptVariables: new Map<SubAgentKey, Record<string, unknown>>(),
    ...overrides,
  }
}

function makePlan(overrides?: Partial<RouterPlan>): RouterPlan {
  return {
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
    ...overrides,
  }
}

// ─── Case 1: Happy path first turn ───────────────────────────────────────────

describe('Case 1: Happy path first turn', () => {
  it('creates session with all 5 hashes, emits expected spans', async () => {
    const plan = makePlan()
    const { orchestrator, sessionStore } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    const result = await orchestrator.routeTurn(makeTurnOpts())

    expect(result.kind).toBe('bounded')
    expect(result.parseRetries).toBe(0)

    // Session must be created with all 5 hashes populated
    const sessions = sessionStore.all()
    expect(sessions).toHaveLength(1)
    const session = sessions[0]!
    expect(session.routerPromptHash).toBeTruthy()
    expect(session.permissionNarrativeHash).toBeTruthy()
    expect(session.toolCatalogHash).toBeTruthy()
    expect(session.directiveSchemaHash).toBeTruthy()
    expect(session.canonicalizerVersionHash).toBeTruthy()

    // Spans: permission-narrative:build, router-prompt:build, router-llm:call, router-decision:parse
    const spans = spanExporter.getFinishedSpans() as ReadableSpan[]
    const spanNames = spans.map((s) => s.name)
    expect(spanNames).toContain('permission-narrative:build')
    expect(spanNames).toContain('router-prompt:build')
    expect(spanNames).toContain('router-llm:call')
    expect(spanNames).toContain('router-decision:parse')

    // permission-narrative:build span must have from_cache: false on first turn
    const narrativeSpan = spans.find((s) => s.name === 'permission-narrative:build')
    expect(narrativeSpan?.attributes['from_cache']).toBe(false)
  })
})

// ─── Case 2: Second turn cache hit ────────────────────────────────────────────

describe('Case 2: Second turn — narrative cache hit', () => {
  it('second call with same conversationId shows from_cache: true', async () => {
    const plan = makePlan()
    const sessionStore = new InMemoryAgentSessionStore()
    const narrativeStore = new InMemoryNarrativeStore()

    // First turn
    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [
        { kind: 'ok', plan },
        { kind: 'ok', plan },
      ],
      sessionStore,
      narrativeStore,
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    await orchestrator.routeTurn(makeTurnOpts())

    // Reset spans before second turn
    resetOtel()

    // Second turn — same conversation, same orchestrator (same session)
    await orchestrator.routeTurn(makeTurnOpts())

    const spans = spanExporter.getFinishedSpans() as ReadableSpan[]
    const narrativeSpan = spans.find((s) => s.name === 'permission-narrative:build')

    // fromCache=true because the narrative hash is already in the store
    expect(narrativeSpan?.attributes['from_cache']).toBe(true)

    // Session row should still be only 1 (not duplicated)
    expect(sessionStore.all()).toHaveLength(1)
  })
})

// ─── Case 3: Registry freeze — hashes stable ─────────────────────────────────

describe('Case 3: Registry freeze — mid-session registry change does not affect session', () => {
  it('a fresh registry instance does not change existing session hashes', async () => {
    const plan = makePlan()
    const sessionStore = new InMemoryAgentSessionStore()

    // Use the STANDARD_REGISTRIES for first turn
    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      sessionStore,
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    const result1 = await orchestrator.routeTurn(makeTurnOpts())
    const pinnedHash = sessionStore.all()[0]!.routerPromptHash

    // Boot a new registry with an EXTRA sub-agent
    const EXTRA_SA = makeSubAgentFixture({
      key: 'goals.okr-viewer',
      toolScope: ['goals.okr.read'],
    })
    const EXTENDED_REGISTRIES = bootRegistries({
      subAgents: [PLANNER_READ_ONLY, PEOPLE_READER, EXTRA_SA],
      intents: [INTENT_LIST_TASKS, INTENT_VIEW_PROFILE, INTENT_UNCLASSIFIED],
    })

    // Second orchestrator bound to the extended registry — but same session
    const { orchestrator: orchestrator2 } = buildRealOrchestrator({
      registries: EXTENDED_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      sessionStore, // shares session store — finds the existing session
      permissionsByRole: {
        ...EMPLOYEE_PERMISSIONS,
        employee: [...EMPLOYEE_PERMISSIONS.employee, 'goals:okr:read'],
      },
    })

    resetOtel()

    // Second turn on existing session — hash drift will be detected because
    // the extended registry produces a different routerPromptHash
    const result2 = await orchestrator2.routeTurn(
      makeTurnOpts({
        enabledModules: new Set(['planner', 'people', 'goals']),
        roleAllowedPermissions: new Set([
          'planner:personal:listTasks',
          'people:profile:read',
          'goals:okr:read',
        ]),
      }),
    )

    // The original session's routerPromptHash was pinned with 2 sub-agents.
    // The extended registry produces a different hash → hash drift → disambiguation.
    // This proves the session is immutable post-creation (pinning works).
    expect(result2.kind).toBe('disambiguation')
    if (result2.kind === 'disambiguation') {
      expect(result2.reason).toBe('internal_hash_drift')
    }

    // Original pinned hash is unchanged
    expect(sessionStore.all()[0]!.routerPromptHash).toBe(pinnedHash)

    // First result was bounded (no hash drift on initial creation)
    expect(result1.kind).toBe('bounded')
  })
})

// ─── Case 4: Cross-tenant — narrative hashes differ ──────────────────────────

describe('Case 4: Cross-tenant narrative hash isolation', () => {
  it('tenant A and B with different permissions produce different narrative hashes', async () => {
    const plan = makePlan()

    const sessionStoreA = new InMemoryAgentSessionStore()
    const sessionStoreB = new InMemoryAgentSessionStore()
    // Separate narrative stores: different tenants may have different narratives
    const narrativeStoreA = new InMemoryNarrativeStore()
    const narrativeStoreB = new InMemoryNarrativeStore()

    const { orchestrator: orchA } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      sessionStore: sessionStoreA,
      narrativeStore: narrativeStoreA,
      permissionsByRole: { employee: ['planner:personal:listTasks'] }, // only planner
    })

    const { orchestrator: orchB } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      sessionStore: sessionStoreB,
      narrativeStore: narrativeStoreB,
      permissionsByRole: {
        employee: ['planner:personal:listTasks', 'people:profile:read'], // planner + people
      },
    })

    const CONVO_B = '00000000-0000-7000-8000-000000000099'

    await orchA.routeTurn(makeTurnOpts({ tenantId: TENANT_A }))
    await orchB.routeTurn(
      makeTurnOpts({
        tenantId: TENANT_B,
        conversationId: CONVO_B,
        roleAllowedPermissions: new Set(['planner:personal:listTasks', 'people:profile:read']),
      }),
    )

    const hashA = sessionStoreA.all()[0]!.permissionNarrativeHash
    const hashB = sessionStoreB.all()[0]!.permissionNarrativeHash

    // Different permissions → different narrative text → different content hash
    expect(hashA).not.toBe(hashB)
  })
})

// ─── Case 5: LLM infra failure throws RouterLlmFailureError (Plan 18 R-18.24) ──

describe('Case 5: Router LLM infra failure throws RouterLlmFailureError', () => {
  it('LLM call malformed (timeout) → throws RouterLlmFailureError(failureCause: llm_timeout)', async () => {
    const llmResults: RouterLlmResult[] = [
      {
        kind: 'malformed',
        error: Object.assign(new Error('sdk timeout'), { name: 'AbortError' }),
        rawText: null,
      },
    ]

    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults,
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    await expect(orchestrator.routeTurn(makeTurnOpts())).rejects.toBeInstanceOf(
      RouterLlmFailureError,
    )
    await expect(orchestrator.routeTurn(makeTurnOpts())).rejects.toMatchObject({
      failureCause: 'llm_timeout',
    })
  })
})

// ─── Case 6: Double parse failure → disambiguation ────────────────────────────

describe('Case 6: Double parse failure → escalation', () => {
  it('both parser results return retry → disambiguation, parse_escalated metric, audit event', async () => {
    // Plan 18 R-18.24 — LLM-call infra failures now throw. The escalation
    // path remaining is a structural parse failure on both attempts. We feed
    // two `kind: 'ok'` results that carry a structurally invalid RouterPlan
    // (missing required fields) so the real RouterDecisionParser returns
    // `kind: 'retry'` for both attempts → escalation.
    const invalidPlan = { topology: 'bounded' } as unknown as RouterPlan
    const llmResults: RouterLlmResult[] = [
      { kind: 'ok', plan: invalidPlan },
      { kind: 'ok', plan: invalidPlan },
    ]

    const auditCapture = new InMemoryAuditCapture()
    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults,
      auditCapture,
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    const result = await orchestrator.routeTurn(makeTurnOpts())

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      expect(result.parseRetries).toBe(1)
      expect(result.reason).toBe('parse_escalated_after_retry')
    }

    // Audit event must be emitted with refusal.started type (Plan 06 cross-ref, R-02.23)
    const disambigEvents = auditCapture.ofType('refusal.started')
    expect(disambigEvents).toHaveLength(1)
    expect(disambigEvents[0]!.tenantId).toBe(TENANT_A)
    expect((disambigEvents[0]!.payload as Record<string, unknown>)['reason']).toBe('disambiguation')

    // Metric: agent_router_decisions_total{outcome:'parse_escalated'}
    const decisionPoints = await flushMetricPoints('agent_router_decisions_total')
    const escalatedPoint = decisionPoints.find(
      (p) =>
        p.attributes['tenant_id'] === TENANT_A && p.attributes['outcome'] === 'parse_escalated',
    )
    expect(escalatedPoint).toBeDefined()
    expect(escalatedPoint!.value).toBe(1)

    // Span: router-decision:parse with parse_outcome='escalate'
    const spans = spanExporter.getFinishedSpans() as ReadableSpan[]
    const escalateSpan = spans.find(
      (s) => s.name === 'router-decision:parse' && s.attributes['parse_outcome'] === 'escalate',
    )
    expect(escalateSpan).toBeDefined()
  })
})

// ─── Case 7: LLM-emitted disambiguation plan ─────────────────────────────────

describe('Case 7: LLM-emitted disambiguation plan', () => {
  it('LLM returns plan with disambiguation field → disambiguation result, parseRetries=0', async () => {
    const disambigPlan: RouterPlan = {
      topology: 'bounded',
      intent_slug: 'unclassified',
      flow_id: FLOW_ID,
      phase1: [],
      phase2: [],
      disambiguation: 'Did you mean tasks or plans?',
    }

    const auditCapture = new InMemoryAuditCapture()
    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [{ kind: 'ok', plan: disambigPlan }],
      auditCapture,
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    const result = await orchestrator.routeTurn(makeTurnOpts())

    expect(result.kind).toBe('disambiguation')
    if (result.kind === 'disambiguation') {
      expect(result.reason).toBe('Did you mean tasks or plans?')
      expect(result.parseRetries).toBe(0)
    }

    // Audit event must be emitted for disambiguation (refusal.started per Plan 06 cross-ref)
    const disambigEvents = auditCapture.ofType('refusal.started')
    expect(disambigEvents).toHaveLength(1)
  })
})

// ─── Case 8: Parser-retry loop on structurally invalid first plan ─────────────

describe('Case 8: Parser-retry loop — first plan invalid, second valid → bounded', () => {
  it('invalid plan → parser returns retry → orchestrator retries → second attempt succeeds', async () => {
    // Plan 18 R-18.24 — LLM-call malformed now throws. The retained retry
    // semantics are around the parser: a structurally invalid `kind: 'ok'`
    // plan triggers parser.parsePlan to return `kind: 'retry'`, the
    // orchestrator retries, and the second valid plan completes the turn.
    const plan = makePlan()
    const invalidPlan = { topology: 'bounded' } as unknown as RouterPlan
    const llmResults: RouterLlmResult[] = [
      { kind: 'ok', plan: invalidPlan },
      { kind: 'ok', plan },
    ]

    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults,
      permissionsByRole: EMPLOYEE_PERMISSIONS,
    })

    const result = await orchestrator.routeTurn(makeTurnOpts())

    // Parser correctly rejected and orchestrator retried → success on attempt 2
    expect(result.kind).toBe('bounded')
    if (result.kind === 'bounded') {
      expect(result.parseRetries).toBe(1)
    }
  })
})

// ─── Case 9: Module toggle filter ─────────────────────────────────────────────

describe('Case 9: Module toggle filter', () => {
  it('hiring sub-agent dropped when hiring module disabled', async () => {
    // Registry includes hiring sub-agent
    const HIRING_REGISTRIES = bootRegistries({
      subAgents: [PLANNER_READ_ONLY, HIRING_AGENT],
      intents: [INTENT_LIST_TASKS, INTENT_UNCLASSIFIED],
    })

    const plan = makePlan()
    const sessionStore = new InMemoryAgentSessionStore()

    const { orchestrator } = buildRealOrchestrator({
      registries: HIRING_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      sessionStore,
      permissionsByRole: {
        employee: ['planner:personal:listTasks', 'hiring:somebody:read'],
      },
    })

    // Call with HIRING module disabled
    await orchestrator.routeTurn(
      makeTurnOpts({
        enabledModules: new Set(['planner']), // hiring disabled
        roleAllowedPermissions: new Set(['planner:personal:listTasks']),
      }),
    )

    // Metric: agent_sub_agent_hidden_total{reason:'module_disabled'}
    const hiddenPoints = await flushMetricPoints('agent_sub_agent_hidden_total')
    const moduleDisabledPoint = hiddenPoints.find(
      (p) => p.attributes['tenant_id'] === TENANT_A && p.attributes['reason'] === 'module_disabled',
    )
    expect(moduleDisabledPoint).toBeDefined()
    expect(moduleDisabledPoint!.value).toBeGreaterThanOrEqual(1)

    // Span attribute must contain the hidden sub-agent info
    const spans = spanExporter.getFinishedSpans() as ReadableSpan[]
    // The ROUTER_PLAN parent span or any span from resolveForSession should have
    // the agent.router.sub_agent_hidden_by_module attribute
    const spanWithHidden = spans.find((s) => {
      const attr = s.attributes['agent.router.sub_agent_hidden_by_module']
      return attr !== undefined && attr !== '[]' && attr !== ''
    })
    expect(spanWithHidden).toBeDefined()
  })
})

// ─── Case 10: Empty-permission-scope filter ────────────────────────────────────

describe('Case 10: Empty-permission-scope filter', () => {
  it('sub-agent dropped when role has no matching permissions', async () => {
    // Both sub-agents registered, but role only permits planner (not people)
    const sessionStore = new InMemoryAgentSessionStore()
    const plan = makePlan()

    const { orchestrator } = buildRealOrchestrator({
      registries: STANDARD_REGISTRIES,
      llmResults: [{ kind: 'ok', plan }],
      sessionStore,
      permissionsByRole: {
        employee: ['planner:personal:listTasks'], // people permission MISSING
      },
    })

    await orchestrator.routeTurn(
      makeTurnOpts({
        enabledModules: new Set(['planner', 'people']),
        roleAllowedPermissions: new Set(['planner:personal:listTasks']), // no people perm
      }),
    )

    // Metric: agent_sub_agent_hidden_total{reason:'permission_empty_scope'}
    const hiddenPoints = await flushMetricPoints('agent_sub_agent_hidden_total')
    const permPoint = hiddenPoints.find(
      (p) =>
        p.attributes['tenant_id'] === TENANT_A &&
        p.attributes['reason'] === 'permission_empty_scope',
    )
    expect(permPoint).toBeDefined()
    expect(permPoint!.value).toBeGreaterThanOrEqual(1)

    // Span attr: agent.router.sub_agent_hidden_by_permission should be non-empty
    const spans = spanExporter.getFinishedSpans() as ReadableSpan[]
    const spanWithPerm = spans.find((s) => {
      const attr = s.attributes['agent.router.sub_agent_hidden_by_permission']
      return attr !== undefined && attr !== '[]' && attr !== ''
    })
    expect(spanWithPerm).toBeDefined()
  })
})

// ─── Case 11: Sub-agent-invoked audit count ────────────────────────────────────

// Isolated tenant ID so cumulative metric counts don't bleed from other cases.
const TENANT_C11 = '00000000-0000-7000-8000-000000000011'

describe('Case 11: Sub-agent-invoked audit count (R-02.23a)', () => {
  it('2 phase1 + 1 phase2 → exactly 3 agent.sub_agent_invoked events', async () => {
    // Need 3 sub-agents in the registry
    const SA3 = makeSubAgentFixture({
      key: 'people.org-viewer',
      toolScope: ['people.org.read'],
    })

    const THREE_AGENT_REGISTRIES = bootRegistries({
      subAgents: [PLANNER_READ_ONLY, PEOPLE_READER, SA3],
      intents: [INTENT_LIST_TASKS, INTENT_VIEW_PROFILE, INTENT_UNCLASSIFIED],
    })

    const multiDirectivePlan: RouterPlan = {
      topology: 'bounded',
      intent_slug: 'planner.list-my-tasks',
      flow_id: FLOW_ID,
      phase1: [
        { sub_agent_key: 'planner.read-only', input: {}, reason: 'r1' },
        { sub_agent_key: 'people.profile-reader', input: {}, reason: 'r2' },
      ],
      phase2: [{ sub_agent_key: 'people.org-viewer', input: {}, reason: 'r3' }],
    }

    const auditCapture = new InMemoryAuditCapture()
    const { orchestrator } = buildRealOrchestrator({
      registries: THREE_AGENT_REGISTRIES,
      llmResults: [{ kind: 'ok', plan: multiDirectivePlan }],
      auditCapture,
      permissionsByRole: {
        employee: ['planner:personal:listTasks', 'people:profile:read', 'people:org:read'],
      },
    })

    const CONVO_C11 = '00000000-0000-7000-8000-000000000011'
    await orchestrator.routeTurn(
      makeTurnOpts({
        tenantId: TENANT_C11,
        conversationId: CONVO_C11,
        enabledModules: new Set(['planner', 'people']),
        roleAllowedPermissions: new Set([
          'planner:personal:listTasks',
          'people:profile:read',
          'people:org:read',
        ]),
      }),
    )

    const invokedEvents = auditCapture.ofType('agent.sub_agent_invoked')
    expect(invokedEvents).toHaveLength(3)

    const phase1Events = invokedEvents.filter(
      (e) => (e.payload as { phase: string }).phase === 'phase1',
    )
    const phase2Events = invokedEvents.filter(
      (e) => (e.payload as { phase: string }).phase === 'phase2',
    )
    expect(phase1Events).toHaveLength(2)
    expect(phase2Events).toHaveLength(1)

    // Verify payload fields on one event (R-02.23a)
    const ev = phase1Events[0]!
    const payload = ev.payload as Record<string, unknown>
    expect(payload['sub_agent_key']).toBeDefined()
    expect(payload['turn_trace_id']).toBe(TURN_TRACE_ID)
    expect(payload['caller_user_id']).toBe(USER_ID)
    expect(payload['role_key']).toBe('employee')

    // Metric: agent_sub_agent_invoked_total scoped to this test's unique tenant.
    // Using TENANT_C11 (unique to this case) prevents cumulative bleed from other cases.
    const invokedPoints = await flushMetricPoints('agent_sub_agent_invoked_total')
    const totalInvoked = invokedPoints
      .filter((p) => p.attributes['tenant_id'] === TENANT_C11)
      .reduce((sum, p) => sum + p.value, 0)
    expect(totalInvoked).toBe(3)
  })
})
