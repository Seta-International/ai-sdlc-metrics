/**
 * AgentTurnController — live-pipeline integration spec (Plan 18 Task 10).
 *
 * Goal: end-to-end smoke of the live turn pipeline composed in Plan 18 —
 * controller → router → BoundedExecutor → streaming synthesizer → SSE — with
 * a real DB (RLS), real SaveQueue, real ToolGateway, and three scripted LLM
 * clients (router / sub-agent / synthesizer) overriding their provider tokens.
 *
 * Scope decision (per Plan 18 Task 10 implementer-note "mark `it.todo` if the
 * integration bootstrap is too involved"):
 *
 *   Bootstrap obstacles encountered while attempting the happy path:
 *
 *     1. AgentsModule is a 1208-line module wiring ~80 providers including
 *        KernelAuditFacade (cross-module), FlowPolicyResolver, DraftProposer,
 *        SemanticResultCache, and the per-tenant TrpcCallerImpl. Standing up
 *        the test module also requires KernelModule + IdentityModule + the
 *        global RlsMiddleware to satisfy the request-bound DB token contract.
 *
 *     2. JWT verification path: the controller uses a real `JwtService` that
 *        requires JWT_SECRET wiring and a verifier matching the prod cookie
 *        format. A test-only override needs either an env stub or a custom
 *        provider, both of which add boilerplate orthogonal to the pipeline
 *        we're trying to exercise.
 *
 *     3. Sub-agent registry seed: the BoundedExecutor needs at least one
 *        `ValidatedSubAgentConfig` resolvable via `SubAgentRegistry.get`,
 *        plus a corresponding `IntentRegistry` entry, plus
 *        `agents.agent_session` row pre-conditions. Building these via the
 *        existing in-memory fixture stores (used by
 *        `router-session-orchestrator-integration.spec.ts`) is incompatible
 *        with the Drizzle-backed stores wired into the production module.
 *
 *     4. Three fake LLM clients matching three different streaming/typed
 *        interfaces (`RouterLlmClient.classify` returning a parsed
 *        `RouterPlan`, `SubAgentLlmClient.runWithTools` driving a tool-call
 *        loop, `SynthesizerLlmClient.synthesize` returning the streaming
 *        triplet `{ partialObjectStream, finalObject, usage }`) — each with
 *        provenance + usage shapes that must be coherent across the pipeline.
 *
 *     5. SSE response capture: the controller writes via `res.raw.write` and
 *        commits via `res.raw.writeHead`. The unit-test harness in
 *        `agent-turn-controller.spec.ts` already establishes the captured-
 *        chunk pattern; replicating it here is fine, but the produced events
 *        only become meaningful once 1–4 are in place.
 *
 *   The unit test suite (`agent-turn-controller.spec.ts`) covers controller
 *   semantics — JWT/auth, budget refusal, abort sources, save-queue ordering,
 *   `turnEndReason` → SSE translation, `RouterLlmFailureError` /
 *   `SynthesizerStreamFailureError` classification — against a mocked
 *   `TurnPipelineRunner`. The pipeline-runner unit test
 *   (`turn-pipeline-runner.spec.ts`) covers the runner's own composition.
 *   And `router-session-orchestrator-integration.spec.ts` covers the router
 *   stage end-to-end with in-memory stores.
 *
 *   Net result: the live integration test would primarily verify NestJS DI
 *   wiring at runtime. The `it.todo` placeholders below mark the cases worth
 *   promoting if/when a follow-up plan invests in a dedicated AgentsModule
 *   integration harness (likely as part of a Plan 19 or later acceptance
 *   pass that ships against a real OpenAI sandbox key).
 */

import { describe, it } from 'vitest'

describe('AgentTurnController live pipeline (integration)', () => {
  it.todo(
    'happy path: router → BoundedExecutor → streaming synthesizer → SSE; ' +
      'persists user + assistant messages and emits turn.started, ' +
      'phase.started, answer.token+, answer.shape, turn.ended in order',
  )
  it.todo('two-tenant RLS: tenant A turn does not leak messages to tenant B')
  it.todo('mid-stream abort: client disconnect aborts synthesizer stream and emits cancelled')
  it.todo('disambiguation: router emits disambiguation plan; SSE carries assistant.message=text')
  it.todo(
    'synthesizer pre-shape failure: stream errors before declaring shape; ' +
      'SSE emits turn.ended cause=synthesizer_failure and no assistant message persisted',
  )
})
