# 02 — Sub-agent Declaration + Router Prompt Generation

**Design §§:** §3 (Runtime Topology, Sub-agent declaration site), §8 (Prompt Architecture).

---

## 1. Scope

### In

- Typed `defineSubAgent(config)` factory with strict construction-time validation.
- Module-scoped sub-agent declaration files + build-time root aggregator into a single registry.
- Session-time router prompt generation from the registry with inline JSON Schema.
- Content-hash pinning of the assembled router + sub-agent prompts into the session record for replay determinism.
- Permission narrative generation from `canDo` rule set, cached by content hash in `agent_narrative_store`.
- Structured-output parse with one-retry-on-schema-fail, then escalate to disambiguation.
- Canonicalization rules applied at prompt-assembly time so hashes are stable.

### Out

- Sub-agent ReAct loop execution (plan 03).
- Synthesizer (plan 03).
- Gateway pipeline that executes sub-agent tool calls (plan 01).
- Iterative-topology router classification path (plan 12).
- Stored-source sub-agent admin UI (product concern, captured as interface stub only).

---

## 2. Design Context

Our router is a deterministic code orchestrator around one LLM call; the LLM produces a typed plan (§3), not a conversation. The plan shape is the contract between the router LLM and phase-execution code.

The declaration site (`defineSubAgent`) is where per-sub-agent invariants are captured at compile time rather than runtime. This is deliberate — mastra's `AgentConfig` is ~20 loosely-typed fields with near-zero construction-time validation (spike 12-agent-builder-config); errors surface at first call with messages like `AGENT_GET_TOOLS_FUNCTION_EMPTY_RETURN`. Our declaration is a single typed factory whose output is validated before the app boots. Missing required fields = compile error.

The router prompt is **generated from the registry, not hand-written**. This closes the drift gap mastra validates as a production problem: their routing agent at `packages/core/src/loop/network/index.ts:132-220` rebuilds instructions every call from `listAgents + listWorkflows + listTools` introspection, rendering each primitive's schema inline as JSON Schema. We borrow the pattern (spike 01, 04). Drift between registry and prompt is structurally impossible.

The permission narrative (§8) is also generated, not hand-written — it's the natural-language version of the caller's `canDo` rule set, cached by hash in `agent_narrative_store` (shipped in plan 00). Hand-written narratives drift when permissions change; generated ones don't.

**Rejected alternatives:**

- Free-text `additionalInstructions` per-tenant — breaks prompt-hash stability (§8) and is a latent injection surface (cf. mastra `routingConfig.additionalInstructions`, rejected). Tenant variation lives in per-sub-agent `whenToUse`.
- Runtime dynamic instructions computed per-call (mastra's `DynamicArgument` pattern) — incompatible with prompt-hash pinning for replay determinism.
- A single global sub-agent map populated at module load — collision-prone at scale; we use module-scoped declaration files with a root aggregator that fails build on key collision.

**What this is NOT:** an extensible agent-framework surface. It is a constrained factory with opinionated validation; new fields require a design doc change.

---

## 3. Data Model

### Registry (code + build artifact)

Not a DB table at MVP. Lives as TypeScript module files:

- `apps/api/src/modules/<domain>/agent/sub-agents/*.ts` — module-scoped declaration files calling `defineSubAgent(...)`.
- `apps/api/src/modules/agents/infrastructure/registry/index.ts` — root aggregator importing and validating all module-scoped declarations at build time.

Built-registry artifact (in-memory at runtime):

- `Map<SubAgentKey, ValidatedSubAgentConfig>` — indexed by `key`.
- Frozen at bootstrap; no runtime mutation.

### `agent_stored_sub_agent` (for `source: 'stored'`, shipped interface stub at MVP)

Beta-activation-gated; table shape declared now so migrations don't block later:

- `id UUID PK`
- `tenant_id UUID` (RLS partition)
- `key TEXT` (unique per tenant)
- `config JSONB` — serialized `ValidatedSubAgentConfig`
- `version INT` — monotonic per key
- `status TEXT` — `'draft' | 'active' | 'retired'`
- `created_by UUID`, `created_at TIMESTAMPTZ`
- Index: `(tenant_id, key, status)`, `(tenant_id, key, version DESC)`

MVP behavior: table exists but is write-blocked (admin UI ships at Beta). Read path short-circuits to code-source registry.

### `agent_session` (new; stores pinned hashes)

- `id UUID PK`
- `tenant_id UUID` (RLS)
- `user_id UUID`
- `conversation_id UUID`
- `router_prompt_hash TEXT`
- `permission_narrative_hash TEXT`
- `tool_catalog_hash TEXT`
- `directive_schema_hash TEXT`
- `canonicalizer_version_hash TEXT`
- `pinned_sub_agent_prompt_hashes JSONB` — `{ [key]: hash }`
- `started_at TIMESTAMPTZ`, `ended_at TIMESTAMPTZ?`
- Index: `(tenant_id, user_id, conversation_id, started_at DESC)`

Session row created at first turn of a conversation; referenced by every turn within the session so mid-session registry changes do not affect replay determinism.

### `agent_narrative_store` (shipped in plan 00 — referenced here)

Schema from plan 00. Consumed by permission-narrative builder: `(tenant_id, role_id) → narrative_hash → text`. Append-only; new narrative_hash written on first use.

---

## 4. Interface Contracts

### `defineSubAgent` factory

```
defineSubAgent<TInputSchema extends ZodType, TOutputSchema extends ZodType>(config: {
  key: string;
  domain: string;
  description: string;         // one-line, audience-facing
  whenToUse: string;           // router decision hint
  promptTemplate: {
    body: string;
    variables: ZodType;        // validates at session start
  };
  inputSchema: TInputSchema;   // phase-2 sanitization target
  outputSchema: TOutputSchema;
  toolScope: ReadonlyArray<string>;  // tool name prefixes / concrete names
  budgets: {
    maxIterations: number;     // 4-5
    wallclockMs: number;
    costUsd: number;
    toolCeilingBytes?: number;
  };
  memoryScope: {
    reads: ReadonlyArray<'L1' | 'L2' | 'L3' | 'L4'>;
    writes: ReadonlyArray<'L1' | 'L2' | 'L3'>;  // type-forbid L4
  };
  model: DynamicArgument<ModelChoice, TenantContext>;
  source: 'code' | 'stored';
}): ValidatedSubAgentConfig<TInputSchema, TOutputSchema>
```

Compile-time errors:

- Missing required field.
- `memoryScope.writes` contains `'L4'`.
- `inputSchema` not assignable to canonical phase-1 output schema (strict subset check).
- `toolScope` not `ReadonlyArray<string>`.

Runtime (boot-time) errors:

- `toolScope` references a tool name not in the tRPC registry.
- `promptTemplate.variables` is not a Zod schema.
- Duplicate `key` across modules.

### `SubAgentRegistry` (module boundary)

```
list(): ReadonlyArray<ValidatedSubAgentConfig>
get(key: string): ValidatedSubAgentConfig | undefined
resolveForSession(opts: {
  tenantId: UUID;
  userId: UUID;
  roleAllowedPermissions: ReadonlySet<string>;
}): ReadonlyArray<{
  config: ValidatedSubAgentConfig;
  resolvedModel: ModelChoice;
  resolvedPromptBody: string;        // variables substituted
  subAgentPromptHash: string;
}>
```

### `RouterPromptBuilder`

```
build(opts: {
  tenantId: UUID;
  userId: UUID;
  surface: 'global-chat' | 'inline' | 'async';
  roleAllowedPermissions: ReadonlySet<string>;
  subAgents: ReadonlyArray<ValidatedSubAgentConfig>;
  permissionNarrative: string;
  recentSummaryWindow: WindowedSummaries; // γ or α per §6
  toolCatalogHash: string;
}): {
  systemPrompt: string;
  developerMessage: string;
  routerPromptHash: string;
}
```

### `PermissionNarrativeBuilder`

```
build(opts: { tenantId: UUID; roleId: UUID; }): Promise<{
  narrativeHash: string;
  text: string;
  fromCache: boolean;
}>
```

Reads `agent_narrative_store` by `(tenant_id, role_id) → hash → text`. Misses trigger generation + append + kernel audit event `agent.narrative_stored`.

### `RouterDecisionParser`

```
parse(rawLlmOutput: string, schema: ZodType<RouterPlan>): ParseResult

type ParseResult =
  | { kind: 'ok'; plan: RouterPlan }
  | { kind: 'retry'; reason: string; schemaInjectedPrompt: string }
  | { kind: 'escalate'; reason: string }  // two failures → disambiguation

type RouterPlan = {
  topology: 'bounded';                      // iterative added in plan 12
  phase1: SubAgentDirective[];              // 1..3
  phase2?: SubAgentDirective;
  disambiguation?: string;                  // present iff topology can't fit
}
```

---

## 5. Control Flow

### Session start (first turn of a conversation)

1. Receive `POST /agent/turn` — plan 06 extracts `tenantId, userId, surface, conversationId?`.
2. Attempt to load `agent_session` for `conversationId`. If missing → proceed to step 3. If present → use pinned hashes; skip to phase execution.
3. **Build permission narrative.** `PermissionNarrativeBuilder.build({ tenantId, roleId })`. On cache hit, return existing `narrativeHash`; on miss, generate text programmatically from `canDo` rules, content-hash it, append to `agent_narrative_store`, emit `agent.narrative_stored` audit.
4. **Resolve sub-agents.** `SubAgentRegistry.resolveForSession(...)` returns the tenant-resolved subset with resolved model + rendered prompt body + per-sub-agent prompt hash.
5. **Build router prompt.** `RouterPromptBuilder.build(...)` returns system prompt + developer message + `routerPromptHash`. Registry entries are rendered as `{ key, domain, description, whenToUse, inputSchema JSONSchema, outputSchema JSONSchema }`. Tool catalog (filtered per role) is rendered once; hashed for `toolCatalogHash`.
6. **Pin to session.** Create `agent_session` row with all hashes. Replay harness (plan 10) reconstructs prompts via these hashes.

### Router LLM call (per turn)

1. Assemble messages: system prompt (hash-pinned) → developer message (turn-dynamic: taint narrative, L3 preferences, γ/α window, circuit-breaker notes) → user message.
2. Invoke `generateObject` (Vercel AI SDK) with `schema: RouterPlanSchema`.
3. Parse via `RouterDecisionParser.parse`. Three outcomes:
   - `ok` → return plan to phase execution (plan 03).
   - `retry` → re-issue call with `jsonPromptInjection: true` equivalent (schema re-injected into prompt) ONCE.
   - `escalate` → emit disambiguation event (plan 06 `refusal.started` with `reason: 'disambiguation'`), end turn without executing phases.
4. Hash the assembled router message array (content hash); stamp `router_prompt_hash` on the trace (must match session-pinned hash — mismatch = bug).

### Structured-output retry

1. First `generateObject` call returns output.
2. Parse: schema validation fails (e.g., missing `phase1` or unknown enum value).
3. Parser returns `{ kind: 'retry', reason, schemaInjectedPrompt }` — `schemaInjectedPrompt` is an additional system message reiterating the schema shape + what was wrong.
4. Re-issue `generateObject` with the added message.
5. Parse again. If success → proceed. If second failure → `{ kind: 'escalate', reason }` → disambiguation.
6. Never attempt string-repair / fuzzy-JSON recovery. Either schema-valid parse or escalate.

### Permission narrative cache miss (first-ever role lookup)

1. Lookup by `(tenant_id, role_id)` → miss.
2. Query `KernelQueryFacade.getRolePermissions(tenantId, roleId)` → `{ role, allow: string[], deny: string[] }`.
3. Apply narrative template: _"Acting as {role}. You can {top-N permitted verbs}; you cannot {top-M notable denials}."_
4. Canonicalize text, hash.
5. Append to `agent_narrative_store` (idempotent — hash collision is identity).
6. Emit `agent.narrative_stored` kernel audit event.
7. Return `{ narrativeHash, text, fromCache: false }`.

### Canonicalization at assembly

Every string emitted into the assembled router prompt passes through the canonicalization pipeline from §8: JSON key-sort, `undefined` dropped, `null` preserved, ISO dates → UTC-Z, no numeric coercion. Canonicalizer version hash stamped on every trace attr (plan 07 R-07.18).

---

## 6. Requirements

### Declaration + registry

| #      | Requirement                                                                                                                                        | Design §§             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R-02.1 | `defineSubAgent(config)` is a typed factory; missing required fields fail compile                                                                  | §3                    |
| R-02.2 | Required fields per §4 Interface Contracts, including `description`, `whenToUse`, `memoryScope`, `promptTemplate`, `source`, per-sub-agent `model` | §3                    |
| R-02.3 | `description` one-liner; `whenToUse` is router decision hint — separate fields                                                                     | §3, spike 04 + 12     |
| R-02.4 | `memoryScope.writes` type-forbids `'L4'`                                                                                                           | §5, §3                |
| R-02.5 | `inputSchema` is a strict subset of canonical phase-1 output schema (compile-enforced)                                                             | §3 additive-extension |
| R-02.6 | Registry built from module-scoped files + root aggregator at build time — no runtime discovery                                                     | §3                    |
| R-02.7 | Aggregator fails build on `key` collision across modules                                                                                           | §3                    |
| R-02.8 | `source: 'stored'` resolves from `agent_stored_sub_agent` at session start; `'code'` from code registry. Same validated shape                      | §8, §14               |

### Drift tests

| #       | Requirement                                                                                   | Design §§ |
| ------- | --------------------------------------------------------------------------------------------- | --------- |
| R-02.9  | Every sub-agent has a non-empty `toolScope` resolvable against the current tRPC registry      | §3        |
| R-02.10 | `inputSchema` subset check is compile-enforced + CI-verified against canonical phase-1 output | §3        |
| R-02.11 | CI hard-fail on any drift-test regression; no warn-only                                       | §14       |

### Router prompt generation

| #       | Requirement                                                                                                     | Design §§ |
| ------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| R-02.12 | Router prompt generated from registry at session start — never hand-written                                     | §3        |
| R-02.13 | Each entry renders `{ domain, description, whenToUse, inputSchema JSONSchema, outputSchema JSONSchema }`        | §3        |
| R-02.14 | `additionalInstructions` / tenant free-text addenda rejected; per-tenant variation in per-sub-agent `whenToUse` | §3        |
| R-02.15 | Assembled router prompt content-hashed at session start; hash pinned into `agent_session`                       | §8        |
| R-02.16 | Registry changes mid-session do NOT affect active session (session uses pinned hashes)                          | §8        |

### Permission narrative

| #       | Requirement                                                                               | Design §§ |
| ------- | ----------------------------------------------------------------------------------------- | --------- |
| R-02.17 | Narrative generated programmatically from `canDo` rules — not hand-written                | §8        |
| R-02.18 | Cached by hash in `agent_narrative_store`; `(tenant_id, role_id) → narrative_hash → text` | §8        |
| R-02.19 | Regenerated on role permission change (new content → new hash); store is append-only      | §8        |

### Structured-output parse

| #       | Requirement                                                                                  | Design §§ |
| ------- | -------------------------------------------------------------------------------------------- | --------- |
| R-02.20 | Router decision parsed via structured output against Zod schema                              | §3, §4    |
| R-02.21 | On schema-fail: one retry with schema re-injection; second fail → escalate to disambiguation | §4        |
| R-02.22 | No silent string-repair / fuzzy-JSON fallback                                                | §4, §8    |
| R-02.23 | Escalation emits structured disambiguation event via plan 06                                 | §4, §15   |

### Canonicalization

| #       | Requirement                                             | Design §§ |
| ------- | ------------------------------------------------------- | --------- |
| R-02.24 | Apply §8 canonicalization rules at prompt-assembly time | §8        |
| R-02.25 | Canonicalizer version hash stamped on every trace       | §8        |

---

## 7. Failure Modes & Recovery

| Failure                                                              | Symptom                                                                                                      | Recovery                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Sub-agent declaration missing required field                         | Build error                                                                                                  | Author fixes declaration. Never ships.                                                                          |
| Two sub-agents share `key` across modules                            | Build error at aggregator                                                                                    | Author renames one.                                                                                             |
| `toolScope` references non-existent tool                             | Boot-time error, `apps/api` fails to start                                                                   | Deploy gate catches.                                                                                            |
| Permission-narrative generation fails (kernel query timeout)         | `agent_narrative_store` read misses → retry generate. Third failure → turn refused with `reason: 'internal'` | Monitoring alert; incident runbook §18.6.                                                                       |
| Router LLM returns non-JSON                                          | Parser returns `retry`; second failure → `escalate`                                                          | Disambiguation presented to user.                                                                               |
| Router LLM returns JSON that violates schema                         | Same path as above.                                                                                          | Same.                                                                                                           |
| Session row write fails (DB error at turn start)                     | Turn refused with `reason: 'internal'`; stream closes with `error`                                           | Monitoring alert. Rare: DB would also fail downstream writes.                                                   |
| Canonicalizer bug produces different hash for logically-equal inputs | Replay misses in plan 10                                                                                     | Canonicalizer version hash lets us detect + attribute to the bad version; fix + ship new canonicalizer version. |
| Mid-session registry change (new sub-agent added)                    | Active sessions unaffected (pinned hashes)                                                                   | New sessions pick up change on next turn start.                                                                 |

---

## 8. Observability Surface

### Spans

- `ROUTER_PLAN` (entity `ROUTER`) — parent of router LLM call.
- `permission-narrative:build` — child of `ROUTER_PLAN`; attrs `from_cache`, `narrative_hash`.
- `router-prompt:build` — child; attrs `router_prompt_hash`, `sub_agent_count`, `tool_count`.
- `router-llm:call` — child; standard LLM span with usage + cost from plan 05.
- `router-decision:parse` — child; attrs `parse_outcome: 'ok' | 'retry' | 'escalate'`, `retry_round`.

### Span attributes (on `ROUTER_PLAN` and trace root)

- `router_prompt_hash`, `permission_narrative_hash`, `tool_catalog_hash`, `directive_schema_hash`, `canonicalizer_version_hash` (on every trace).
- `sub_agent_count_available`, `sub_agent_count_selected`.
- `router_parse_retries: 0 | 1`.
- `router_escalated_to_disambiguation: boolean`.

### Metrics

- `agent_router_decisions_total{tenant_id, outcome}` — outcome: `bounded_plan | disambiguation | parse_escalated`.
- `agent_router_parse_retry_total{tenant_id}` — counter.
- `agent_narrative_cache_hit_ratio{tenant_id}` — gauge.

### Dashboards

- Router parse-retry rate per tenant (alert if >5% sustained — prompt regression signal).
- Disambiguation rate (alert if >15% sustained — router prompt or sub-agent scope too narrow).
- Narrative cache hit ratio (alert if <90% after first week per tenant — permission churn abnormal).

---

## 9. Security Considerations

- **Attack surface:** the router prompt is assembled server-side from registry + per-tenant data. No user input controls the prompt shape.
- **Defense:** (a) registry code-only at MVP — no tenant-writable prompt source. (b) Variables substituted into `promptTemplate.body` are validated via Zod `variables` schema; an unknown key is a runtime error. (c) Permission narrative is generated from `canDo` rules, not user input — never injectable.
- **Rejected `additionalInstructions`:** would let a tenant-admin inject arbitrary text into the router prompt, a hallmark of the indirect-injection class. Not a MVP path. If tenant routing variation is needed, it goes into per-sub-agent `whenToUse` via code review.
- **`agent_stored_sub_agent` Beta path:** will require kernel audit on every row change + admin-role `canDo` gate. Capture the audit shape now so it doesn't get retrofitted.
- **Prompt-hash replay:** the session-pinned hashes prevent mid-session tenant-admin changes from affecting active turns (race-condition class: admin updates narrative → in-flight turn re-fetches → different narrative than router expected).

---

## 10. Performance Budget

| Operation                                                  | p50     | p95     | p99                   |
| ---------------------------------------------------------- | ------- | ------- | --------------------- |
| Registry `list()` + `get()`                                | <1ms    | <1ms    | <2ms                  |
| Permission narrative cache hit                             | <5ms    | <10ms   | <25ms                 |
| Permission narrative cache miss (generation + store write) | <150ms  | <400ms  | <800ms (one-time)     |
| Router prompt build                                        | <10ms   | <25ms   | <60ms                 |
| Router LLM call                                            | <2000ms | <5000ms | <8000ms (model-bound) |
| Decision parse                                             | <5ms    | <15ms   | <30ms                 |
| Session row write                                          | <10ms   | <25ms   | <60ms                 |

Total non-LLM overhead: <50ms p99. Dominated by the LLM call.

---

## 11. Testing Strategy

### Unit

- `defineSubAgent` compile errors on missing / mis-typed fields (covered by type tests, not runtime tests).
- `memoryScope.writes` type-forbids `L4` (TS type test).
- Registry aggregator throws on `key` collision.
- `RouterPromptBuilder.build` produces deterministic output for fixed input (same hash).
- `RouterDecisionParser` returns `retry` on schema fail + `escalate` after two retries + `ok` on valid output.
- `PermissionNarrativeBuilder` cache hit returns `fromCache: true`; miss returns `false` and triggers write.

### Integration

- Boot `apps/api` with a seeded bad registry (non-existent tool in `toolScope`) → startup fails.
- Happy-path turn: session row created with all hashes; `agent_session` row persisted; router prompt includes rendered sub-agent JSON Schemas (literal string check).
- Mid-session registry change: add a sub-agent to the registry during an active session → second turn in same session uses pinned hashes (new sub-agent not surfaced); new session starts → new sub-agent appears.
- Cross-tenant: tenant A's session-pinned `permission_narrative_hash` differs from tenant B's (different roles → different narratives).
- Seed a router response with malformed JSON (first call) + valid JSON (second call) → parse retries once, succeeds.
- Seed two consecutive malformed responses → disambiguation event emitted; no plan executes.
- Fuzzy-repair attempt: seed nearly-valid JSON (e.g. trailing comma) → parser rejects (no repair).

### Property

- Same registry + same tenant context → same `router_prompt_hash` (deterministic assembly).
- Adding an unused sub-agent to the registry does not change hashes for existing sub-agents' pinned prompts.
- Canonicalization: two equivalent JSON inputs with key-order / null-vs-undefined differences → same final hash.

### Fixtures

- `fixtures/sub-agents/planner-read-only.ts` — canonical example with all fields populated.
- `fixtures/sub-agents/missing-when-to-use.ts` — compile-error seed.
- `fixtures/sub-agents/l4-writes.ts` — type-error seed (writes: `['L4']`).
- `fixtures/router-responses/valid-bounded-plan.json`
- `fixtures/router-responses/malformed-then-valid.json`
- `fixtures/router-responses/double-malformed.json`

---

## 12. Acceptance Criteria

- All unit + integration + property tests pass.
- Build fails on seeded violation PRs (missing field, collision, L4 write, non-existent tool).
- Langfuse trace for first turn of a conversation shows: `permission-narrative:build` with `from_cache: false` → `router-prompt:build` → `router-llm:call` → `router-decision:parse`.
- Langfuse trace for second turn in same conversation shows `permission-narrative:build` with `from_cache: true`.
- Session row `agent_session` persisted with all hash columns populated.
- Disambiguation emitted on double-parse-failure matches plan 06 event schema.
- Canonicalizer version hash appears as trace attr on every trace.
- Cross-tenant seed test passes (narrative hashes differ by tenant).

---

## 13. Rollout Plan

- **Phase 1** — ship registry + builder + parser with a single seeded sub-agent (`planner.read-only`). Verify session rows + hashes + audit emission.
- **Phase 2** — add 2-3 more sub-agents once plan 03 ships router-driven execution. Canary at internal tenant.
- **Phase 3** — add all MVP sub-agents; open to 5% tenant rollout.
- **Phase 4** — full rollout.

**Backout:** registry hydration failure at boot → `apps/api` fails to start (deploy gate catches). No runtime backout needed — bad config can't ship. For a prompt-quality regression post-deploy, roll the PR back; session-pinned hashes mean in-flight sessions continue under old prompt until conversation ends.

---

## 14. Dependencies

- Plan 00 (shipped): `agent_narrative_store` + sanitizer + Langfuse wiring.
- Plan 01: tool registry (for `tool_catalog_hash` + tool-name validation in `toolScope`).
- `KernelQueryFacade.getRolePermissions(tenantId, roleId)` returning `{ role, allow, deny }`.

## 15. Integration Points

- `apps/api/src/modules/agents/domain/services/sub-agent-factory.ts` — `defineSubAgent`.
- `apps/api/src/modules/<domain>/agent/sub-agents/*.ts` — module-scoped declarations.
- `apps/api/src/modules/agents/infrastructure/registry/` — root aggregator + validation.
- `apps/api/src/modules/agents/application/services/router-prompt-builder.ts`.
- `apps/api/src/modules/agents/application/services/permission-narrative-builder.ts`.
- `apps/api/src/modules/agents/application/services/router-decision-parser.ts`.
- `apps/api/src/modules/agents/infrastructure/schema/agent-session.ts` — Drizzle.
- `apps/api/src/modules/agents/infrastructure/schema/agent-stored-sub-agent.ts` — Drizzle (stub).
- Kernel `KernelQueryFacade`, `KernelAuditFacade`.
- Vercel AI SDK `generateObject`.
- Plan 00 `agent_narrative_store` repository.

## 16. Activation Gate

MVP. Ships with first production turn.

## 17. Out of Scope

- Sub-agent runtime execution (plan 03).
- Synthesizer (plan 03).
- Iterative topology router classification (plan 12 adds `topology` decision).
- Admin UI for `stored` sub-agent management (Beta; table stub only now).
- Stored-sub-agent version promotion / demotion flow (Beta).

## 18. Open Questions

- **Top-N / Top-M in narrative template.** Start: N=10 permitted verbs, M=5 notable denials. Owner: adjust after first prompt-quality review post-canary.
- **Stored sub-agent signing / integrity.** If tenants can edit stored sub-agents at Beta, do we want a signed checksum to prevent unauthorized DB edits from landing? Owner: Beta-phase designer.
- **Drift-test perf at scale.** 60-100 tools × N sub-agents × input-schema compat check — profile at 20-tool milestone. If >30s, move to scheduled job, not per-PR. Owner: CI maintainer.
- **Disambiguation prompt copy.** What does the user see when router escalates? Owner: product + UX review before first canary.
