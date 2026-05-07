# Agents Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.5.
**Source SRS:** `docs/architecture/agents-srs.md` (1339 lines, FR-001..FR-088 + UI-001..UI-023 + NFR-001..NFR-023).
**Tickets:** 7 Epics, ~37 MVP Stories + ~7 Backlog Stories + ~4 Tasks + ~6 S6 hardening Tasks.

**Personas served:**

- Employee — global chat, inline copilot, NL writes constrained to own scope.
- Tenant administrator — model selection, cost ceilings, schedule policy, tool visibility, KB management.
- Platform administrator — view-only of tenant config (FR-084).
- Auditor — replay-by-trace, audit query.
- End user (data subject) — GDPR right-to-erasure (Backlog cascade).
- Scheduled run (system actor) — under user delegation grant (FR-026).

**Cascading cuts (per design §6.5 + §13 D14/D15):**

- AGN-2 role-scoped reads (FR-063 team/dept/manager analysis) → Backlog (no org chart from People).
- AGN-7 k-anonymity floor on aggregates (FR-025) → Backlog (moot without aggregates).
- NL writes constrained to current-task assignees + exact-email (no fuzzy "reassign to Anh").

**Blocker resolutions baked in (per design §13):**

- T1-1: Approval-inbox event contract — agents emits drafts, inbox owns TTL/auto-reject.
- T1-2: Kernel audit transactional. Same DB tx; rollback on failure.
- T1-3: PeopleQueryFacade — exact-only in MVP; fuzzy → Backlog.
- T1-4: Delegation grant schema with hardcoded 90-day TTL (admin UI → Backlog).
- T1-9: Direct OpenAI in MVP code; multi-provider abstraction → Backlog.
- T1-10: English-only inline strings; i18n infra → Backlog.
- A1: Output shape declaration metadata-only, NOT counted toward TTFT.
- B1: Conservative-secure taint — read OR write tenant-authored free text taints subsequent writes.
- C3: Email + in-app channels only (no Slack/Teams).
- E2: Quality canary success = error-free + within-SLA + no user-rated-negative.
- G1: $0.10 minimum-remaining budget.
- G3: 1000 docs / 5MB per doc.
- H1: Image-PDF reject at upload time.

---

## [EPIC] AGN-1 Conversational surfaces

ID: AGN-1
Status: Backlog
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 26
Rank: 100
Jira Key:
Confluence Link:

### Summary

`apps/web-agents` zone (greenfield), global chat surface + inline copilot in web-planner, conversation/turn data model, SSE streaming with metadata-only shape declaration (per §13 A1), citations contract, multi-conversation switching. Plus AGN-1 internal FE/BE contract publication on S3 day-1 (per design §13 risk #16).

### Goal

By S3 close, an Employee can open the global chat surface in web-agents (greenfield zone), exchange messages with SSE streaming, and switch between conversations. Inline copilot is reachable from web-planner with screen context passed.

### Scope

- web-agents zone scaffold (greenfield).
- Global chat surface (FR-001, UI-001..006).
- Inline copilot in web-planner (FR-002, UI-011..013).
- Conversation + turn data model.
- SSE streaming with TTFT p95 ≤ 2.5s metric (NFR-001 + §13 A1: shape declaration is metadata-only, NOT counted toward TTFT).
- Output-shape declaration (FR-004).
- Citations contract (FR-006).
- Multi-conversation switching (FR-007).
- AGN-1 internal FE/BE contract publication (S3 day-1 per design §3 + §13 risk #16).

### Out of Scope

- Planner R/W (AGN-2).
- Exec-mode framework (AGN-4).
- Approval inbox events (AGN-4).
- KB (AGN-3).

### SRS Coverage

- FR-001..007 + UI-001..013.

### Acceptance Criteria

- [ ] web-agents zone scaffolds, builds, deploys.
- [ ] Global chat reachable at `https://<host>/agents/`.
- [ ] TTFT p95 ≤ 2.5s with shape declaration metadata-only per §13 A1.
- [ ] Citations included on every output that references platform data (FR-006).
- [ ] kernel audit_event for every conversation create / turn / message per §13 T1-2.

### Child Tickets

- AGN-1.S1 web-agents zone scaffold (Story)
- AGN-1.S2 Global chat surface (Story)
- AGN-1.S3 Inline copilot in web-planner (Story)
- AGN-1.S4 Conversation + turn data model (Story)
- AGN-1.S5 SSE streaming with TTFT p95 ≤ 2.5s (Story)
- AGN-1.S6 Output-shape declaration (Story)
- AGN-1.S7 Citations contract (Story)
- AGN-1.S8 Multi-conversation switching (Story)
- AGN-1.S2-CONTRACT Agents internal FE/BE contract publication (Story, S3 day-1)

### Definition of Done

- All child Stories Done.
- E2E demonstrating 100 chat turns of varied output shapes with p95 TTFT ≤ 2.5s.

---

### [STORY] AGN-1.S1 web-agents zone scaffold (greenfield)

ID: AGN-1.S1
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 110
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want the `apps/web-agents` zone scaffolded with AppLayout + sidebar registered with web-shell, so that subsequent agent UI surfaces have a host.

#### Acceptance Criteria

- [ ] Zone scaffolded at `apps/web-agents/` via `turbo gen workspace` per CLAUDE.md; no manual package.json edits.
- [ ] `<AppLayout>` from `@future/app-layout` renders on every page within the zone.
- [ ] Sidebar `NavGroup` registered with web-shell; agents entry appears in global nav for every authenticated user (FR-001 + UI-001).
- [ ] All zone routes live under `/agents/`; cross-zone navigation from web-shell uses hard `<a>` reload per CLAUDE.md.
- [ ] Zone builds clean (`bun run build`) and passes CI lint + type-check.
- [ ] **E2E** — Employee navigates from web-shell to agents zone; AppLayout renders; `/agents/` path is reachable.

#### AI Execution Notes

Scaffold via `turbo gen workspace --name web-agents --type app`. Follow the pattern of `apps/web-planner` zone: Next.js 15, `@future/app-layout`, `@future/ui`. Sidebar NavGroup shape: `{ render: AgentsNavGroup }` (dynamic, per CLAUDE.md). Register in `packages/app-layout/src/nav-registry.ts` or equivalent config. Zone rewrites in `apps/web-shell/next.config.ts` must be updated to add the `/agents/` rewrite. No zone-local sidebar — AppLayout owns it.

#### Testing Notes

- Unit: nav registry entry resolves correctly.
- E2E (Playwright in `apps/e2e/`): navigate shell → agents zone → verify `<AppLayout>` present + `/agents/` URL.

#### Dependencies

- Blocked by: FOUND-3.T1 (web-shell zone host exists), FOUND-2.T5 (session cookie available cross-zone)
- Blocks: AGN-1.S2, AGN-1.S3

#### Definition of Done

- Inherits project DoD.
- Zone listed in `turbo.json` pipeline.
- ECS service + ECR repo scaffolded in Terraform per CLAUDE.md infra rules (forward-link DEPLOY-1).

---

### [STORY] AGN-1.S2 Global chat surface

ID: AGN-1.S2
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 120
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a global chat surface where I can ask the agent questions in plain language, so that I can find information without clicking through screens.

#### Acceptance Criteria

- [ ] Chat input, message list, send button, and keyboard shortcut (Enter to send) rendered per UI-001..006.
- [ ] Conversation history displayed grouped by recency; user can open a new conversation or switch to a prior one per UI-002.
- [ ] Execution-mode control (Default approvals / Bypass approvals) visible at all times per UI-003.
- [ ] Turn-cancel control visible while a turn is in flight; disappears when turn ends per UI-004.
- [ ] Tokens stream progressively; layout does not reflow as content fills in per UI-005.
- [ ] Citations render as navigable links; cross-zone links use hard `<a>` reload per UI-006 + CLAUDE.md.
- [ ] Message history persists across page reload (stored server-side, retrieved on session hydration).
- [ ] Mobile-responsive and WCAG 2.1 AA per NFR-020.
- [ ] Kernel `audit_event` written in same DB tx for every conversation create and turn per §13 T1-2.
- [ ] **E2E** — Send a question; see streaming response with at least one citation; reload; history intact.

#### AI Execution Notes

FE: `apps/web-agents/app/agents/page.tsx` — main chat view. Components: `<ChatInput>`, `<MessageList>`, `<MessageBubble>`, `<ExecutionModeControl>`, `<CancelControl>`. Use `@future/ui` primitives throughout — no raw `<button>` or `<input>`. SSE consumption via `EventSource` or `fetch` + `ReadableStream`. State managed with React Query + tRPC subscription. Import shapes from `packages/agent/src/contract.ts` (AGN-1.S2-CONTRACT). BE: tRPC router at `apps/api/src/modules/agents/interface/trpc/conversation.router.ts`. Conversation create + turn handlers. Audit in same DB tx per T1-2 — use `withAudit(db, ...)` helper from kernel module.

#### Testing Notes

- Unit: `<MessageBubble>` citation rendering; `<ExecutionModeControl>` toggle state.
- Integration: conversation create handler writes audit row in same tx; tx rollback test (audit write fails → conversation not created).
- E2E: send message → verify SSE delivery → verify citation links → reload → verify history.
- A11y: axe-core scan on chat surface (WCAG 2.1 AA).

#### Dependencies

- Blocked by: AGN-1.S1 (zone exists), AGN-1.S4 (conversation data model), AGN-1.S5 (SSE streaming), AGN-1.S2-CONTRACT (contract published)
- Blocks: AGN-1.S7 (citations build on this surface), AGN-1.S8 (conversation switching on this surface)

#### Definition of Done

- Inherits project DoD.
- Chat surface live at `/agents/`.
- WCAG 2.1 AA axe scan passes.
- Audit tx integration test passes.

---

### [STORY] AGN-1.S3 Inline copilot in web-planner

ID: AGN-1.S3
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 130
Jira Key:
Confluence Link:

#### Summary

As an Employee viewing a Planner task or plan, I want an inline copilot reachable from that screen with the screen's primary entity passed in as context, so that I can ask agent questions about what I'm looking at without leaving the screen.

#### Acceptance Criteria

- [ ] Inline copilot panel (or expandable region) reachable on task-detail and plan-detail screens in web-planner per UI-011.
- [ ] Active screen's primary entity (task ID or plan ID) automatically passed to agent on panel open per UI-012.
- [ ] Execution-mode control displayed in copilot panel; mode resolved at turn start per UI-013 + FR-014.
- [ ] Copilot does NOT display history from the global chat surface; scoped to the screen per UI-014.
- [ ] Kernel `audit_event` written in same DB tx for every copilot turn per §13 T1-2.
- [ ] **E2E** — Open task in Planner; click copilot icon; ask "what's the status of this task?"; see grounded answer with citation to the task.

#### AI Execution Notes

FE: Add `<InlineCopilot taskId={task.id} />` (or `planId`) to the task-detail modal and plan-detail page in `apps/web-planner`. Component renders as a collapsible panel using `@future/ui` primitives. Passes `entityContext: { type: 'task' | 'plan', id: string }` to the agent tRPC call. Inline copilot creates its own ephemeral conversation per screen visit — do not reuse the global conversation. Import entity-context type from `packages/agent/src/contract.ts`. BE: context resolution in the turn handler extracts `entityContext` and injects it into the system prompt prefix.

#### Testing Notes

- Unit: entity-context extraction in turn handler; copilot conversation isolation (not in global history).
- Integration: copilot turn creates audit row; entity-context logged in audit.
- E2E: Playwright — open task detail → open copilot → send question referencing "this task" → verify answer is task-grounded.

#### Dependencies

- Blocked by: AGN-1.S1, AGN-1.S4, AGN-1.S5, AGN-1.S2-CONTRACT
- Blocks: AGN-2.S1 (Planner reads build on copilot surface)

#### Definition of Done

- Inherits project DoD.
- Copilot visible in task-detail modal and plan-detail page.
- Copilot conversation isolation test passes.

---

### [STORY] AGN-1.S4 Conversation + turn data model

ID: AGN-1.S4
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 140
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want a conversation + turn schema in `apps/api/src/modules/agents/`, so that conversations are durably stored and replayable per FR-046..049.

#### Acceptance Criteria

- [ ] Schema tables: `agents.conversation`, `agents.turn`, `agents.message`, `agents.tool_call`, `agents.tool_result`.
- [ ] Every table carries `tenant_id`; RLS policy applied per CLAUDE.md + NFR-009.
- [ ] `trace_id` field on every `agents.turn`; immutable after creation.
- [ ] Prompt store (`agents.prompt_store`) content-addressed by SHA-256 hash per FR-047 + DB-005; identical prompts stored once.
- [ ] Replay-by-trace: given a `trace_id`, the system can reconstruct the prompt, tool-call sequence, and outcome per FR-046..049 (forward-link AGN-7.S4).
- [ ] Kernel `audit_event` written in same DB tx for every conversation create and turn per §13 T1-2.
- [ ] **E2E** — Write a turn; retrieve by trace_id; verify prompt, tool calls, and outcome are all present.

#### AI Execution Notes

Schema path: `apps/api/src/modules/agents/infrastructure/schema/`. Tables: `conversation(id, tenant_id, user_id, created_at, execution_mode, deleted_at)`, `turn(id, tenant_id, conversation_id, trace_id, prompt_hash, started_at, ended_at, cancel_reason, cost_usd)`, `message(id, tenant_id, turn_id, role, content_text, output_shape, citations jsonb)`, `tool_call(id, tenant_id, turn_id, tool_name, input_args jsonb, started_at)`, `tool_result(id, tenant_id, tool_call_id, output_ref, is_tainted, completed_at)`, `prompt_store(hash text PK, tenant_id, content text, created_at)`. Drizzle schema only — no numbered migrations (CLAUDE.md). Do NOT use `Promise.all` for sequential DB queries.

#### Testing Notes

- Unit: prompt-store hash uniqueness; turn entity invariants (trace_id immutable).
- Integration: RLS dual-tenant probe — tenant A cannot read tenant B conversations; prompt-store deduplication under concurrent insert.
- E2E: write turn → retrieve by trace_id → assert all fields present.

#### Dependencies

- Blocked by: FOUND-2.T5 (RLS infrastructure)
- Blocks: AGN-1.S2, AGN-1.S3, AGN-1.S5

#### Definition of Done

- Inherits project DoD.
- RLS dual-tenant probe passes against all `agents.*` tables.
- Prompt-store uniqueness test: concurrent inserts of identical prompt hash → exactly one row.

---

### [STORY] AGN-1.S5 SSE streaming with TTFT p95 ≤ 2.5s

ID: AGN-1.S5
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 150
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want the agent's response to stream progressively with the first content token arriving within 2.5 seconds (p95), so that I have immediate feedback that the system is working.

#### Acceptance Criteria

- [ ] Output shape transmitted as a metadata SSE frame BEFORE the first content token per FR-004 + §13 A1.
- [ ] TTFT measured from request-acceptance to the first **content** token — the shape frame does NOT count toward TTFT per §13 A1.
- [ ] p95 TTFT ≤ 2.5s in production observability (NFR-001); metric emitted as OTLP span attribute per EI-006.
- [ ] Total turn wallclock hard-aborted at 30s for interactive turns per NFR-002.
- [ ] Cancellation propagates to next ceasing point within 1s per NFR-008 (forward-link AGN-7.S6).
- [ ] Graceful degradation: if TTFT breaches 5s, a user-visible spinner with "still working…" message appears.
- [ ] **E2E** — Send 100 chat turns of varied output shapes; observe p95 TTFT ≤ 2.5s via OTLP metrics.

#### AI Execution Notes

BE: Vercel AI SDK `streamText` / `streamObject` over SSE route `POST /api/agents/turn/stream`. First SSE event: `event: shape\ndata: {"shape":"list"}\n\n`; subsequent events are content chunks. TTFT instrumentation: record `request_accepted_at` in handler; emit `ttft_ms` OTLP attribute on first content event. Hard abort: `AbortSignal.timeout(30_000)` threaded into OpenAI call. Cancellation: client closes EventSource → server receives `req.signal` abort → propagate to OpenAI `AbortController`. FE: use `EventSource` (or `fetch` streaming); first `shape` event pre-renders the skeleton layout before content arrives.

#### Testing Notes

- Unit: shape-frame emitted before first content chunk (parse SSE frames in sequence).
- Integration: timeout abort at 30s (mock slow OpenAI); cancellation within 1s.
- E2E: 100 turns load test; assert p95 TTFT ≤ 2.5s from OTLP export.
- Metric: confirm `ttft_ms` OTLP span attribute present on every turn.

#### Dependencies

- Blocked by: AGN-1.S4 (turn model), AGN-1.S2-CONTRACT (contract defines SSE frame schema)
- Blocks: AGN-1.S2, AGN-1.S3

#### Definition of Done

- Inherits project DoD.
- TTFT metric emitted and queryable in OTLP backend.
- 100-turn E2E p95 ≤ 2.5s assertion in CI (load test).

---

### [STORY] AGN-1.S6 Output-shape declaration

ID: AGN-1.S6
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 3
Rank: 160
Jira Key:
Confluence Link:

#### Summary

As an Engineer/Employee, I want each agent response to declare its output shape before the first content token, so that the UI can pre-render the correct layout skeleton without reflow.

#### Acceptance Criteria

- [ ] Shape enum defined: `short | list | table | narrative | chart` per FR-004.
- [ ] Shape transmitted as a metadata SSE frame before the first content token (per AGN-1.S5 + §13 A1).
- [ ] UI pre-renders the appropriate layout skeleton on receipt of the shape frame before content arrives per UI-005.
- [ ] Shape selection validated in `packages/agent/src/contract.ts` (imported by both FE and BE).
- [ ] `chart` shape renders a placeholder with "Chart coming soon" for Phase 1 (chart rendering is deferred to AGN-6).
- [ ] **E2E** — For each shape type, verify skeleton renders before first content token.

#### AI Execution Notes

BE: shape classifier prompt (`gpt-5.4-nano`) runs as the first step of turn handling — takes the user's query, returns one of the 5 enum values. Shape is written to `agents.message.output_shape`. FE: `<MessageSkeleton shape={declaredShape} />` component switches between `<ListSkeleton>`, `<TableSkeleton>`, `<NarrativeSkeleton>`, `<ShortSkeleton>`, `<ChartPlaceholder>` — all using `<Skeleton />` from `@future/ui`. Shape frame arrives before content chunks; skeleton is swapped for real content on first content token.

#### Testing Notes

- Unit: shape classifier returns valid enum for representative queries; skeleton component renders for each shape variant.
- Integration: shape frame arrives before first content chunk in SSE stream.
- E2E: send queries expected to produce each shape; verify skeleton pre-renders.

#### Dependencies

- Blocked by: AGN-1.S5 (SSE streaming), AGN-1.S2-CONTRACT
- Blocks: AGN-1.S2 (UI uses shape skeleton)

#### Definition of Done

- Inherits project DoD.
- All 5 shape variants have skeleton UI and passing E2E assertion.
- Shape classifier unit test covers at least 10 representative queries per shape.

---

### [STORY] AGN-1.S7 Citations contract

ID: AGN-1.S7
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 5
Rank: 170
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want every output that references platform data (tasks, plans, KB passages) to include source citations, so that I can navigate to the underlying record.

#### Acceptance Criteria

- [ ] Citation format defined in `packages/agent/src/contract.ts`: `{ type: 'task' | 'plan' | 'kb_section', id: string, label: string, href?: string }` per FR-006.
- [ ] Every agent answer that references Planner tasks or plans includes at least one citation per FR-006 + FR-061.
- [ ] Every KB-grounded answer includes source document + section citation (forward-link AGN-3.S4).
- [ ] UI renders citation as a click-to-navigate link per UI-006; cross-zone navigation uses hard `<a>` reload per CLAUDE.md.
- [ ] Citations included in `agents.message.citations` jsonb column (from AGN-1.S4 schema).
- [ ] **E2E** — Ask a question grounded in a known task; verify citation renders; click citation; verify navigation to Planner task-detail.

#### AI Execution Notes

BE: citation extraction in turn post-processor — after OpenAI response, parse structured citation objects from response JSON (using EI-002 structured output). Planner task citations: `{ type: 'task', id: task_id, label: task.title, href: '/planner/tasks/{id}' }`. Plan citations: `{ type: 'plan', id: plan_id, label: plan.name, href: '/planner/plans/{id}' }`. KB citations: `{ type: 'kb_section', id: doc_id, label: 'section anchor', href: undefined }` (href available once AGN-3 done). FE: `<CitationChip citation={c} />` using `<Button variant="ghost" size="sm" asChild><a href={c.href}>` for cross-zone links.

#### Testing Notes

- Unit: citation extraction parser; `<CitationChip>` renders link for each type.
- Integration: answer with task reference produces citation row in `agents.message.citations`.
- E2E: grounded answer → citation chip visible → click → navigates to Planner task.

#### Dependencies

- Blocked by: AGN-1.S2 (surface), AGN-1.S4 (message schema), AGN-1.S2-CONTRACT
- Blocks: AGN-3.S4 (KB citations extend this contract)

#### Definition of Done

- Inherits project DoD.
- Citation contract in `packages/agent/src/contract.ts` typechecks in both FE and BE.
- Cross-zone link E2E test passes.

---

### [STORY] AGN-1.S8 Multi-conversation switching

ID: AGN-1.S8
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P1
Story Point: 3
Rank: 180
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to have multiple open conversations and switch between them, so that I can work on several topics without losing context.

#### Acceptance Criteria

- [ ] Multiple concurrent conversations per user supported per FR-007.
- [ ] Switching between conversations preserves each conversation's execution mode, history, and pending drafts per FR-007.
- [ ] Conversation list in chat sidebar grouped by recency per UI-002.
- [ ] New-conversation button creates a fresh conversation in Default-approvals mode.
- [ ] Active conversation highlighted in sidebar; conversation title derived from first user message (truncated to 60 chars).
- [ ] Kernel `audit_event` written in same DB tx for conversation create per §13 T1-2.
- [ ] **E2E** — Create two conversations; set different execution modes; switch; verify each retains its mode and history.

#### AI Execution Notes

FE: `<ConversationSidebar>` component in `apps/web-agents` — lists conversations from `useConversations()` React Query hook. Selecting a conversation sets the active conversation ID in URL state (`useSearchParams`) per CLAUDE.md SSR/Hydration Safety rules. Never use `localStorage` for active conversation state — use URL params. BE: `conversation.list` tRPC query returns user's conversations ordered by `updated_at desc`. Conversation create initialises `execution_mode = 'default'`.

#### Testing Notes

- Unit: conversation list ordering; execution mode isolation between conversations.
- Integration: two-conversation switch preserves independent execution modes.
- E2E: create two conversations → set different modes → switch → verify.

#### Dependencies

- Blocked by: AGN-1.S2 (chat surface), AGN-1.S4 (conversation model)
- Blocks: none in S3 (AGN-4 uses execution mode from this story)

#### Definition of Done

- Inherits project DoD.
- URL-state-based conversation switching (no localStorage).
- Execution-mode isolation integration test passes.

---

### [STORY] AGN-1.S2-CONTRACT Agents internal FE/BE contract publication

ID: AGN-1.S2-CONTRACT
Status: Backlog
Epic: AGN-1
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 2
Rank: 190
Jira Key:
Confluence Link:

#### Summary

As an engineer working the Agents FE/BE split, I want a published internal contract in `packages/agent` between FE and BE on S3 day-1, so that the two sub-tracks can develop in parallel without integration drift (design §13 risk #16).

#### Acceptance Criteria

- [ ] `packages/agent` workspace created via `turbo gen workspace` (never manually).
- [ ] `packages/agent/src/contract.ts` exports: SSE frame schema, output-shape enum, citation type, entity-context type, conversation DTO, turn DTO.
- [ ] Both `apps/web-agents` and `apps/api` import types exclusively from `packages/agent/src/contract.ts`; no ad-hoc in-package type duplication.
- [ ] Package builds clean (`bun run --filter @future/agent build`).
- [ ] **E2E** — An FE-only PR can `bun run tsc --noEmit` against the contract without the BE service running.

#### AI Execution Notes

`packages/agent/src/contract.ts` — pure TypeScript, zero runtime dependencies, zero NestJS/Next.js deps. Export types only; no enums (use `const` + `typeof` pattern for tree-shaking). Key exports: `OutputShape` (`'short' | 'list' | 'table' | 'narrative' | 'chart'`), `SseFrame` (discriminated union of `ShapeFrame | ContentChunk | ErrorFrame | DoneFrame`), `Citation`, `EntityContext`, `ConversationDto`, `TurnDto`. No `.js` extensions in imports per CLAUDE.md.

#### Testing Notes

- Unit: type exports compile without errors in isolation.
- Typecheck-only CI step: `bun run tsc --noEmit` in `packages/agent`.
- FE isolation test: `apps/web-agents` typechecks with `apps/api` excluded from build.

#### Dependencies

- Blocked by: FOUND-1.T2 (monorepo package structure)
- Blocks: AGN-1.S2, AGN-1.S3, AGN-1.S4, AGN-1.S5, AGN-1.S6, AGN-1.S7

#### Definition of Done

- Inherits project DoD.
- Published S3 day-1 (first day of Sprint 3).
- Zero type errors in FE-only typecheck CI step.

---

## [EPIC] AGN-3 Tenant KB (RAG)

ID: AGN-3
Status: Backlog
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 26
Rank: 300
Jira Key:
Confluence Link:

### Summary

Tenant-curated reference Q&A — handbook, policies, onboarding docs, FAQs — with cited sources and tenant-keyed retrieval. Async chunk + embed + index pipeline. Admin browse / edit / deprecate / re-index. Quotas (1000 docs / 5MB per doc per §13 G3).

### Goal

By S4 close, a Tenant administrator can upload markdown, plain text, and text-extractable PDF documents; the system asynchronously embeds and indexes; an Employee querying via chat receives answers grounded in tenant KB with citations to source document and section.

### Scope

- KB ingestion (markdown, plain text, text-extractable PDF) with image-PDF rejection at upload time per §13 H1.
- Async chunk + embed + index pipeline.
- Tenant-keyed retrieval (no cross-tenant search, NFR-018 launch gate).
- Citations (source document + section per FR-051).
- Admin browse / edit / deprecate / re-index.
- Ingestion notifications (per §13 C3: email + in-app only).
- Failure surface.
- Quotas: 1000 docs / 5MB per doc per §13 G3, tunable per tenant.

### Out of Scope

- OCR ingestion of image-PDFs (Backlog per agents-srs §1.5).
- LLM-as-judge automated quality scoring (Backlog per agents-srs §1.5).

### SRS Coverage

- FR-050..059 + UI-017.

### Acceptance Criteria

- [ ] Daily synthetic cross-tenant probe runs against KB index (cross-link DEPLOY-3.S1, NFR-018).
- [ ] Citations include source document + section.
- [ ] Quotas enforced as hard-error.
- [ ] kernel audit_event for every ingest / retrieval per §13 T1-2.

### Child Tickets

- AGN-3.S1 KB ingestion (markdown, plain text, text-extractable PDF) (Story)
- AGN-3.S2 Async chunk + embed + index pipeline (Story)
- AGN-3.S3 Tenant-keyed retrieval (no cross-tenant search) (Story)
- AGN-3.S4 Citations (source document + section) (Story)
- AGN-3.S5 Admin browse / edit / deprecate / re-index + ingestion notifications + failure surface (Story)
- AGN-3.S6 Quotas (1000 docs / 5MB per doc, tunable per tenant) (Story)

### Definition of Done

- All child Stories Done.
- Daily cross-tenant probe extends to KB index; zero cross-tenant reads in 24h prod window.

---

### [STORY] AGN-3.S1 KB ingestion

ID: AGN-3.S1
Status: Backlog
Epic: AGN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 310
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to upload reference documents (markdown, plain text, text-extractable PDF) through the admin UI, so that the agent can ground its answers in our company's content.

#### Acceptance Criteria

- [ ] Accepted file types: `.md`, `.txt`, `.pdf` (text-extractable only) per FR-053 + CN-10.
- [ ] Image-PDF rejected at upload time via MIME-type check + PDF magic-bytes + text-extraction probe; rejection returns structured error per §13 H1.
- [ ] Upload UI in `apps/web-admin/` (KB management section); uses two-phase upload: pre-signed S3 URL issued by BE → direct client-to-S3 upload → BE finalize event per CLAUDE.md `@future/storage` patterns.
- [ ] Uploaded document record created in `agents.kb_document` with `status = 'pending'` and `tenant_id`.
- [ ] Kernel `audit_event` written in same DB tx on document record creation per §13 T1-2.
- [ ] Storage in S3 with signed URL; bucket path includes `tenant_id` prefix for isolation.
- [ ] **E2E** — Admin uploads a valid `.md` file; record created in pending state. Admin uploads an image-PDF; error shown; no record created.

#### AI Execution Notes

Schema: `agents.kb_document(id, tenant_id, filename, s3_key, mime_type, size_bytes, status, failure_reason, created_at, updated_at)`. S3 key pattern: `kb/{tenant_id}/{doc_id}/{filename}`. Use `@future/storage` signed-URL helper (existing pattern). Image-PDF detection: (1) check `Content-Type: application/pdf` + (2) attempt `pdf-parse` text extraction on first 4KB — if zero text chars extracted, reject. BE finalize endpoint: `POST /trpc/agents.kb.finalize` — triggered by S3 event or client after upload completes; enqueues pg-boss job (AGN-3.S2). No `Promise.all` for sequential DB writes (CLAUDE.md).

#### Testing Notes

- Unit: image-PDF detection logic (mock PDF with zero text content); MIME + magic-bytes check.
- Integration: valid upload flow → record created → audit row present in same tx. Image-PDF → no record, structured error returned.
- E2E: Playwright on web-admin — upload valid markdown → success state. Upload image-PDF → error message rendered.

#### Dependencies

- Blocked by: AGN-1.S2-CONTRACT (storage patterns), FOUND-2 (S3 + storage infra)
- Blocks: AGN-3.S2 (pipeline triggers on finalize), AGN-3.S6 (quota check in finalize)

#### Definition of Done

- Inherits project DoD.
- Image-PDF detection unit test covers: valid text PDF, image-only PDF, mixed PDF (images + text → accepted), blank PDF.
- Audit tx integration test passes for upload finalize.

---

### [STORY] AGN-3.S2 Async chunk + embed + index pipeline

ID: AGN-3.S2
Status: Backlog
Epic: AGN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 8
Rank: 320
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want an async pg-boss pipeline that chunks, embeds, and indexes uploaded KB documents, so that the agent can retrieve passages within the NFR-006 latency target (p95 ≤ 5min for 5MB docs).

#### Acceptance Criteria

- [ ] pg-boss job `agents.kb.embed` enqueued on upload finalize; triggered by `agents.kb.ingested` outbox event per FR-054.
- [ ] Chunking strategy: sliding-window by paragraph (≤512 tokens each, 10% overlap) respecting OpenAI `text-embedding-3-small` token limit per EI-001.
- [ ] Embedding via `text-embedding-3-small` per CLAUDE.md AI stack; direct OpenAI call per §13 T1-9 (no multi-provider abstraction in MVP).
- [ ] Chunks + embeddings stored in `agents.kb_chunk` and `agents.kb_embedding` (pgvector) with `tenant_id` on every row per DB-001.
- [ ] Outbox event `agents.kb.ingested` emitted on pipeline success.
- [ ] Failure path: document `status` set to `'failed'` with structured `failure_reason` per FR-059; notification emitted to admin (forward-link AGN-3.S5).
- [ ] p95 ≤ 60s for docs ≤ 1MB; p95 ≤ 5min for docs ≤ 5MB per NFR-006.
- [ ] **E2E** — Upload a 5MB text document; verify pipeline completes within 5min (p95); verify chunk + embedding rows present in DB.

#### AI Execution Notes

Job handler: `apps/api/src/modules/agents/application/jobs/kb-embed.job.ts`. Chunker: pure TS function splitting on paragraph boundaries, then sliding-window within paragraphs if token count > 512. Use `tiktoken` or OpenAI token estimator. Batch embedding calls: max 2048 tokens per batch, max 100 chunks per batch request to OpenAI. pgvector column: `embedding vector(1536)` (text-embedding-3-small output dim). Schema: `agents.kb_chunk(id, tenant_id, doc_id, chunk_index, text, token_count)`, `agents.kb_embedding(chunk_id, tenant_id, embedding vector(1536))`. Index: `CREATE INDEX ON agents.kb_embedding USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`. Do NOT use `Promise.all` for sequential DB inserts (CLAUDE.md). Mark `needs-human-review` for IVFFlat list count tuning.

#### Testing Notes

- Unit: chunker produces chunks within token limit; overlap logic; batch-size boundary.
- Integration: end-to-end pipeline on a 500KB markdown file; verify chunk count + embedding rows; failure path test (mock OpenAI error → status=failed + failure_reason).
- E2E: 5MB upload → pipeline completion within 5min window.
- Performance: load test embedding batch against OpenAI staging; validate p95 latency.

#### Dependencies

- Blocked by: AGN-3.S1 (document record + S3 upload), FOUND-2 (pg-boss infra)
- Blocks: AGN-3.S3 (retrieval needs index)

#### Definition of Done

- Inherits project DoD.
- IVFFlat index in `0000_initial.sql` (per one-file migration rule — CLAUDE.md).
- Chunker unit test: 20 representative documents, all chunks within token limit.
- Failure path integration test asserts `status='failed'` and non-null `failure_reason`.

---

### [STORY] AGN-3.S3 Tenant-keyed retrieval (no cross-tenant search)

ID: AGN-3.S3
Status: Backlog
Epic: AGN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 330
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want tenant-keyed vector retrieval with RLS enforcement, so that no query path can return KB content from another tenant's documents.

#### Acceptance Criteria

- [ ] KB retrieval index keyed by `tenant_id`; RLS on `agents.kb_embedding` enforces tenant isolation at DB layer per NFR-009 + FR-052.
- [ ] No query path can produce a result containing rows from another tenant — enforced at DB layer, not application layer per CN-04.
- [ ] Retrieval returns top-K chunks (K ≤ 8) ordered by cosine similarity per NFR-007 (p95 ≤ 250ms).
- [ ] Daily synthetic cross-tenant probe runs against KB index (cross-link DEPLOY-3.S1, NFR-018); successful cross-tenant read pages on-call.
- [ ] Kernel `audit_event` written for every retrieval per §13 T1-2.
- [ ] **E2E** — Configure tenant A and tenant B with overlapping content; tenant A's query returns zero rows from tenant B; verified via cross-tenant probe.

#### AI Execution Notes

Retrieval handler: `apps/api/src/modules/agents/application/queries/kb-retrieve.handler.ts`. Drizzle query: `db.select(...).from(kb_embedding).where(eq(kb_embedding.tenant_id, tenantId)).orderBy(sql\`embedding <=> ${queryEmbedding}\`).limit(k)`. RLS: session variable `SET LOCAL agents.tenant_id = '...'`set by`RlsMiddleware`before every query. Cross-tenant probe: separate CI/cron job issues a retrieval query with`tenant_id = A`but injects`tenant_id = B`as the search vector origin; asserts zero rows returned from B. No`Promise.all` for DB queries (CLAUDE.md).

#### Testing Notes

- Unit: retrieval handler applies tenant_id filter; cosine similarity ordering.
- Integration: dual-tenant probe — tenant A embedding inserted; tenant B query → zero rows from A. RLS enforced even when application filter removed (direct DB test).
- E2E: two-tenant scenario per AC above.
- Performance: retrieval latency test with 10K embeddings per tenant; assert p95 ≤ 250ms.

#### Dependencies

- Blocked by: AGN-3.S2 (embeddings in index), FOUND-2.T5 (RLS infrastructure)
- Blocks: AGN-3.S4 (citations reference retrieved chunks)

#### Definition of Done

- Inherits project DoD.
- RLS dual-tenant isolation integration test passes (DB-layer only, no application filter).
- Cross-tenant probe integration test passes; probe is wired into daily DEPLOY-3 cron.
- Retrieval p95 ≤ 250ms test passes against realistic corpus.

---

### [STORY] AGN-3.S4 Citations (source document + section)

ID: AGN-3.S4
Status: Backlog
Epic: AGN-3
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 3
Rank: 340
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want every KB-grounded answer to include a citation to the source document and section, so that I can verify the agent's answer and navigate to the original material.

#### Acceptance Criteria

- [ ] Every KB-grounded answer includes source citation per FR-051 + FR-006: `{ type: 'kb_section', doc_id, section_anchor, document_title, chunk_text_excerpt }`.
- [ ] Citation format extends the contract from AGN-1.S7: `packages/agent/src/contract.ts` `Citation` type gains `kb_section` variant.
- [ ] UI renders KB citation as a readable label (document title + section anchor); no navigation link at Phase 1 (document viewer deferred).
- [ ] Citations stored in `agents.message.citations` jsonb (from AGN-1.S4).
- [ ] **E2E** — Ask a question that should be grounded in an uploaded handbook section; verify the answer includes a citation with the correct document title and section anchor.

#### AI Execution Notes

BE: after retrieval (AGN-3.S3) returns top-K chunks, the turn handler bundles chunk metadata as citation candidates and passes them to the LLM via structured context. LLM uses EI-002 structured output to return citation references alongside its answer. Section anchor: derived from the first heading encountered in the chunk text (regex for `## ` or `# ` prefix). FE: `<KbCitationChip doc_title={...} section={...} />` — uses `<Button variant="ghost" size="sm">` (no href for Phase 1) from `@future/ui`.

#### Testing Notes

- Unit: section anchor extraction from chunk text (heading regex); citation bundling in turn handler.
- Integration: KB-grounded turn produces citation rows in `agents.message.citations`.
- E2E: handbook Q&A → citation present with correct doc title and section.

#### Dependencies

- Blocked by: AGN-3.S3 (retrieval), AGN-1.S7 (citation contract)
- Blocks: none in S4 (AGN-5 admin surface uses this)

#### Definition of Done

- Inherits project DoD.
- Citation contract extended in `packages/agent/src/contract.ts` (zero type errors in FE and BE).
- KB citation E2E test passes with real uploaded document.

---

### [STORY] AGN-3.S5 Admin browse / edit / deprecate / re-index + ingestion notifications + failure surface

ID: AGN-3.S5
Status: Backlog
Epic: AGN-3
Sprint: Sprint-4
Release: phase-1
Priority: P1
Story Point: 5
Rank: 350
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to browse, edit metadata, deprecate, and re-index KB documents through the admin UI, and receive notifications on ingestion completion and failure, so that I can manage the knowledge base without engineering involvement.

#### Acceptance Criteria

- [ ] Admin UI in `apps/web-admin` lists all KB documents for the tenant with status, size, upload date, last-indexed date per UI-017 + FR-055.
- [ ] Administrator can edit document metadata (display name, tags); cannot edit raw content — must re-upload per FR-055.
- [ ] Deprecate action sets `status = 'deprecated'`; deprecated documents excluded from retrieval but shell retained per DB-004 retention table.
- [ ] Re-index action triggers a fresh `agents.kb.embed` pg-boss job for the document per FR-055.
- [ ] Ingestion completion notification sent via email + in-app per §13 C3 (no Slack/Teams) per FR-056; includes per-document errors if any.
- [ ] Failure reasons surfaced in admin UI: `parse_error | embedding_timeout | quota_exceeded | unknown` per FR-059.
- [ ] Kernel `audit_event` written for every admin mutation per §13 T1-2.
- [ ] **E2E** — Upload doc → ingestion completes → admin receives in-app notification → admin deprecates doc → retrieval returns zero results for deprecated doc.

#### AI Execution Notes

FE: `apps/web-admin/app/agents/kb/page.tsx`. Use `<DataTable>` or `<Table>` from `@future/ui` for document list. Status badges via `<Badge>` from `@future/ui`. Deprecation confirmation via `<AlertDialog>` from `@future/ui`. BE: `agents.kb.list`, `agents.kb.edit`, `agents.kb.deprecate`, `agents.kb.reindex` tRPC procedures. Notification emission: outbox event `agents.kb.ingested` (success) / `agents.kb.ingest_failed` consumed by notification module — agents module does not call notification module directly (hexagonal boundary). Per §13 C3: email + in-app only; no Slack. Do NOT use `Promise.all` for sequential DB queries (CLAUDE.md).

#### Testing Notes

- Unit: deprecate handler sets status correctly; re-index enqueues pg-boss job.
- Integration: deprecated doc excluded from retrieval query; notification event in outbox after ingestion.
- E2E: full admin lifecycle — upload → ingest → notify → deprecate → verify retrieval exclusion.

#### Dependencies

- Blocked by: AGN-3.S2 (pipeline), AGN-3.S3 (retrieval for deprecation effect)
- Blocks: none in S4

#### Definition of Done

- Inherits project DoD.
- Deprecation → retrieval exclusion integration test passes.
- Notification outbox event emitted; E2E asserts in-app notification appears in admin inbox.

---

### [STORY] AGN-3.S6 Quotas (1000 docs / 5MB per doc, tunable per tenant)

ID: AGN-3.S6
Status: Backlog
Epic: AGN-3
Sprint: Sprint-4
Release: phase-1
Priority: P1
Story Point: 2
Rank: 360
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want document-count and per-document-size quotas enforced as hard errors, with quota-remaining visibility in the admin UI, so that I can manage storage and costs predictably.

#### Acceptance Criteria

- [ ] Default quotas: 1000 documents per tenant, 5MB per document per §13 G3 + FR-057 + FR-058.
- [ ] Quotas tunable per tenant by platform administrators (via web-admin platform-admin section); stored in `agents.kb_quota(tenant_id, doc_limit, doc_size_bytes_limit)`.
- [ ] Hard-error on upload finalize when document count ≥ doc_limit: structured error `QUOTA_EXCEEDED` returned; no document record created.
- [ ] Hard-error on upload finalize when file size > doc_size_bytes_limit: structured error `DOC_TOO_LARGE` returned.
- [ ] Admin UI displays quota-remaining bar: `X / 1000 documents used` per UI-017.
- [ ] Kernel `audit_event` written for quota-config changes per §13 T1-2.
- [ ] **E2E** — Set tenant quota to 2 documents; upload 2 → succeed; upload 3rd → `QUOTA_EXCEEDED` error shown. Upload 6MB file → `DOC_TOO_LARGE` error shown.

#### AI Execution Notes

Schema: `agents.kb_quota(tenant_id PK, doc_limit int4 DEFAULT 1000, doc_size_bytes_limit int8 DEFAULT 5242880)`. Quota check in `agents.kb.finalize` handler: count `agents.kb_document` rows where `tenant_id = X AND status != 'deprecated'`; compare to `doc_limit`. Size check: compare `Content-Length` header (set by S3 finalize event) to `doc_size_bytes_limit`. Do NOT use `Promise.all` for count + insert sequence (CLAUDE.md). Default quota row auto-inserted on tenant provisioning (idempotent upsert).

#### Testing Notes

- Unit: quota check logic (count ≥ limit → reject); size check.
- Integration: at-cap upload → QUOTA_EXCEEDED; over-size upload → DOC_TOO_LARGE; quota update → new limit takes effect immediately.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-3.S1 (upload finalize hook exists)
- Blocks: none (enforced in finalize path)

#### Definition of Done

- Inherits project DoD.
- Quota enforcement unit tests cover boundary conditions (at-cap, one-under-cap, over-size).
- Quota-remaining bar renders correct values after each upload in E2E test.

---

## [EPIC] AGN-4 Execution-mode framework + approval inbox

ID: AGN-4
Status: Backlog
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 28
Rank: 400
Jira Key:
Confluence Link:

### Summary

Per-conversation Default vs Bypass execution mode with non-bypassable floor (bulk / cross-target / destructive). Approval-inbox event contract per §13 T1-1: agents emit drafts, inbox owns TTL/auto-reject. Conservative-secure taint flag per §13 B1. Idempotency keys, permission-envelope-at-draft-time, revalidation on confirm.

### Goal

By S4 close, an Employee can switch a conversation between Default and Bypass mode, drafted writes land in the platform approval inbox via documented event contract, and the inbox owns TTL/auto-reject (Agents stays stateless past draft emission).

### Scope

- Default vs Bypass mode selection per conversation (FR-008..010).
- Mode resolution at turn start, immutable mid-turn (FR-014).
- Non-bypassable floor — bulk / cross / destructive (FR-012..013).
- Tenant admin disable Bypass tenant-wide (FR-015), per-tool always-confirm (FR-016).
- Free-text taint flag (per §13 B1, FR-017).
- Approval-inbox event contract emitter (per §13 T1-1, FR-040..045).
- Idempotency keys per FR-044.
- Permission envelope captured at draft time per FR-045.
- Revalidation on confirm per FR-042/FR-043.

### Out of Scope

- Approval inbox UI (platform-owned, not Agents).
- AI config admin (AGN-6).

### SRS Coverage

- FR-008..018, FR-040..045 + UI-013, UI-022.

### Acceptance Criteria

- [ ] Default mode previews each write as structured intent before execution.
- [ ] Bypass mode executes single-target writes inline (FR-010).
- [ ] Non-bypassable floor always routes to inbox regardless of mode (FR-012/013).
- [ ] Free-text taint flag forces inbox routing per §13 B1.
- [ ] Drafted writes carry idempotency key + permission envelope.
- [ ] On confirmation, revalidation re-runs preconditions per FR-042; failure → structured event + initiator notified per FR-043.
- [ ] kernel audit_event for every mode change, every draft emission, every revalidation outcome per §13 T1-2.

### Child Tickets

- AGN-4.S1 Default vs Bypass mode selection per conversation (Story)
- AGN-4.S2 Non-bypassable floor — bulk / cross / destructive (Story)
- AGN-4.S3 Mode resolution at turn start (immutable mid-turn) (Story)
- AGN-4.S4 Tenant admin disable Bypass tenant-wide + per-tool always-confirm (Story)
- AGN-4.S5 Free-text taint flag (conservative-secure per §13 B1) (Story)
- AGN-4.S6 Approval-inbox event contract emitter (per §13 T1-1) (Story)

### Definition of Done

- All child Stories Done.
- Approval-inbox round-trip integration test passes (draft emission → confirmation event consumed → revalidation → execute).

---

### [STORY] AGN-4.S1 Default vs Bypass mode selection per conversation

ID: AGN-4.S1
Status: Backlog
Epic: AGN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 410
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to select Default or Bypass execution mode per conversation, so that I can choose between previewing writes before execution and executing single-target writes inline.

#### Acceptance Criteria

- [ ] Per-conversation mode selector rendered in chat UI per UI-013; default is Default mode on new conversation creation per FR-008.
- [ ] Default mode previews each write as a structured intent block before execution per FR-009; user confirms or cancels per UI-022.
- [ ] Bypass mode executes single-target writes inline without an approval step per FR-010.
- [ ] Mode persists per conversation; stored in `agents.conversation.execution_mode`; survives page reload.
- [ ] Mode change takes effect on the **next** turn (not current); see AGN-4.S3.
- [ ] kernel audit_event written in same DB tx for every mode change per §13 T1-2.
- [ ] **E2E** — Switch mode mid-conversation; send a write turn; verify mode resolved at turn start reflects the switch; verify previous turn is unaffected.

#### AI Execution Notes

FE: `<ExecutionModeControl>` toggle in chat header (`apps/web-agents`); uses `<Button>` + `<Badge>` from `@future/ui`. Mode stored in URL state and synced to server via `agents.conversation.setMode` tRPC mutation. BE: `agents.conversation` schema gains `execution_mode enum('default','bypass') NOT NULL DEFAULT 'default'`. Mode resolution per FR-014 lives in AGN-4.S3. Never read `window.location` for mode state — use `useSearchParams` per CLAUDE.md SSR rules. Do NOT use `Promise.all` for sequential DB writes.

#### Testing Notes

- Unit: mode toggle state machine (default → bypass → default); persistence across reload.
- Integration: mode mutation writes audit row in same tx; tx rollback → mode not updated.
- E2E: switch mode → send write-intent turn → verify structured intent preview rendered (Default) or inline execution (Bypass).

#### Dependencies

- Blocked by: AGN-1.S4 (conversation data model), AGN-1.S2 (chat surface)
- Blocks: AGN-4.S2, AGN-4.S3, AGN-4.S5, AGN-4.S6

#### Definition of Done

- Inherits project DoD.
- Mode persists per conversation; audit tx integration test passes.
- E2E: two conversations with different modes retain independent modes across page reloads.

---

### [STORY] AGN-4.S2 Non-bypassable floor — bulk / cross / destructive

ID: AGN-4.S2
Status: Backlog
Epic: AGN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 420
Jira Key:
Confluence Link:

#### Summary

As an Employee and Tenant administrator, I want bulk, cross-target, and destructive tool operations to always route through the approval inbox regardless of conversation mode, so that dangerous operations cannot be silently bypassed.

#### Acceptance Criteria

- [ ] Tools declare `non_bypassable: true` in metadata when they are bulk batch, cross-target, or destructive per FR-012.
- [ ] At turn execution, if any tool in the turn carries `non_bypassable: true`, the turn routes to inbox regardless of the conversation's execution mode per FR-013.
- [ ] Admin per-tool always-confirm pin (FR-016) treated identically to `non_bypassable: true` at resolution time (forward-link AGN-4.S4).
- [ ] Non-bypassable routing is enforced in the turn handler (server-side); no client-side bypass path exists.
- [ ] kernel audit_event written for every non-bypassable routing decision per §13 T1-2.
- [ ] **E2E** — In Bypass mode, invoke a tool declared `non_bypassable: true`; verify it routes to inbox, not inline execution.

#### AI Execution Notes

BE: `ToolMetadata` interface in `packages/agent/src/contract.ts` gains `non_bypassable?: boolean`. Turn handler reads `toolRegistry.get(toolName).non_bypassable` before mode resolution; short-circuits to inbox-emit path regardless of `execution_mode`. Audit event includes `routing_reason: 'non_bypassable_tool'`. No client-side enforcement — server is the authority. Do NOT use `Promise.all` for sequential DB queries.

#### Testing Notes

- Unit: turn handler routes non-bypassable tool to inbox regardless of mode (Default + Bypass).
- Integration: tool with `non_bypassable: true` in Bypass conversation → draft emission confirmed in outbox events table.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-4.S1 (mode model), AGN-4.S6 (inbox emitter)
- Blocks: AGN-4.S4 (always-confirm is the admin-side equivalent)

#### Definition of Done

- Inherits project DoD.
- Non-bypassable routing enforced server-side; no client bypass path.
- Audit event records `routing_reason` for every non-bypassable routing decision.

---

### [STORY] AGN-4.S3 Mode resolution at turn start (immutable mid-turn)

ID: AGN-4.S3
Status: Backlog
Epic: AGN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 3
Rank: 430
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want execution mode resolved exactly once at turn start and held immutable for the duration of that turn, so that mode changes during a streaming turn cannot cause split-brain execution behaviour.

#### Acceptance Criteria

- [ ] Mode resolved from `agents.conversation.execution_mode` at the moment the turn handler starts; stored as a turn-scoped immutable snapshot per FR-014.
- [ ] Any mode change the user triggers during a streaming turn applies only to the next turn; the current turn completes under the originally resolved mode.
- [ ] Mode snapshot recorded in `agents.turn.resolved_execution_mode` for auditability.
- [ ] kernel audit_event records the resolved mode on every turn start per §13 T1-2.
- [ ] **E2E** — Start a long-running turn; toggle mode control during streaming; verify current turn resolves under original mode; verify next turn resolves under new mode.

#### AI Execution Notes

BE: `agents.turn` schema gains `resolved_execution_mode enum('default','bypass') NOT NULL`. Turn handler reads `conversation.execution_mode` once at turn start, writes snapshot to `turn.resolved_execution_mode` in the turn-create DB write (same tx). All subsequent logic in the turn (tool routing, taint checks, inbox routing) reads `turn.resolved_execution_mode`, never `conversation.execution_mode`. FE: mode toggle is always enabled in the UI but labelled "applies to next turn" when a turn is in flight per UI guidance.

#### Testing Notes

- Unit: mode resolution reads conversation mode once; snapshot immutable to subsequent conversation updates.
- Integration: conversation mode updated mid-turn; confirm `turn.resolved_execution_mode` equals pre-update value.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-4.S1 (mode field exists on conversation)
- Blocks: AGN-4.S5, AGN-4.S6 (both read resolved mode from turn)

#### Definition of Done

- Inherits project DoD.
- `turn.resolved_execution_mode` present on every turn row; immutability integration test passes.

---

### [STORY] AGN-4.S4 Tenant admin disable Bypass tenant-wide + per-tool always-confirm

ID: AGN-4.S4
Status: Backlog
Epic: AGN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 440
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to disable Bypass mode for the entire tenant and pin individual tools to always-confirm, so that I can enforce approval governance without relying on individual employees to choose the right mode.

#### Acceptance Criteria

- [ ] Admin in `apps/web-admin` can disable Bypass mode tenant-wide; when disabled, all conversations resolve to Default mode regardless of user selection per FR-015.
- [ ] Admin can pin per-tool always-confirm; pinned tool behaves identically to `non_bypassable: true` at turn resolution per FR-016 (AGN-4.S2 forward-link).
- [ ] Config stored in `agents.exec_policy(tenant_id, bypass_disabled bool, always_confirm_tools text[])`.
- [ ] Policy change takes effect within 5 minutes per FR-083; turn handler re-reads policy on each turn start (not cached beyond TTL).
- [ ] kernel audit_event written for every policy change per §13 T1-2.
- [ ] **E2E** — Admin disables Bypass; user attempts Bypass-mode turn; system resolves to Default for next turn; admin audit log shows change.

#### AI Execution Notes

BE: `agents.exec_policy` table; policy fetched at turn start via `ExecPolicyRepository` (cached with 5-min TTL in memory per FR-083). Turn handler: if `bypass_disabled AND turn.resolved_execution_mode = 'bypass'` → override to `'default'` + emit audit event `reason: 'tenant_policy_override'`. Always-confirm: merge `always_confirm_tools` into `non_bypassable` set at tool resolution. FE: `apps/web-admin/app/agents/exec-policy/page.tsx` — `<Switch>` from `@future/ui` for bypass toggle; multi-select for always-confirm tools. Do NOT use `Promise.all` for policy fetch + turn create.

#### Testing Notes

- Unit: policy override logic (bypass disabled → mode forced to default); always-confirm merge.
- Integration: policy change → turn start reads updated policy within TTL window; audit row present.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-4.S3 (mode resolution logic), AGN-4.S2 (always-confirm treated same as non-bypassable)
- Blocks: AGN-6.S5 (exec-mode policy in AGN-6 delegates to this story)

#### Definition of Done

- Inherits project DoD.
- Policy change propagation integration test passes (change → next turn reflects new policy ≤ 5min).
- Bypass-disable E2E test passes.

---

### [STORY] AGN-4.S5 Free-text taint flag (conservative-secure per §13 B1)

ID: AGN-4.S5
Status: Backlog
Epic: AGN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 5
Rank: 450
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want a per-turn taint flag that activates whenever a tool result contains tenant-authored free text, so that subsequent writes in the same turn are always routed through the approval inbox regardless of conversation mode (conservative-secure per §13 B1).

#### Acceptance Criteria

- [ ] Any tool result containing tenant-authored free text (read OR write outputs) sets a per-turn taint flag in the turn execution context per §13 B1.
- [ ] Once tainted, all subsequent write tool calls in the same turn route through the approval inbox regardless of `turn.resolved_execution_mode`.
- [ ] Taint flag is per-turn — clears at turn start; does not propagate to subsequent turns.
- [ ] Taint origin recorded in `agents.tool_result.is_tainted` (field already in AGN-1.S4 schema) and in the kernel audit_event per §13 T1-2.
- [ ] Tool metadata declares `produces_free_text: true` for tools that return tenant-authored free-text fields (e.g. Planner task title, description).
- [ ] **E2E** — Read a Planner task with a free-text title containing prompt-injection-like content; subsequent reassign attempt routes to inbox even in Bypass mode.

#### AI Execution Notes

BE: `ToolMetadata` gains `produces_free_text?: boolean`. Turn execution context maintains `tainted: boolean` (starts `false`). After each tool result, if `tool.produces_free_text === true` → set `tainted = true` + write `is_tainted = true` to `agents.tool_result` row. Tool router checks `tainted` before mode-based routing: if `tainted && writeOp` → force inbox path. Audit event on taint-origin: `{ event_type: 'taint_activated', tool_name, turn_id }`. Taint does not survive turn boundary — initialized fresh each turn in `turn-executor.ts`.

#### Testing Notes

- Unit: taint activation on free-text tool result; taint-forced inbox routing for subsequent writes; taint cleared at next turn start.
- Integration: read Planner task (free-text) → taint set → write call → inbox routed; confirm `is_tainted=true` on tool_result row; audit event present.
- E2E: as per AC (prompt-injection-like title → reassign → inbox).

#### Dependencies

- Blocked by: AGN-4.S3 (turn execution context), AGN-4.S6 (inbox emitter)
- Blocks: none in S4

#### Definition of Done

- Inherits project DoD.
- Taint-cleared-at-turn-boundary unit test passes.
- Integration test: taint in Bypass mode → write routes to inbox (not inline).

---

### [STORY] AGN-4.S6 Approval-inbox event contract emitter

ID: AGN-4.S6
Status: Backlog
Epic: AGN-4
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 8
Rank: 460
Jira Key:
Confluence Link:

#### Summary

As an engineer, I want the Agents module to emit approval-inbox domain events with a documented shape and consume confirmation events, so that drafted writes can be approved by the platform inbox service while Agents stays stateless past draft emission.

#### Acceptance Criteria

- [ ] Drafted writes emit outbox event with shape `{tenant_id, draft_id, initiator_user_id, tool_id, intent_payload, permission_envelope_at_draft, expires_at}` per §13 T1-1 + FR-040.
- [ ] Confirmation event consumed: `{draft_id, decision, decided_by, decided_at}` per §13 T1-1 + FR-041.
- [ ] On confirmation, agent revalidates precondition state of the underlying domain entity per FR-042.
- [ ] Revalidation failure → structured event written, write not executed, initiator notified (FR-043).
- [ ] Idempotency key per intended side effect; retry with same key returns original outcome per FR-044.
- [ ] Permission envelope captured at draft time; if permissions narrowed before execution → permission-denied path per FR-045.
- [ ] Approval inbox owns TTL / auto-reject per §13 T1-1; Agents does not track expiry state.
- [ ] kernel audit_event for draft emission AND confirmation outcome per §13 T1-2.
- [ ] **E2E** — Create draft in Default mode; confirm; verify write executes idempotently. Create draft, narrow permissions before confirm; verify permission-denied path and initiator notified.

#### AI Execution Notes

Event contract in `packages/event-contracts/src/agents.ts`: `AgentDraftEmitted` and `AgentDraftConfirmed` plain TS types (zero NestJS deps). Outbox: `outbox_event` table in kernel schema; emitted in same DB tx as draft creation per T1-2. Confirmation listener: `AgentDraftConfirmedHandler` in `agents/application/event-handlers/`. Revalidation: call domain entity precondition check (e.g. re-fetch task assignee before reassign); if stale → emit `AgentRevalidationFailed` outbox event + call notification path. Idempotency: `agents.draft(id, idempotency_key unique, status, outcome_ref)`; on duplicate `idempotency_key` → return stored `outcome_ref`. Permission re-check: re-run `kernel.canDo()` at execution time with current user grants; if narrowed → structured deny. Do NOT use `Promise.all` for sequential DB writes.

#### Testing Notes

- Unit: outbox event shape matches contract; idempotency key dedup; permission re-check logic.
- Integration: draft emission → outbox row present in same tx; confirmation consumed → revalidation runs; revalidation failure → `AgentRevalidationFailed` in outbox; idempotency dedup → single execution.
- E2E: as per two scenarios in AC.

#### Dependencies

- Blocked by: AGN-4.S3 (turn execution context carries resolved mode), AGN-4.S5 (taint flag)
- Blocks: none in S4 (consumed by approval inbox platform service)

#### Definition of Done

- Inherits project DoD.
- Event contract published in `packages/event-contracts`; both FE and BE typecheck against it.
- Approval-inbox round-trip integration test passes (emit → confirm → revalidate → execute).
- Idempotency dedup integration test: two identical drafts → one execution.

---

## [EPIC] AGN-6 Tenant administration

ID: AGN-6
Status: Backlog
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 21
Rank: 600
Jira Key:
Confluence Link:

### Summary

Tenant administrator configures LLM model tier, cost ceilings, schedule policy, tool visibility, exec-mode policy, memory policy. Admin audit-event view. <5min config propagation per FR-083. All hosted in web-admin (ADMIN-1 host shell).

### Goal

By S5 close, a Tenant administrator can configure the agent's behaviour, cost limits, schedule policy, allowed tools, exec-mode policy, and memory policy without engineering involvement. Changes propagate within 5 minutes.

### Scope

- LLM model tier selection (FR-076).
- Cost ceilings per-turn / per-user-day / per-tenant-day (FR-077, NFR-004 — $0.10 min-remaining default per §13 G1).
- Schedule policy (FR-078).
- Tool visibility (FR-079).
- Exec-mode policy (FR-080 → AGN-4.S4 governance).
- Memory policy (FR-081, FR-032..035).
- Admin audit-event view (FR-082, UI-019).
- <5min propagation (FR-083).

### Out of Scope

- Approval inbox emitter (AGN-4).
- KB management (AGN-3).
- Platform-admin view (ADMIN-1.S4).

### SRS Coverage

- FR-076..084 + UI-016..019.

### Acceptance Criteria

- [ ] Every admin config change emits a structured kernel audit_event with previous_value, new_value, configuring administrator's identity, timestamp.
- [ ] Config change takes effect within 5 minutes per FR-083.
- [ ] $0.10 min-remaining budget default; tenant-overridable per §13 G1.
- [ ] kernel audit per §13 T1-2 for every change.

### Child Tickets

- AGN-6.S1 LLM model tier selection (Story)
- AGN-6.S2 Cost ceilings per-turn / per-user-day / per-tenant-day (Story)
- AGN-6.S3 Schedule policy (Story)
- AGN-6.S4 Tool visibility (Story)
- AGN-6.S5 Exec-mode policy + memory policy (Story)
- AGN-6.S6 Admin audit-event view + <5min config propagation (Story)

### Definition of Done

- All child Stories Done.
- E2E: admin changes per-turn cost ceiling; new value enforced on next turn within 5 minutes.

---

### [STORY] AGN-6.S1 LLM model tier selection

ID: AGN-6.S1
Status: Backlog
Epic: AGN-6
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 3
Rank: 610
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to select the active LLM model tier for agent turns, so that I can control cost and capability tradeoffs without engineering involvement.

#### Acceptance Criteria

- [ ] Model catalogue drawn from CLAUDE.md AI stack: `gpt-5.4-nano` (classify tier) and `gpt-5.4` (reason tier) per FR-076.
- [ ] Admin selects active tier in `apps/web-admin`; stored in `agents.tenant_ai_config(tenant_id, model_tier enum('nano','reason'))`.
- [ ] Turn handler reads active tier and routes to the appropriate OpenAI model per FR-076; direct OpenAI call per §13 T1-9 (no multi-provider abstraction).
- [ ] Config change takes effect within 5 minutes per FR-083 (5-min TTL cache in turn handler).
- [ ] kernel audit_event written with `previous_value` / `new_value` per §13 T1-2.
- [ ] **E2E** — Admin switches tier; next agent turn uses updated model; audit log reflects change.

#### AI Execution Notes

FE: `<Select>` from `@future/ui` with two options. BE: `agents.tenant_ai_config` upserted on change; turn handler caches via `TenantAiConfigRepository` with 5-min TTL. Audit emission in same DB tx as config write. Do NOT use `Promise.all` for config fetch + turn start.

#### Testing Notes

- Unit: model routing logic (nano vs reason); cache TTL expiry.
- Integration: config change → audit row present; turn handler reads updated tier within TTL.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-1.S4 (turn model), AGN-4.S3 (turn handler exists)
- Blocks: AGN-6.S6 (audit view covers this change)

#### Definition of Done

- Inherits project DoD.
- Audit tx integration test passes.
- Turn handler model-routing unit test covers both tiers.

---

### [STORY] AGN-6.S2 Cost ceilings per-turn / per-user-day / per-tenant-day

ID: AGN-6.S2
Status: Backlog
Epic: AGN-6
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 620
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to set dollar-denominated cost ceilings per-turn, per-user-day, and per-tenant-day, so that I can control agent spending without engineering involvement.

#### Acceptance Criteria

- [ ] Three configurable ceilings: `max_cost_per_turn_usd`, `max_cost_per_user_day_usd`, `max_cost_per_tenant_day_usd` per FR-077.
- [ ] Default values documented; $0.10 minimum-remaining budget enforced (intentional per §13 G1: "lets users spend most of their budget before a ceiling kicks in"); tenant-overridable to a higher floor.
- [ ] Cost-aware ledger tracks spend per user per day and per tenant per day per NFR-005; stored in `agents.cost_ledger(tenant_id, user_id, date, total_cost_usd)`.
- [ ] Turn rejected with structured error `BUDGET_EXCEEDED` before OpenAI call when ceiling would be breached per NFR-004.
- [ ] Admin UI shows current spend vs ceiling per user/tenant per UI-016.
- [ ] kernel audit_event for every ceiling config change with previous_value / new_value per §13 T1-2.
- [ ] **E2E** — Set per-turn ceiling to $0.01; send a turn that would cost $0.05; verify `BUDGET_EXCEEDED` error returned; ledger unchanged.

#### AI Execution Notes

BE: `agents.tenant_cost_config(tenant_id, max_turn_usd, max_user_day_usd, max_tenant_day_usd, min_remaining_usd DEFAULT 0.10)`. Pre-turn check: fetch ledger rows sequentially (no `Promise.all`), compare running total + estimated turn cost to ceilings. OpenAI token-count estimate: use `tiktoken` on prompt before calling API. Ledger row written in same DB tx as turn completion with actual cost from OpenAI usage response. $0.10 min-remaining: if `ceiling - spent < 0.10` → reject (rationale: avoids partial turns that waste budget on incomplete responses).

#### Testing Notes

- Unit: ceiling check logic (per-turn, per-user-day, per-tenant-day); min-remaining floor; ledger accumulation.
- Integration: ceiling breach → turn rejected before OpenAI call; ledger not incremented on rejection; audit row present on config change.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-1.S4 (turn model — cost field), AGN-6.S1 (model tier affects cost estimate)
- Blocks: AGN-6.S6 (audit view includes spend data)

#### Definition of Done

- Inherits project DoD.
- Pre-turn budget check unit test covers: under ceiling, at ceiling, over ceiling, min-remaining floor.
- Ledger tx integration test: failed turn → ledger not incremented.

---

### [STORY] AGN-6.S3 Schedule policy

ID: AGN-6.S3
Status: Backlog
Epic: AGN-6
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 630
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to configure maximum concurrency, allowed schedule windows, and per-schedule cost caps, so that scheduled agent runs do not overload the system or exceed budget outside approved windows.

#### Acceptance Criteria

- [ ] Admin configures `max_concurrent_schedules`, allowed `schedule_windows` (time-of-day ranges), and `per_schedule_cost_cap_usd` per FR-078.
- [ ] Stored in `agents.schedule_policy(tenant_id, max_concurrent int4, windows jsonb, per_schedule_cost_cap_usd numeric)`.
- [ ] Scheduled run rejected at dispatch time if it would exceed max concurrency or fall outside an allowed window per FR-078.
- [ ] Per-schedule cost cap enforced the same way as per-turn ceiling (AGN-6.S2 logic reused).
- [ ] kernel audit_event for every policy change per §13 T1-2.
- [ ] Cross-link AGN-5 (scheduled runs module consumes this policy).
- [ ] **E2E** — Set max concurrency to 1; trigger two concurrent schedules; second is queued or rejected with structured error.

#### AI Execution Notes

Policy stored in `agents.schedule_policy`; consumed by the scheduled-run dispatcher in AGN-5 (forward-link). Window enforcement: `schedule_windows` is a jsonb array of `{days: string[], start_utc: string, end_utc: string}`. Dispatch check runs sequentially: fetch policy → count active runs → check window → check cost cap. No `Promise.all`.

#### Testing Notes

- Unit: window enforcement (in-window, out-of-window, boundary); concurrency count check.
- Integration: policy change → next dispatch reflects new limits; audit row present.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-6.S1 (tenant_ai_config pattern), AGN-6.S2 (cost cap logic reuse)
- Blocks: AGN-5 (scheduled runs consume schedule policy)

#### Definition of Done

- Inherits project DoD.
- Concurrency + window enforcement unit tests cover boundary conditions.
- Audit tx integration test passes for policy change.

---

### [STORY] AGN-6.S4 Tool visibility

ID: AGN-6.S4
Status: Backlog
Epic: AGN-6
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 640
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to disable specific tools tenant-wide, so that I can prevent the agent from invoking capabilities that are not appropriate for our organization.

#### Acceptance Criteria

- [ ] Admin can disable any tool from the registered tool catalogue tenant-wide per FR-079.
- [ ] Stored in `agents.tool_visibility(tenant_id, disabled_tools text[])`.
- [ ] Disabled tool: if invoked by the LLM, turn returns structured error `TOOL_DISABLED` and execution stops without calling the underlying tool per FR-079.
- [ ] Example: admin disables `meeting_action_item_extract` tool; agent responds with tool-unavailable message per FR-079 example.
- [ ] Config change takes effect within 5 minutes per FR-083 (5-min TTL cache in tool router).
- [ ] kernel audit_event for every visibility change per §13 T1-2.
- [ ] **E2E** — Admin disables `planner.task.create`; user asks agent to create a task; agent returns tool-unavailable message; no task created.

#### AI Execution Notes

FE: multi-select checklist of registered tools in `apps/web-admin`. BE: `ToolVisibilityRepository` caches with 5-min TTL. Tool router checks `disabled_tools` set before dispatching; if hit → short-circuit with `TOOL_DISABLED` structured error. Catalogue derived from `ToolRegistry.list()` (tool registration from `packages/agent`). No `Promise.all` for policy fetch + invocation check.

#### Testing Notes

- Unit: disabled tool → TOOL_DISABLED error; tool-not-in-disabled-list → proceeds normally.
- Integration: visibility change → tool router reflects new list within TTL; audit row present.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-4.S2 (tool metadata contract), AGN-6.S1 (config pattern)
- Blocks: AGN-6.S6 (audit view)

#### Definition of Done

- Inherits project DoD.
- Tool-disabled unit test covers: disabled tool invoked, non-disabled tool invoked.
- TTL cache integration test: disable → turn respects new visibility within 5min.

---

### [STORY] AGN-6.S5 Exec-mode policy + memory policy

ID: AGN-6.S5
Status: Backlog
Epic: AGN-6
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 650
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator, I want to configure exec-mode governance and memory retention policies, so that I can enforce approval requirements and control how long agent memory is retained.

#### Acceptance Criteria

- [ ] Exec-mode policy delegates to AGN-4.S4 (disable Bypass tenant-wide; per-tool always-confirm); this story surfaces those controls under the AGN-6 admin shell per FR-080.
- [ ] Memory retention period configurable; default 90 days per FR-032; stored in `agents.memory_policy(tenant_id, retention_days int4 DEFAULT 90)`.
- [ ] Per-turn prompt-token cap configurable per FR-033; default surfaced in admin UI.
- [ ] Admin can disable user-preference memory per FR-034.
- [ ] Per-surface memory override (FR-035 — Should) surfaced as a best-effort config; documented as phase-2 completion target.
- [ ] kernel audit_event for every memory policy change per §13 T1-2.
- [ ] **E2E** — Admin sets retention to 30 days; verify turns older than 30 days are excluded from context on next turn.

#### AI Execution Notes

Memory policy consumed by the context-window assembler (forward-link AGN-2 / context assembly). `agents.memory_policy` row upserted on change; consumed at turn start to filter history. Exec-mode controls: admin form section renders the same `ExecPolicyRepository` flags as AGN-4.S4 — no duplicate schema. Per-turn token cap: passed to context assembler as a hard limit; history truncated to fit. Do NOT use `Promise.all` for policy fetch + history fetch.

#### Testing Notes

- Unit: retention filter (turns older than N days excluded); token cap truncation.
- Integration: memory policy change → context assembly reflects new retention; audit row present.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-4.S4 (exec-mode policy schema exists), AGN-6.S2 (config pattern)
- Blocks: AGN-6.S6 (audit view)

#### Definition of Done

- Inherits project DoD.
- Retention filter unit test: turn at boundary (30 days) included; turn at 31 days excluded.
- Audit tx integration test passes for memory policy change.

---

### [STORY] AGN-6.S6 Admin audit-event view + <5min config propagation

ID: AGN-6.S6
Status: Backlog
Epic: AGN-6
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 660
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator and Auditor, I want a filterable admin audit-event view and guaranteed sub-5-minute config propagation, so that I can review all administrative changes and trust that policy updates take effect promptly.

#### Acceptance Criteria

- [ ] Every admin config change emits a structured kernel audit_event with `previous_value`, `new_value`, configuring administrator's identity, and timestamp per FR-082.
- [ ] Admin audit-event view in `apps/web-admin` filters to administrative change events per UI-019; columns: timestamp, admin identity, config key, previous value, new value.
- [ ] Config change takes effect within 5 minutes per FR-083; enforced by 5-min TTL caches in all AGN-6 config repositories (S1–S5).
- [ ] Audit view supports date-range filter and config-key filter per UI-019.
- [ ] kernel audit_event written in same DB tx as config write per §13 T1-2; tx rollback → no event emitted.
- [ ] **E2E** — Admin changes per-turn cost ceiling; change visible in audit view within 1s; new ceiling enforced on next turn triggered within 5 minutes.

#### AI Execution Notes

FE: `apps/web-admin/app/agents/audit/page.tsx`; `<DataTable>` from `@future/ui`; date-range picker + config-key multi-select filter. BE: `agents.adminAudit.list` tRPC query reads `core.audit_event` filtered to `module = 'agents' AND event_type LIKE 'config.%'`. Propagation guarantee: all AGN-6 config repository caches use `max-age: 300s` (5-min); cache invalidated on mutation. Audit event `event_type` convention: `config.model_tier.changed`, `config.cost_ceiling.changed`, etc. Do NOT use `Promise.all` for audit list fetch.

#### Testing Notes

- Unit: audit event shape validation (all fields present); date-range filter logic.
- Integration: config change → audit row visible in list query; rollback → no row.
- E2E: as per AC — ceiling change → audit view → 5-min enforcement window.

#### Dependencies

- Blocked by: AGN-6.S1..S5 (each emits audit events consumed here)
- Blocks: none in S5

#### Definition of Done

- Inherits project DoD.
- Audit tx rollback integration test passes: config write fails → no audit row.

---

## [EPIC] AGN-7 Governance, replay, cost, GDPR, reliability

ID: AGN-7
Status: Backlog
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 47
Rank: 700
Jira Key:
Confluence Link:

### Summary

Caller-scoped permission inheritance, kernel audit emission on every domain call, deterministic replay-by-trace, dollar-denominated cost ceilings (cache-aware), single-path cancellation with typed reasons, retry + circuit breaker + model-degradation ladder + quality canary, honesty-of-failure user messaging, GDPR right-to-erasure pipeline.

### Goal

By S5 close, every Agents domain call executes as the calling user (never service account), every call writes a structured kernel audit event, any past turn can be replayed deterministically by trace identifier, cost ceilings hold at the dollar level with cache-aware ledger, cancellation propagates within 1s, the model-degradation ladder catches provider issues, quality canary detects tier degradation, honest-of-failure messaging is in place, GDPR right-to-erasure works.

### Scope

- Exec-as-caller everywhere — never service account (FR-019, NFR-010).
- Kernel audit emission per call (correlated by trace) (FR-020..022, NFR-011).
- Memory layers — within-conversation only, no cross-conversation, no cross-tenant (FR-028..031).
- Replay-by-trace (deterministic) + content-addressed prompt store (FR-046..049).
- Cost ledger (cache-aware per NFR-005) + dollar-denominated ceilings (NFR-004, NFR-016).
- Cancellation single path, typed reasons (FR-085..088), <1s propagation (NFR-008).
- Reliability — retry + circuit breaker + model-degradation ladder + quality canary per §13 E2 + honesty-of-failure messaging (FR-036..039).
- GDPR right-to-erasure pipeline (NFR-017).
- (Backlog) k-anonymity floor on aggregate tools (FR-025).

### Out of Scope

- Conversational surfaces (AGN-1).
- Exec-mode UI (AGN-4).

### SRS Coverage

- FR-019..039, FR-046..049, FR-085..088, NFR-001..023.

### Acceptance Criteria

- [ ] No code path elevates to a service account (static analysis assertion).
- [ ] Every domain call writes a kernel audit_event correlated by trace_id.
- [ ] Replay reconstructs past turn deterministically.
- [ ] Cost ledger captures cache-read vs cache-write at distinct prices.
- [ ] Cancellation reaches next ceasing point in <1s.
- [ ] Quality canary detects degradation per §13 E2 definition.
- [ ] GDPR erasure removes personal data while preserving audit trail integrity.

### Child Tickets

- AGN-7.S1 Exec-as-caller everywhere (FR-019, NFR-010) (Story)
- AGN-7.S2 Kernel audit emission per call correlated by trace (Story)
- AGN-7.S3 Memory layers — within-conversation only, no cross-conversation, no cross-tenant (Story)
- AGN-7.S4 Replay-by-trace deterministic + content-addressed prompt store (Story)
- AGN-7.S5 Cost ledger (cache-aware) + dollar-denominated ceilings (Story)
- AGN-7.S6 Cancellation single path, typed reasons, <1s propagation (Story)
- AGN-7.S7 Reliability — retry + circuit breaker + model-degradation + quality canary + honesty-of-failure (Story)
- AGN-7.S8 GDPR right-to-erasure pipeline (Story)
- AGN-7.S9 k-anonymity floor on aggregates (Story, Sprint: Backlog)
- AGN-7.T1 OpenAI integration setup (Task)
- AGN-7.T2 OTLP wiring stub (vendor-agnostic) (Task)
- AGN-7.T3 RTM Appendix D walk-through (Task)
- AGN-7.T4 Daily synthetic cross-tenant probe extension (Task)

### Definition of Done

- All child Stories + Tasks Done (except S9 which is Backlog).
- Static analysis test passes: zero matches for service-account elevation in `apps/api/src/modules/agents/`.
- 7-day prod observation: every domain call has a corresponding audit_event row.
- Replay test: 50 random past turns replayed match original outcomes.
- Cost ledger reconciles to OpenAI billing within 1% over 30-day window.

---

### [STORY] AGN-7.S1 Exec-as-caller everywhere

ID: AGN-7.S1
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 710
Jira Key:
Confluence Link:

#### Summary

As an Auditor and member of the Engineering team, I want every Agents domain call to execute under the calling user's identity with no service-account elevation, so that permission enforcement and audit trails accurately reflect who performed each action.

#### Acceptance Criteria

- [ ] Every call against any platform domain (Planner, People, KB) executes under the calling user's identity.
- [ ] No code path elevates to a service account (FR-019, NFR-010, CN-08).
- [ ] Static analysis test: grep `apps/api/src/modules/agents/` for any `withServiceAccount`, `asSystem`, or equivalent — must return zero matches; this assertion runs in CI.
- [ ] **E2E** — A user without permission to read Plan X attempts to query it via chat; receives permission-denied response; no service-account elevation observed in audit log.

#### AI Execution Notes

Implement a `CallerIdentityMiddleware` that injects the authenticated user's identity into every downstream domain call context. All tool-dispatch paths in `packages/agent` must accept and forward a `CallerContext` (user_id, tenant_id, delegation_ref?) — never a service-account token. Add a CI lint rule (custom ESLint rule or `grep`-based script) that fails the build if `withServiceAccount` / `asSystem` / `asServiceAccount` appear anywhere under `apps/api/src/modules/agents/`. Cross-link AGN-4.S1 (exec-mode caller binding). Do NOT use `Promise.all` for sequential domain calls.

#### Testing Notes

- Unit: CallerIdentityMiddleware injects user context correctly; tool dispatch with missing caller context throws.
- Integration: domain call with low-permission user → permission-denied error; audit log records correct user identity.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-4.S1 (exec-mode caller context pattern)
- Blocks: AGN-7.S2 (audit emission requires caller identity)

#### Definition of Done

- Inherits project DoD.
- CI static analysis assertion passes: zero service-account patterns in `apps/api/src/modules/agents/`.
- Integration test: permission-denied for under-privileged caller; audit row shows real user_id.

---

### [STORY] AGN-7.S2 Kernel audit emission per call correlated by trace

ID: AGN-7.S2
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 720
Jira Key:
Confluence Link:

#### Summary

As an Auditor, I want a structured kernel audit event written for every Agents domain call, correlated by trace_id, so that I can reconstruct "who asked, what ran, under what authority, with which data" in a single query.

#### Acceptance Criteria

- [ ] Structured audit event written for every domain call per FR-020..022 + NFR-011.
- [ ] Audit event fields include: initiator user identifier, tenant identifier, delegation reference (if any), execution mode, confirmation event reference (if any), tool identifier, prompt-version hash, input arguments, output reference, and timestamp per FR-021.
- [ ] Audit query reconstructs "who asked, what ran, under what authority, with which data" in a single query per FR-022.
- [ ] Kernel audit_event written in same DB tx as domain mutation per §13 T1-2; rollback on failure.
- [ ] Every audit event carries the turn's trace_id as a correlation key.

#### AI Execution Notes

Extend `KernelAuditFacade` with an `emitAgentCallAudit(event: AgentCallAuditEvent)` method that writes to `core.audit_event` within the same DB transaction as the domain mutation. `AgentCallAuditEvent` type lives in `packages/event-contracts` (cross-module contract). The turn handler wraps the entire tool-call + audit sequence in a single `db.transaction(async tx => { ... })` block — no `Promise.all`. `trace_id` flows from the SSE session through the turn handler into every audit event. Prompt-version hash = SHA-256 of the assembled prompt string (computed in memory before LLM call; stored as hex string). Output reference = `message_id` of the persisted turn output.

#### Testing Notes

- Unit: AgentCallAuditEvent shape validation (all required fields present); prompt hash computation.
- Integration: domain mutation + audit event in same tx; rollback on mutation failure → no audit row.
- E2E: 10 consecutive turns → 10 audit rows each with distinct trace_id and correct user_id.

#### Dependencies

- Blocked by: AGN-7.S1 (caller identity required for audit initiator field)
- Blocks: AGN-7.S4 (replay needs audit trail), AGN-6.S6 (admin audit view)

#### Definition of Done

- Inherits project DoD.
- Rollback integration test: mutation failure → zero audit rows in that tx.
- Audit query unit test: reconstructs full call context from a single `audit_event` row.

---

### [STORY] AGN-7.S3 Memory layers — within-conversation only, no cross-conversation, no cross-tenant

ID: AGN-7.S3
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 730
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team and as an Auditor, I want agent memory scoped strictly to the current conversation with no cross-conversation or cross-tenant bleed, so that user data stays isolated and the permission boundary is never violated.

#### Acceptance Criteria

- [ ] Memory preserves prior turns / results / preferences within the current conversation per FR-028.
- [ ] Memory does NOT recall content from a different conversation in the same user's history per FR-029.
- [ ] Memory does NOT recall content across tenant boundaries per FR-030.
- [ ] Memory layers do not pre-load any fact the calling user could not retrieve under their own permission scope per FR-031.
- [ ] Kernel audit event written for every memory read/write per §13 T1-2.

#### AI Execution Notes

Context-window assembler (in `packages/agent`) filters history to `conversation_id = current` AND `tenant_id = current` before including turns. Permission-scope check: for any preference or fact loaded from memory, run `canDo()` check against the calling user's permissions — exclude facts the user cannot directly retrieve. Cross-tenant guard: `conversation` table has `tenant_id` column with RLS policy; memory queries respect RLS. Cross-conversation guard: conversation history query always has `WHERE conversation_id = $1` hard-coded — no wildcard. Do NOT use `Promise.all` for history fetch + permission checks.

#### Testing Notes

- Unit: history assembler with two conversations — only current conversation turns included; cross-tenant fact pre-load blocked by canDo() check.
- Integration: two tenants, same user_id — memory reads return zero results across tenant boundary; RLS test.
- E2E: user starts new conversation; agent does not recall facts from previous conversation.

#### Dependencies

- Blocked by: AGN-7.S1 (caller identity), AGN-6.S5 (memory policy schema)
- Blocks: AGN-7.S4 (replay uses memory layer snapshot)

#### Definition of Done

- Inherits project DoD.
- Cross-tenant memory isolation integration test passes (RLS-level enforcement).
- Cross-conversation isolation unit test passes.

---

### [STORY] AGN-7.S4 Replay-by-trace deterministic + content-addressed prompt store

ID: AGN-7.S4
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 8
Rank: 740
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team and as an Auditor, I want any past turn to be reconstructable from its trace_id into the exact same prompt, tool calls, and outcome, so that we can verify deterministic behaviour and support compliance audit replays.

#### Labels

needs-human-review

#### Acceptance Criteria

- [ ] Reconstruct past turn from trace_id into same prompt + same tool calls + same outcome per FR-046.
- [ ] Prompts stored content-addressed by hash in append-only prompt store per FR-047.
- [ ] Per-trace canonicalisation rules ensure prompt-assembly inputs (token budgets, summary selection, preference snapshots) replay deterministically per FR-048.
- [ ] Replay that cannot resolve referenced prompt-store hash raises error and does not fall back to fuzzy match per FR-049.
- [ ] **E2E** — Replay 50 random past turns; outcomes match originals.

#### AI Execution Notes

Prompt store: `agents.prompt_store(hash text PK, content text, created_at timestamptz)` — append-only (no UPDATE/DELETE). Hash = SHA-256(assembled_prompt_string). Turn handler writes prompt hash to `agents.turn(prompt_hash)` before LLM call. Canonicalisation record: `agents.turn_replay_manifest(turn_id, token_budget_snapshot jsonb, summary_selection_ids text[], preference_snapshot jsonb)` — written atomically with the turn. Replay handler: load turn + manifest → reassemble prompt using manifest values → compare prompt hash → if hash mismatch raise `REPLAY_HASH_MISMATCH` (no fallback). Do NOT use `Promise.all` for manifest load + prompt-store lookup.

#### Testing Notes

- Unit: prompt hash computation is deterministic for identical input; REPLAY_HASH_MISMATCH raised for unknown hash.
- Integration: turn written → prompt_store row exists; replay using stored manifest → hash matches original.
- E2E: 50-turn replay test as per AC.

#### Dependencies

- Blocked by: AGN-7.S2 (audit + trace_id), AGN-7.S3 (memory layer snapshot needed for manifest)
- Blocks: AGN-7.T3 (RTM walk-through references replay artefacts)

#### Definition of Done

- Inherits project DoD.
- Replay hash mismatch unit test passes.
- 50-turn E2E replay test passes with zero outcome divergences.

---

### [STORY] AGN-7.S5 Cost ledger (cache-aware) + dollar-denominated ceilings

ID: AGN-7.S5
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 750
Jira Key:
Confluence Link:

#### Summary

As a Tenant administrator and as an Auditor, I want a cache-aware cost ledger and dollar-denominated ceilings enforced per turn, per user-day, and per tenant-day, so that AI spend stays within budget and refusals are transparent.

#### Acceptance Criteria

- [ ] Cost ledger entries include cache-read and cache-write tokens at distinct prices per NFR-005.
- [ ] Per-turn dollar-cost ceiling with $0.10 default minimum-remaining per NFR-004 + §13 G1; tenant-overridable.
- [ ] Per-user-day and per-tenant-day ceilings enforced per NFR-016.
- [ ] Per-delegation cost cap enforced.
- [ ] Query rate limits enforced per user per NFR-016.
- [ ] Refusal when ceiling breached uses honesty-of-failure messaging (cross-link AGN-7.S7).
- [ ] Kernel audit_event written for every ceiling breach per §13 T1-2.

#### AI Execution Notes

Schema: `agents.cost_ledger(id, tenant_id, user_id, turn_id, cache_read_tokens int8, cache_write_tokens int8, non_cached_tokens int8, dollar_cost numeric(12,6), created_at timestamptz)`. Pricing table: `agents.token_price(model text, cache_read_usd_per_1k numeric, cache_write_usd_per_1k numeric, standard_usd_per_1k numeric)`. Turn handler: (1) get current accumulated cost for user-day and tenant-day; (2) estimate turn cost from prompt token count; (3) if estimated cost would breach ceiling → short-circuit with `BUDGET_CEILING_EXCEEDED` (handed to AGN-7.S7 honesty-of-failure path); (4) after LLM response → write actual cost ledger row. Do NOT use `Promise.all` for sequential ceiling checks.

#### Testing Notes

- Unit: cache-read vs cache-write pricing calculation; ceiling breach detection at each granularity.
- Integration: turn exceeds per-turn ceiling → refusal message; ledger row not written for refused turn; audit row written.
- E2E: tenant ceiling set to $0.10; single expensive turn → BUDGET_CEILING_EXCEEDED refusal.

#### Dependencies

- Blocked by: AGN-7.S1 (user identity for per-user ledger), AGN-6.S2 (cost ceiling config)
- Blocks: AGN-7.S6 (budget cancellation reason), AGN-7.S7 (honesty-of-failure for budget refusal)

#### Definition of Done

- Inherits project DoD.
- Cache-aware pricing unit test: cache-read and cache-write billed at correct distinct rates.
- Ceiling breach integration test: user-day ceiling enforced; per-turn ceiling enforced.

---

### [STORY] AGN-7.S6 Cancellation single path, typed reasons, <1s propagation

ID: AGN-7.S6
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 760
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a single cancellation path that covers user-initiated, system-initiated (budget, provider outage, quality canary), and timeout-initiated cancellations distinguished by typed reason, so that I can reliably stop an agent turn and receive an honest explanation.

#### Acceptance Criteria

- [ ] Single cancellation path for user-initiated, system-initiated (budget, provider outage, quality canary), and timeout-initiated cancellations distinguished by typed reason per FR-085.
- [ ] Reason from closed enumeration `user`, `timeout`, `budget`, `provider_outage`, `quality_canary` — no "unknown" per FR-086.
- [ ] User-initiated cancel reaches next ceasing point within <1s latency target per NFR-008.
- [ ] If cancel arrives after write committed, FR-024 (truthful timestamp) applies.
- [ ] Kernel audit_event written for every cancellation with typed reason per §13 T1-2.
- [ ] **E2E** — User clicks cancel; observe ceasing within 1s.

#### AI Execution Notes

Cancellation flows via a `CancellationToken` passed through the turn execution chain (SSE handler → tool dispatcher → LLM streaming client). Token carries a typed `CancellationReason` enum (`user | timeout | budget | provider_outage | quality_canary`). SSE handler listens for HTTP close event (user-initiated) or receives cancellation signal from quality canary / budget check (system-initiated). On signal: (1) set token; (2) tool dispatcher checks token at every tool-call boundary and yields to ceasing; (3) write `turn.cancellation_reason` + audit event in same tx. Truthful timestamp: if partial output was already committed, `turn.completed_at` reflects the actual commit time — no retroactive edit. Do NOT use `Promise.all` for cancellation tx write.

#### Testing Notes

- Unit: CancellationToken propagation through tool dispatcher; each reason code maps correctly.
- Integration: budget cancellation signal → turn stops; audit row has `reason = 'budget'`.
- E2E: user-click cancel → SSE stream stops within 1s; turn record shows `reason = 'user'`.

#### Dependencies

- Blocked by: AGN-7.S5 (budget reason source), AGN-7.S7 (quality_canary reason source)
- Blocks: none in S5 (cross-links to S7 for quality_canary reason)

#### Definition of Done

- Inherits project DoD.
- Cancellation latency integration test: signal to ceasing < 1s (measured in-process).
- Each reason code unit-tested to produce the correct typed enum value.

---

### [STORY] AGN-7.S7 Reliability — retry + circuit breaker + model-degradation + quality canary + honesty-of-failure

ID: AGN-7.S7
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 8
Rank: 770
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team and as an Employee, I want the agent runtime to automatically retry transient failures, open a circuit breaker on persistent provider outage, degrade to a smaller model tier with a user-visible notice, and surface an honest refusal when no answer is available — never a fluent hallucination covering silence.

#### Labels

needs-human-review

#### Acceptance Criteria

- [ ] Model-degradation ladder displays user-visible notice when falling back to smaller / less-capable tier per FR-036.
- [ ] Refusal due to budget, taint, or provider outage uses plain-language refusal naming the reason category per FR-037.
- [ ] No fluent natural-language output covering an empty / missing answer — absence of answer surfaced explicitly per FR-038.
- [ ] When KB retrieval is unavailable, answer from non-KB sources only and disclose KB unavailable per FR-039.
- [ ] Quality canary per §13 E2: success = error-free + within-SLA + no user-rated-negative; rolling 30-min window; 429s and timeouts count as failures.
- [ ] Circuit breaker per NFR-029 ladder: retry 3× with exponential back-off → half-open → open with `provider_outage` cancellation.
- [ ] Kernel audit_event written for every model-tier fallback and circuit-breaker state change per §13 T1-2.

#### AI Execution Notes

Reliability wrapper in `packages/agent/src/reliability/`: `RetryPolicy` (exponential backoff, 3 retries), `CircuitBreaker` (half-open probe after 60s), `ModelDegradationLadder` (primary → secondary → tertiary tier; each step emits a user-visible notice via SSE metadata event). Quality canary: rolling counter per model tier in Redis (or in-process LRU if Redis not available in MVP); counts error-free + within-SLA + not-user-rated-negative responses in 30-min window; if canary failure rate > threshold → fire `quality_canary` cancellation signal. Honesty-of-failure: a `HonestyGuard` wrapper checks final LLM output — if output is purely a paraphrase of "I don't know" hidden behind fluent prose, the guard short-circuits with an explicit absence marker. KB unavailability: retrieval client returns `KB_UNAVAILABLE` error → turn handler adds disclosure note to context before final generation. Do NOT use `Promise.all` for retry + canary check sequence.

#### Testing Notes

- Unit: RetryPolicy — 3 retries then throw; CircuitBreaker state machine; ModelDegradationLadder step order; HonestyGuard blocks fluent-silence output.
- Integration: mock OpenAI returning 429 three times → circuit breaker opens; model tier downgrade notice emitted via SSE.
- E2E: KB unavailable during turn → response includes KB-unavailable disclosure; no fabricated KB answer.

#### Dependencies

- Blocked by: AGN-7.S1 (caller context), AGN-7.S5 (budget refusal path), AGN-7.T1 (OpenAI client wired)
- Blocks: AGN-7.S6 (quality_canary cancellation reason)

#### Definition of Done

- Inherits project DoD.
- Circuit breaker unit test: 3 failures → open state.
- Quality canary rolling-window unit test: 429 counts as failure.
- HonestyGuard unit test: fluent-silence output blocked.

---

### [STORY] AGN-7.S8 GDPR right-to-erasure pipeline

ID: AGN-7.S8
Status: Backlog
Epic: AGN-7
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 8
Rank: 780
Jira Key:
Confluence Link:

#### Summary

As an End user (data subject) and as a Tenant administrator, I want a GDPR right-to-erasure pipeline that removes personal data ingested, stored, or produced by the Agents system while preserving audit trail integrity via anonymisation, so that we comply with GDPR Article 17.

#### Labels

needs-human-review

#### Acceptance Criteria

- [ ] Right-to-erasure removes personal data ingested / stored / produced by the system per NFR-017.
- [ ] Audit-preserving anonymisation: audit trail integrity preserved after erasure (audit rows remain with actor anonymised rather than deleted).
- [ ] Erasure covers: conversation turns, memory snapshots, KB-document authorship metadata, cost ledger user references, and prompt store entries linked to erased user.
- [ ] Erasure request logged as a kernel audit event with erasing administrator's identity.
- [ ] Cross-link DOC-1.T7 runbook (Backlog) for operator procedure.
- [ ] Cross-link Planner UN-PL-10 (erasure of Planner data for the same data subject).
- [ ] **E2E** — Erasure request removes user content; audit query still works with anonymised actor.

#### AI Execution Notes

Erasure pipeline: pg-boss job `agents.gdpr.erase(user_id, tenant_id)` — sequentially: (1) anonymise `core.audit_event` rows (replace `user_id` with `[ERASED]` token, preserve all other fields); (2) delete / anonymise `agents.conversation` + `agents.turn` rows (delete personal content, retain structural metadata for billing reconciliation); (3) delete `agents.memory_snapshot` rows; (4) anonymise `agents.cost_ledger` rows (null out user_id); (5) delete KB authorship metadata; (6) delete prompt_store entries linked only to erased user (entries shared across users: anonymise reference). Write final erasure-complete audit event in same tx as last anonymisation step. Do NOT use `Promise.all` — all steps sequential (single pg client). Cross-module: emit `agents.user.erased` outbox event; Planner module handles its own erasure on receipt.

#### Testing Notes

- Unit: erasure pipeline step order; anonymisation vs deletion logic for each table.
- Integration: full erasure run → audit rows anonymised; conversation content deleted; cost ledger user_id nulled; erasure-complete audit event present.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-7.S2 (audit emission must be in place before erasure anonymises it)
- Blocks: DOC-1.T7 (runbook references this pipeline)

#### Definition of Done

- Inherits project DoD.
- Erasure integration test: user content deleted; audit rows anonymised; erasure-complete event written.
- E2E erasure test: audit query post-erasure returns anonymised actor, not deleted row.

---

### [STORY] AGN-7.S9 k-anonymity floor on aggregates

ID: AGN-7.S9
Status: Backlog
Epic: AGN-7
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 5
Rank: 790
Jira Key:
Confluence Link:

#### Summary

As an Auditor and as a Tenant administrator, I want aggregate and analytical tools to declare a minimum group size and refuse or k-anonymise queries returning fewer rows, so that individual-level data cannot be inferred from aggregate results.

#### Acceptance Criteria

- [ ] Aggregate / analytical tools declare minimum group size per FR-025.
- [ ] Queries returning fewer rows than declared minimum are refused or returned in k-anonymised form (platform default = 5 per §13 B2).
- [ ] Per-tool override of minimum group size allowed.
- [ ] Kernel audit_event written for every refused aggregation per §13 T1-2.

#### AI Execution Notes

Backlog reason: cascade from People placements Backlog per §13 D14/D15. Aggregates that need k-anonymity (role-scoped reads in AGN-2.S5..S7) are themselves Backlog. Story is sprint-unscheduled until aggregates land. When implemented: tool metadata schema gains `min_group_size int4 DEFAULT 5`; tool router checks result cardinality before returning; if below threshold → return `K_ANON_FLOOR_BREACH` structured error or k-anonymised summary. Cross-link AGN-4 (conservative-secure taint, §13 B1).

#### Testing Notes

- Unit: tool cardinality check (below threshold → refused; at/above threshold → passes).
- Integration: aggregate tool with 3-row result → K_ANON_FLOOR_BREACH when min_group_size=5; 5-row result → passes.
- E2E: deferred until AGN-2.S5..S7 aggregates are implemented.

#### Dependencies

- Blocked by: AGN-2.S5..S7 (role-scoped aggregate tools — currently Backlog)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- k-anonymity floor unit test passes.
- Integration test: cardinality enforcement at platform default (5) and per-tool override.

---

### [TASK] AGN-7.T1 OpenAI integration setup

ID: AGN-7.T1
Status: Backlog
Epic: AGN-7
Sprint: Sprint-3
Release: phase-1
Priority: P0
Story Point: 3
Rank: 800
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team, I want OpenAI Chat Completions, Embeddings, and Moderation endpoints wired in `packages/agent` with secrets from AWS Secrets Manager and 90-day rotation, so that all Agents features have a reliable, secure AI backend from Sprint-3.

#### Requirements

- OpenAI Chat Completions, Embeddings, and Moderation endpoints wired in `packages/agent`.
- Secrets sourced from AWS Secrets Manager per CLAUDE.md hard rule — no API keys in env files, DB, or source.
- Secret rotation at 90-day cadence per agents-srs NFR-013.
- Cross-link DEPLOY-3.S3 (Secrets Manager provisioning).

#### Acceptance Criteria

- [ ] Smoke test against real OpenAI Chat Completions endpoint passes.
- [ ] Smoke test against real OpenAI Embeddings endpoint passes.
- [ ] Smoke test against real OpenAI Moderation endpoint passes.
- [ ] No API keys present in env files, DB, or source code (static scan assertion in CI).
- [ ] Secret rotation schedule configured in AWS Secrets Manager at 90-day cadence.

#### Dependencies

- Blocked by: DEPLOY-3.S3 (Secrets Manager provisioning)
- Blocks: AGN-7.S7 (reliability wrappers require wired OpenAI client), AGN-3.S2 (embedding pipeline)

#### Definition of Done

- Inherits project DoD.
- Static scan CI assertion: zero OpenAI key patterns in source.
- All three endpoint smoke tests pass in CI against real OpenAI (using test credentials from Secrets Manager).

---

### [TASK] AGN-7.T2 OTLP wiring stub (vendor-agnostic)

ID: AGN-7.T2
Status: Backlog
Epic: AGN-7
Sprint: Sprint-4
Release: phase-1
Priority: P1
Story Point: 3
Rank: 810
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team and as a DevOps engineer, I want an OTLP exporter wired with a vendor-agnostic backend so that traces and metrics flow out of the Agents runtime without committing to a specific observability vendor at MVP.

#### Requirements

- OTLP exporter wired in `apps/api` for the Agents runtime (traces + metrics).
- Backend selectable via environment configuration (endpoint URL + optional auth header) — no vendor-specific SDK embedded.
- No Langfuse dependency at MVP per memory `project_no_langfuse_mvp.md`; Langfuse / similar deferred to Backlog.
- Stub emits spans for: turn start/end, tool dispatch, LLM call, cancellation.

#### Acceptance Criteria

- [ ] Traces and metrics exported via OTLP; backend selectable by config.
- [ ] No Langfuse (or other vendor-specific) dependency in `package.json`.
- [ ] Span coverage: turn, tool dispatch, LLM call, cancellation events each produce a span.

#### Dependencies

- Blocked by: AGN-7.T1 (LLM client exists to instrument)
- Blocks: AGN-7.T4 (probe uses OTLP spans for assertion)

#### Definition of Done

- Inherits project DoD.
- OTLP integration test: spans emitted to a local OTLP collector in CI; span names match contract.
- No vendor-specific observability package in `bun.lock`.

---

### [TASK] AGN-7.T3 RTM Appendix D walk-through (Agents)

ID: AGN-7.T3
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 3
Rank: 820
Jira Key:
Confluence Link:

#### Summary

As an Auditor and QA engineer, I want a script that reads every FR-NNN / UI-NNN / NFR-NNN from the Agents SRS Appendix D and maps each to its corresponding test or verification artefact, so that we have a traceable, machine-verifiable requirements coverage report before launch.

#### Requirements

- Script reads agents-srs Appendix D FR-001..088 / UI-001..023 / NFR-001..023; for each entry lists: requirement ID, summary, ticket ID(s), test file path(s), coverage status (`covered` / `partial` / `missing`).
- Output written to `docs/architecture/agents-rtm-evidence.md` in table format sortable by coverage status.
- All `missing` entries flagged with a GitHub issue reference or explanation.
- Cross-link DOC-3.T15 — RTM output fed into documentation epic's traceability index.

#### Acceptance Criteria

- [ ] `docs/architecture/agents-rtm-evidence.md` generated and committed.
- [ ] Zero `missing` coverage entries for MVP-scope requirements.
- [ ] `partial` entries (Backlog-scope) documented with rationale.
- [ ] Script exits non-zero if any MVP-scope requirement is `missing`.

#### Dependencies

- Blocked by: All AGN-1..AGN-7 Stories at Done (requires test artefacts to exist)
- Blocks: DOC-3.T15 (traceability index references Agents RTM output)

#### Definition of Done

- RTM output committed to `docs/architecture/`.
- CI step added to verify zero `missing` MVP entries.
- Peer-reviewed by at least one engineer not on the Agents team.

---

### [TASK] AGN-7.T4 Daily synthetic cross-tenant probe extension to Agents

ID: AGN-7.T4
Status: Backlog
Epic: AGN-7
Sprint: Sprint-4
Release: phase-1
Priority: P0
Story Point: 2
Rank: 830
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer and Security reviewer, I want the daily synthetic cross-tenant probe extended to cover Agents conversations and KB index, so that zero cross-tenant data leaks are detected and evidenced in production.

#### Requirements

- Extend DEPLOY-3.S1 probe to cover Agents conversations + KB index.
- Probe runs daily in production.
- Coverage matrix updated to include Agents module assertions.
- Cross-link DEPLOY-3.S1 (base probe), AGN-3.S3 (KB tenant-keyed retrieval).

#### Acceptance Criteria

- [ ] Probe coverage matrix updated; Agents conversations and KB index included.
- [ ] Zero cross-tenant reads detected in 24h prod window.
- [ ] Cross-link DEPLOY-3.S1 and AGN-3.S3 in probe runbook.

#### Dependencies

- Blocked by: DEPLOY-3.S1 (base probe must exist), AGN-3.S3 (KB retrieval tenant isolation)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Daily probe CI/CD schedule configured; failure alerts wired.
- 7-day observation window showing zero cross-tenant reads in Agents module.
- E2E: ceiling change → audit row visible → enforced within 5min window.

---

## [EPIC] AGN-2 Planner read+write capabilities — LINKING

ID: AGN-2
Status: Backlog
Sprint: Sprint-5 (impl) — own-scope reads MVP; role-scoped reads → Backlog
Release: phase-1
Priority: P0
Story Point: 21
Rank: 200
Jira Key:
Confluence Link:

### Summary

Agents reads Planner via `PlannerReadFacade` (own-scope only in MVP per §13 D14/D15); writes via `PlannerWriteFacade` with caller-scoped permission envelope. NL writes constrained to current-task assignees + exact-email (no fuzzy resolution). Meeting transcript extraction always routes to inbox per FR-013 (multi-target = non-bypassable floor).

### Goal

By S5 close, an Employee can ask "what are my open tasks", "what's due this week", "what's overdue" and receive grounded, cited answers. They can ask in NL to create / reassign / reschedule / mark-done / split / link tasks, with owner resolution by exact email or already-assigned-to-current-plan only. Meeting transcripts produce drafted batches that always route to inbox.

### Scope (MVP)

- Own-scope reads: my open tasks, due this week, overdue items I own (FR-060 partial).
- NL task creation constrained — exact-email or already-assigned-to-current-plan (FR-065..066 + §13 T1-3).
- NL single-task mutations: reassign, reschedule, mark done, split, link (FR-067).
- Meeting transcript extraction (FR-068..070) — always routes to inbox per FR-013.

### Backlog

- Team workload analysis (FR-063 team-lead) — needs People placements.
- Blocker / overload analysis — needs People placements.
- Cross-team / dept-leader / org-leader synthesis (FR-063 dept/org) — needs People placements.

### Out of Scope

- Approval inbox emitter (AGN-4.S6 owns that contract; AGN-2 calls it).
- Cross-module facades (PLAN-7 owns those contracts; AGN-2 consumes them).

### SRS Coverage

- FR-060..070.

### Acceptance Criteria

- [ ] All reads + writes flow through `PlannerReadFacade` + `PlannerWriteFacade` (PLAN-7.S1, S2 contracts).
- [ ] All owner resolution flows through `PeopleQueryFacade.resolveByExactSubject()` (PEOPLE-1 contract); fuzzy disabled in MVP.
- [ ] Multi-target meeting extraction always routes to inbox per FR-013.
- [ ] kernel audit_event for every read + write per §13 T1-2.

### Child Tickets (MVP)

- AGN-2.S1 Own-scope reads — my open tasks / due-this-week / overdue (Story)
- AGN-2.S2 NL task creation constrained — exact-email or current-plan only (Story)
- AGN-2.S3 NL single-task mutations: reassign, reschedule, mark done, split, link (Story)
- AGN-2.S4 Meeting transcript extraction always routes to inbox (Story)

### Child Tickets (Backlog)

- AGN-2.S5 Team workload analysis (Story, Backlog)
- AGN-2.S6 Blocker / overload analysis (Story, Backlog)
- AGN-2.S7 Cross-team / dept / org-leader synthesis (Story, Backlog)

### Definition of Done

- All MVP child Stories Done.
- E2E: Employee asks "what's overdue"; Agents returns grounded list with citations to actual Planner tasks.
- E2E: Employee says "create task: review Q3 brief, due Friday, assign anh@example.com"; task created.

---

### [STORY] AGN-2.S1 Own-scope reads — my open tasks / due-this-week / overdue items I own

ID: AGN-2.S1
Status: Backlog
Epic: AGN-2
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 210
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to ask "what are my open tasks", "what is due this week", and "what are my overdue items" and receive grounded, cited answers drawn directly from Planner, so that I have an accurate picture of my workload without leaving the chat surface.

#### Acceptance Criteria

- [ ] "my open tasks" query calls `PlannerReadFacade.getMyOpenTasks(userId, scope)` and returns grounded results per FR-060 partial.
- [ ] "what is due this week" query calls `PlannerReadFacade.getDueThisWeek(userId)` and returns grounded results.
- [ ] "overdue items I own" query calls `PlannerReadFacade.getOverdueByOwner(ownerId)` and returns grounded results.
- [ ] Results include task IDs sufficient for navigation to Planner per FR-061.
- [ ] kernel audit_event written for every read per §13 T1-2.
- [ ] **E2E** — Employee asks "what are my open tasks"; sees grounded answer with citations to actual Planner tasks.

#### AI Execution Notes

All three read calls flow through `PlannerReadFacade` (PLAN-7.S1 contract). Results are scoped strictly to `userId = current caller` — no cross-user reads in MVP. Citations include `task_id` and `plan_id` sufficient for deep-link navigation. Do NOT use `Promise.all` for sequential facade calls; await each in order.

#### Testing Notes

- Unit: facade call routing for each query intent; citation shape includes task_id + plan_id.
- Integration: reads against real DB via PlannerReadFacade; audit rows written.
- E2E: as per AC.

#### Dependencies

- Blocked by: PLAN-7.S1 (PlannerReadFacade contract), AGN-7.S2 (audit emission)
- Blocks: AGN-2.S3 (mutations reference tasks returned by reads)

#### Definition of Done

- Inherits project DoD.
- Integration test: three query intents each produce audit row.
- E2E: grounded answer with task citations.

---

### [STORY] AGN-2.S2 NL task creation constrained — exact-email or current-plan only

ID: AGN-2.S2
Status: Backlog
Epic: AGN-2
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 220
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to create Planner tasks via natural language with owner resolution constrained to exact-email match or already-assigned-to-current-plan only, so that I can create tasks safely without the agent making ambiguous ownership decisions.

#### Acceptance Criteria

- [ ] NL "create task" intent extracts task title, due date, and owner from utterance.
- [ ] Owner resolution: exact-email match via `PeopleQueryFacade.resolveByExactSubject()` ONLY.
- [ ] If owner is ambiguous (no exact match), agent asks user to confirm with email-typed mention.
- [ ] No fuzzy display-name resolution in MVP (cascade §13 D14/D15).
- [ ] Task creation routes through `PlannerWriteFacade.createTask(intent)` with permission envelope.
- [ ] kernel audit_event for resolved write per §13 T1-2.
- [ ] **E2E** — User says "create task: review Q3 brief, due Friday, assign anh@example.com"; Default mode shows preview; user confirms; task created in Planner.

#### AI Execution Notes

Intent extraction: NLP layer extracts `{title, due_date, owner_hint}`. Owner resolution: call `PeopleQueryFacade.resolveByExactSubject(owner_hint)` — if match found, proceed; if no match, emit clarification prompt requesting email-typed mention. Write path: `PlannerWriteFacade.createTask({title, due_date, owner_id, caller_id, permission_envelope})`. Default mode gate: show preview card before executing write (FR-009). Do NOT use `Promise.all` for resolution + write sequence.

#### Testing Notes

- Unit: intent extraction for title / due_date / owner_hint; exact-email resolution path; ambiguous owner → clarification prompt.
- Integration: resolved write → PlannerWriteFacade called; audit row written; ambiguous owner → no write attempted.
- E2E: as per AC.

#### Dependencies

- Blocked by: PLAN-7.S2 (PlannerWriteFacade contract), PEOPLE-1 (PeopleQueryFacade.resolveByExactSubject), AGN-7.S2 (audit)
- Blocks: AGN-2.S3 (mutations extend same write pattern)

#### Definition of Done

- Inherits project DoD.
- Fuzzy-resolution unit test: display-name-only input → clarification prompt, no write.
- E2E: task created with exact-email owner; audit row present.

---

### [STORY] AGN-2.S3 NL single-task mutations: reassign, reschedule, mark done, split, link

ID: AGN-2.S3
Status: Backlog
Epic: AGN-2
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 230
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want to mutate existing Planner tasks via natural language (reassign, reschedule, mark done, split, link) with the same ownership constraints as task creation, so that I can manage my work efficiently without leaving the chat surface.

#### Acceptance Criteria

- [ ] NL intents for reassign / reschedule / mark-done / split / link each dispatched to corresponding `PlannerWriteFacade.*` method per FR-067.
- [ ] Reassignee constrained to already-assigned-to-current-plan OR exact-email match (cascade §13 T1-3).
- [ ] Default mode shows preview before executing write; Bypass mode executes inline per FR-009/010.
- [ ] kernel audit_event for every resolved mutation per §13 T1-2.

#### AI Execution Notes

Mutation router maps NL intent to `PlannerWriteFacade.reassignTask / rescheduleTask / markDone / splitTask / linkTask`. Reassign constraint: run same `PeopleQueryFacade.resolveByExactSubject()` path as AGN-2.S2; additionally accept any user already listed in `current_plan.members`. Split: produces two new tasks; original task closed; both new tasks written in sequential awaits (no `Promise.all`). Link: establishes dependency edge between two tasks.

#### Testing Notes

- Unit: intent → mutation method mapping for each verb; reassign constraint enforcement.
- Integration: each mutation type → PlannerWriteFacade called; audit row written.
- E2E: NL "mark task X as done"; task status updated; audit row present.

#### Dependencies

- Blocked by: PLAN-7.S2 (PlannerWriteFacade), AGN-2.S1 (task context from reads), AGN-7.S2 (audit)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- All five mutation types covered by integration tests.
- Reassign constraint unit test: non-plan-member + non-exact-email → clarification prompt.

---

### [STORY] AGN-2.S4 Meeting transcript extraction always routes to inbox

ID: AGN-2.S4
Status: Backlog
Epic: AGN-2
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 5
Rank: 240
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want action items extracted from a meeting transcript to appear as draft Planner tasks in my approval inbox — never executed autonomously — so that I retain full control over what gets created from meeting content.

#### Acceptance Criteria

- [ ] Extract action items from meeting transcript as batch of draft Planner tasks per FR-068..070.
- [ ] Each draft carries suggested owner (exact-email match, OR `null` if no match) and confidence score per FR-069.
- [ ] Batch always routes through approval inbox regardless of execution mode (FR-013 — multi-target = non-bypassable floor).
- [ ] User can accept / reject each item individually before batch execution per FR-070.
- [ ] kernel audit_event for every batch submission and every accept/reject per §13 T1-2.

#### AI Execution Notes

Transcript extraction: LLM extracts action-item candidates as structured `{title, owner_hint, due_hint, confidence}` array. Owner resolution: `PeopleQueryFacade.resolveByExactSubject(owner_hint)` — unresolved owners set to `null` with confidence 0.0. Inbox routing: call AGN-4.S6 inbox emitter contract with `{items: [...], source: 'transcript', execution_mode: 'inbox_required'}` — `inbox_required` flag makes FR-013 non-bypassable even for users in Bypass mode. Individual accept/reject: each item independently approved; accepted items call `PlannerWriteFacade.createTask`. Do NOT use `Promise.all` for sequential item writes.

#### Testing Notes

- Unit: extraction → structured array; unresolved owner → null + confidence 0.0; inbox_required flag always set.
- Integration: batch submission → inbox rows created; accepted item → task created; rejected item → no task.
- E2E: paste transcript; see draft batch in inbox; accept one item; reject another; verify one task created.

#### Dependencies

- Blocked by: PLAN-7.S2 (PlannerWriteFacade), AGN-4.S6 (inbox emitter contract), PEOPLE-1 (owner resolution)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- FR-013 bypass-prevention unit test: Bypass mode user + transcript → inbox_required still set.
- E2E: mixed accept/reject batch → correct task count created.

---

### [STORY] AGN-2.S5 Team workload analysis

ID: AGN-2.S5
Status: Backlog
Epic: AGN-2
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 8
Rank: 250
Jira Key:
Confluence Link:

#### Summary

As a Manager or Team lead, I want to query team workload balance, completion rate by member, and blockers by team so that I can make data-driven staffing decisions.

#### Acceptance Criteria

- [ ] Team workload balance query returns task distribution across reportees per FR-063 team-lead.
- [ ] Completion rate by member returned with correct aggregation.
- [ ] Blockers by team surfaced with task citations.

#### AI Execution Notes

Backlog reason: Cascade from People placements Backlog per §13 D14/D15. Requires `PeopleQueryFacade` placements (manager → reportees, teams) which is PEOPLE-2 Backlog. Story unscheduled until PEOPLE-2 lands. When implemented: reads flow through `PlannerReadFacade.getTeamWorkload(managerId, teamId)` + People placements join. k-anonymity floor enforced via AGN-7.S9 (also Backlog).

#### Testing Notes

- Deferred until PEOPLE-2 and AGN-7.S9 are Sprint-scheduled.

#### Dependencies

- Blocked by: PEOPLE-2 (placements facade), AGN-7.S9 (k-anonymity floor)
- Blocks: AGN-2.S6, AGN-2.S7

#### Definition of Done

- Inherits project DoD.
- Team workload integration test: manager query returns only own-team tasks.

---

### [STORY] AGN-2.S6 Blocker / overload analysis

ID: AGN-2.S6
Status: Backlog
Epic: AGN-2
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 5
Rank: 260
Jira Key:
Confluence Link:

#### Summary

As a Manager, I want to ask "who is blocked" and "who is overloaded" to surface at-risk team members and unblock delivery.

#### Acceptance Criteria

- [ ] "who is blocked" query returns members with linked blocking tasks per FR-063 team-lead.
- [ ] "who is overloaded" query returns members exceeding configurable task-count threshold.

#### AI Execution Notes

Backlog reason: same cascade as AGN-2.S5 — needs People placements. Story unscheduled until PEOPLE-2 lands.

#### Testing Notes

- Deferred until PEOPLE-2 is Sprint-scheduled.

#### Dependencies

- Blocked by: PEOPLE-2 (placements facade), AGN-2.S5 (workload pattern established)
- Blocks: AGN-2.S7

#### Definition of Done

- Inherits project DoD.
- Blocker / overload integration tests against real DB.

---

### [STORY] AGN-2.S7 Cross-team / dept-leader / org-leader synthesis

ID: AGN-2.S7
Status: Backlog
Epic: AGN-2
Sprint: Backlog
Release: phase-1
Priority: P2
Story Point: 8
Rank: 270
Jira Key:
Confluence Link:

#### Summary

As a Department or Org leader, I want plan progress synthesis across overseen teams, cross-team dependency risk, and throughput comparison across teams, so that I can govern delivery at scale.

#### Acceptance Criteria

- [ ] Plan progress across all overseen teams returned with correct scope per FR-063 dept/org.
- [ ] Cross-team dependency risk surfaced with task citations.
- [ ] Throughput comparison across teams returned with k-anonymity floor applied (AGN-7.S9).

#### AI Execution Notes

Backlog reason: same cascade as AGN-2.S5/S6 — needs People placements for org hierarchy traversal. Story unscheduled until PEOPLE-2 and AGN-7.S9 land.

#### Testing Notes

- Deferred until PEOPLE-2 and AGN-7.S9 are Sprint-scheduled.

#### Dependencies

- Blocked by: PEOPLE-2, AGN-7.S9, AGN-2.S5, AGN-2.S6
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Org-scope synthesis integration test: dept-leader query returns only overseen-team tasks.

---

## [EPIC] AGN-5 Scheduled & event-triggered runs — LINKING

ID: AGN-5
Status: Backlog
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 18
Rank: 500
Jira Key:
Confluence Link:

### Summary

Opt-in scheduled digests (morning task brief, end-of-week status, stale-task nudges, at-risk milestone alerts) running under per-user delegation grants per FR-072. Phase-1 scheduled runs are read-only or inbox-draft only — autonomous writes prohibited per FR-073. Self-service schedule UI per FR-074. Per-tenant max active schedules per user (FR-075 — Should). Runtime contract pre-declared for outbox-event triggers but not wired (FR-003).

### Goal

By S5 close, an Employee can opt into a morning task brief; the brief fires under their delegation grant; produces a read-only summary or inbox draft; user can view / pause / cancel from a self-service surface.

### Scope

- Morning task brief, end-of-week digest, stale-task nudge, at-risk milestone alert (FR-071).
- Per-user delegation grant schema with hardcoded 90-day TTL per §13 T1-4 (FR-072).
- Self-service schedule UI (FR-074).
- Per-tenant max active schedules per user (FR-075 — Should).
- Pre-declared outbox-event runtime contract (FR-003 — not wired in Phase-1).

### Out of Scope

- Admin TTL configuration UI for delegation grants → Backlog (per §13 T1-4).
- Autonomous writes from scheduled runs (FR-073 — prohibited in Phase-1).
- Wiring of outbox-event-triggered firing — Phase-1 has the contract but does not wire trigger (per agents-srs §1.5).

### SRS Coverage

- FR-071..075, FR-003.

### Acceptance Criteria

- [ ] Each scheduled run executes under explicit per-user delegation grant; runs without valid grant refused per FR-072.
- [ ] All scheduled runs are read-only or inbox-draft only — no autonomous writes (FR-073).
- [ ] User can view / modify / pause / cancel own schedules per FR-074.
- [ ] Per-tenant max active schedules per user enforced (FR-075).
- [ ] kernel audit_event on every scheduled run firing per §13 T1-2.

### Child Tickets

- AGN-5.S1 Morning task brief (own-scope) (Story)
- AGN-5.S2 End-of-week status digest (own-scope) (Story)
- AGN-5.S3 Stale-task nudge (own-scope) (Story)
- AGN-5.S4 Per-user delegation grant schema with hardcoded 90-day TTL (Story)
- AGN-5.S5 Self-service schedule UI (Story)

### Definition of Done

- All child Stories Done.
- E2E: enable morning brief; confirm next-morning summary fires under valid grant; revoke grant; confirm next day fires fail with permission denied.

---

### [STORY] AGN-5.S1 Morning task brief (own-scope)

ID: AGN-5.S1
Status: Backlog
Epic: AGN-5
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 510
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a daily morning task brief delivered at my configured time so that I start the day with a grounded summary of open and due-today tasks without manually querying the agent.

#### Acceptance Criteria

- [ ] Morning brief is opt-in per FR-071; disabled by default.
- [ ] Runs at user-configured time in user's timezone.
- [ ] Produces read-only summary delivered via email + in-app per §13 C3.
- [ ] Calls `PlannerReadFacade.getMyOpenTasks` + `getDueThisWeek` under delegation grant per FR-072.
- [ ] kernel audit_event written for every scheduled run firing per §13 T1-2.

#### AI Execution Notes

Scheduled run executed as a pg-boss job `agents.scheduled.morning_brief`. Job payload: `{user_id, tenant_id, grant_id}`. Before execution: validate grant is active and not expired (cross-link AGN-5.S4). Facade calls: sequential awaits for `getMyOpenTasks` then `getDueThisWeek` (no `Promise.all`). Output: read-only markdown summary — no write calls permitted (`write_resources: []` in grant scope per FR-073). Delivery: email via outbox event + in-app notification.

#### Testing Notes

- Unit: grant validation (expired → refused); read-only summary generation.
- Integration: job fires → facade called → audit row written; expired grant → job refused with audit row.
- E2E: opt-in; verify job scheduled; verify summary delivered.

#### Dependencies

- Blocked by: AGN-5.S4 (delegation grant schema), AGN-2.S1 (PlannerReadFacade reads)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Expired-grant integration test: job refused; audit row with `reason = 'grant_expired'`.
- E2E: morning brief delivered to in-app inbox.

---

### [STORY] AGN-5.S2 End-of-week status digest (own-scope)

ID: AGN-5.S2
Status: Backlog
Epic: AGN-5
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 520
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a Friday-afternoon digest summarising completed-this-week tasks and open items rolling into next week, so that I can close out the week and plan ahead without manual querying.

#### Acceptance Criteria

- [ ] End-of-week digest is opt-in per FR-071; disabled by default.
- [ ] Runs Friday afternoon in user's timezone.
- [ ] Summary includes completed-this-week count + open items rolling into next week.
- [ ] Runs under delegation grant per FR-072 (cross-link AGN-5.S4).
- [ ] Read-only output — no autonomous writes per FR-073.
- [ ] kernel audit_event written for every run per §13 T1-2.

#### AI Execution Notes

pg-boss job `agents.scheduled.eow_digest`. Same grant validation pattern as AGN-5.S1. Facade calls: `PlannerReadFacade.getCompletedThisWeek(userId)` + `getMyOpenTasks(userId)` — sequential awaits. Output: read-only markdown summary delivered via email + in-app.

#### Testing Notes

- Unit: completed-this-week aggregation; rolling-open items list.
- Integration: job fires Friday → facade called → audit row.
- E2E: opt-in; verify end-of-week digest delivered on Friday.

#### Dependencies

- Blocked by: AGN-5.S4 (grant schema), AGN-2.S1 (PlannerReadFacade)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Integration test: eow digest job → audit row written; grant validated before execution.

---

### [STORY] AGN-5.S3 Stale-task nudge (own-scope)

ID: AGN-5.S3
Status: Backlog
Epic: AGN-5
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 3
Rank: 530
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a configurable stale-task nudge that reminds me to refresh due dates or mark tasks complete when they haven't been updated in N days, so that my task list stays current without requiring manual triage.

#### Acceptance Criteria

- [ ] Stale-task nudge is opt-in per FR-071; disabled by default.
- [ ] Staleness threshold configurable per user (default: 7 days).
- [ ] Nudge produces inbox draft to refresh due date or mark complete — NOT an autonomous write per FR-073.
- [ ] Runs under delegation grant per FR-072 (cross-link AGN-5.S4).
- [ ] kernel audit_event written for every run per §13 T1-2.

#### AI Execution Notes

pg-boss job `agents.scheduled.stale_nudge`. Staleness query: `PlannerReadFacade.getStaleTasks(userId, thresholdDays)`. Output: inbox draft batch (cross-link AGN-4.S6 inbox emitter) with suggested action per stale task. `write_resources: []` in grant scope — nudge never writes directly. Do NOT use `Promise.all` for stale-task fetch + inbox emit.

#### Testing Notes

- Unit: threshold logic (task not updated in N days → stale); inbox draft generation.
- Integration: stale tasks found → inbox drafts created; no direct task writes.
- E2E: opt-in; create stale task; verify nudge appears in inbox.

#### Dependencies

- Blocked by: AGN-5.S4 (grant schema), AGN-4.S6 (inbox emitter), AGN-2.S1 (PlannerReadFacade)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- No-direct-write integration test: stale nudge job → inbox rows created; zero PlannerWriteFacade calls.

---

### [STORY] AGN-5.S4 Per-user delegation grant schema with hardcoded 90-day TTL

ID: AGN-5.S4
Status: Backlog
Epic: AGN-5
Sprint: Sprint-5
Release: phase-1
Priority: P0
Story Point: 5
Rank: 540
Jira Key:
Confluence Link:

#### Summary

As an Employee and as a member of the Engineering team, I want a per-user delegation grant schema that authorises scheduled agent runs under a defined scope with a hardcoded 90-day TTL, so that scheduled runs operate with explicit, auditable, revocable permissions.

#### Acceptance Criteria

- [ ] Schema `{grant_id, tenant_id, principal_user_id, agent_run_kind: morning_brief|eow_digest|stale_nudge|at_risk_alert, scope: {tools: [...], read_resources: [...], write_resources: []}, expires_at, created_by, audited_event_id}`.
- [ ] Default TTL hardcoded at 90 days.
- [ ] User-revocable via FR-074 self-service surface (cross-link AGN-5.S5).
- [ ] Auto-revoked on user deactivation (cross-link identity module).
- [ ] kernel audit_event on every grant use per §13 T1-2.
- [ ] Phase-1 scopes are read-only or inbox-draft only — `write_resources: []` always enforced per FR-073.
- [ ] Admin TTL configuration UI → Backlog per §13 T1-4 (NOT in this Story).
- [ ] **E2E** — Enable morning brief; verify grant created; revoke grant; verify next firing fails with permission-denied.

#### AI Execution Notes

Schema table: `agents.delegation_grant` with all fields above. Drizzle schema update follows single-migration rule (squash into `0000_initial.sql`). Grant validation in scheduled job runner: `SELECT ... WHERE grant_id = $1 AND expires_at > now() AND revoked_at IS NULL` — if no row, raise `GRANT_INVALID` and write audit event. Auto-revocation: listen for `identity.user.deactivated` outbox event → mark `revoked_at = now()` in same tx. Do NOT use `Promise.all` for grant check + run sequence.

#### Testing Notes

- Unit: TTL computation (created_at + 90 days = expires_at); grant validation (expired → GRANT_INVALID); write_resources always empty.
- Integration: grant created; expired grant → job refused with audit row; deactivation event → grant revoked.
- E2E: as per AC.

#### Dependencies

- Blocked by: AGN-7.S2 (audit emission), identity module user-deactivation outbox event
- Blocks: AGN-5.S1, AGN-5.S2, AGN-5.S3

#### Definition of Done

- Inherits project DoD.
- Expired-grant unit test passes.
- Deactivation-auto-revoke integration test passes.
- E2E: grant revocation → next scheduled run refused.

---

### [STORY] AGN-5.S5 Self-service schedule UI

ID: AGN-5.S5
Status: Backlog
Epic: AGN-5
Sprint: Sprint-5
Release: phase-1
Priority: P1
Story Point: 4
Rank: 550
Jira Key:
Confluence Link:

#### Summary

As an Employee, I want a self-service schedule management page in the Agents zone where I can create, view, modify, pause, and cancel my scheduled digests, so that I have full control over automated agent runs without needing admin assistance.

#### Acceptance Criteria

- [ ] Schedule list page in `apps/web-agents/` showing all active / paused schedules per FR-074.
- [ ] Create new schedule: select digest type, configure time / threshold, enable.
- [ ] View / modify existing schedule: update time, threshold, or pause.
- [ ] Cancel (delete) schedule: removes pg-boss job and revokes associated grant.
- [ ] Per-tenant max active schedules per user enforced on create per FR-075.
- [ ] kernel audit_event for every create / modify / cancel action per §13 T1-2.

#### AI Execution Notes

tRPC router `agents.schedules.*` (`list`, `create`, `update`, `pause`, `cancel`). UI in `apps/web-agents/app/schedules/`. Max active schedule enforcement: config in `admin.tenant_settings.max_agent_schedules_per_user` (default from agents-srs FR-075); checked in `create` handler before inserting. All mutations sequential (no `Promise.all`). Cancel handler: (1) cancel pg-boss job; (2) revoke delegation grant; (3) write audit event — all in one DB transaction.

#### Testing Notes

- Unit: max-schedule enforcement (at limit → reject create).
- Integration: create / pause / cancel all produce audit rows; max-schedule limit enforced at DB level.
- E2E: create morning brief schedule; verify appears in list; cancel; verify job removed.

#### Dependencies

- Blocked by: AGN-5.S4 (grant schema), AGN-5.S1..S3 (schedule types must exist)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Max-schedule integration test: at-limit create → rejected with user-facing error.
- E2E: full create → view → cancel flow.

---

<!-- S6 Hardening Tasks (placeholders, content carved from S5 testing burndown) -->

### [TASK] AGN-S6.T1 Bug-fix placeholder BF-AG-01

ID: AGN-S6.T1
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 900
Jira Key:
Confluence Link:

#### Summary

Bug-fix placeholder BF-AG-01. Exact defect TBD from S5 testing burndown. Assigned to AGN-7 epic as infrastructure-level fix.

#### Requirements

- Placeholder — exact scope carved from Sprint-5 testing burndown.
- Must be filed as a concrete bug before Sprint-6 planning.

#### Acceptance Criteria

- [ ] Defect reproduced with a failing test.
- [ ] Fix applied; failing test now passes.
- [ ] Regression test added.

#### Definition of Done

- Inherits project DoD.
- Failing test added before fix; passing after fix.

---

### [TASK] AGN-S6.T2 Bug-fix placeholder BF-AG-02

ID: AGN-S6.T2
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 910
Jira Key:
Confluence Link:

#### Summary

Bug-fix placeholder BF-AG-02. Exact defect TBD from S5 testing burndown.

#### Requirements

- Placeholder — exact scope carved from Sprint-5 testing burndown.
- Must be filed as a concrete bug before Sprint-6 planning.

#### Acceptance Criteria

- [ ] Defect reproduced with a failing test.
- [ ] Fix applied; failing test now passes.
- [ ] Regression test added.

#### Definition of Done

- Inherits project DoD.
- Failing test added before fix; passing after fix.

---

### [TASK] AGN-S6.T3 Bug-fix placeholder BF-AG-03

ID: AGN-S6.T3
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 2
Rank: 920
Jira Key:
Confluence Link:

#### Summary

Bug-fix placeholder BF-AG-03. Exact defect TBD from S5 testing burndown.

#### Requirements

- Placeholder — exact scope carved from Sprint-5 testing burndown.
- Must be filed as a concrete bug before Sprint-6 planning.

#### Acceptance Criteria

- [ ] Defect reproduced with a failing test.
- [ ] Fix applied; failing test now passes.
- [ ] Regression test added.

#### Definition of Done

- Inherits project DoD.
- Failing test added before fix; passing after fix.

---

### [TASK] AGN-S6.T4 Performance audit — KB ingestion p95 ≤ 60s NFR-006

ID: AGN-S6.T4
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 3
Rank: 930
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team, I want a load-test audit of KB ingestion latency to verify NFR-006 compliance, so that ingestion performance is evidenced before launch.

#### Requirements

- Load-test KB ingestion at varied document sizes: 100KB, 500KB, 1MB, 5MB.
- Measure p95 latency per size tier.
- NFR-006 targets: p95 ≤ 60s for docs ≤ 1MB; p95 ≤ 5min for docs up to 5MB cap.

#### Acceptance Criteria

- [ ] Load-test script covers all four size tiers.
- [ ] p95 ≤ 60s for ≤ 1MB documents (NFR-006).
- [ ] p95 ≤ 5min for documents up to 5MB cap (NFR-006).
- [ ] Results committed to `docs/architecture/agents-perf-evidence.md`.
- [ ] CI gate added: load-test fails build if p95 exceeds threshold.

#### Dependencies

- Blocked by: AGN-3.S1 (KB ingestion pipeline), AGN-3.S2 (embedding pipeline)
- Blocks: AGN-S6.T5 (retrieval audit completes the KB perf picture)

#### Definition of Done

- Inherits project DoD.
- Load-test results committed; CI gate green.

---

### [TASK] AGN-S6.T5 Performance audit — KB retrieval p95 ≤ 250ms NFR-007

ID: AGN-S6.T5
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 3
Rank: 940
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team, I want a load-test audit of KB retrieval latency to verify NFR-007 compliance, so that retrieval performance is evidenced before launch.

#### Requirements

- Load-test KB retrieval at varied K values: K=1, K=4, K=8.
- Measure p95 latency per K value.
- NFR-007 target: p95 ≤ 250ms for K ≤ 8.

#### Acceptance Criteria

- [ ] Load-test script covers K=1, K=4, K=8.
- [ ] p95 ≤ 250ms for K ≤ 8 (NFR-007).
- [ ] Results committed to `docs/architecture/agents-perf-evidence.md`.
- [ ] CI gate added: load-test fails build if p95 exceeds threshold.

#### Dependencies

- Blocked by: AGN-3.S3 (KB retrieval pipeline)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Load-test results committed; CI gate green.

---

### [TASK] AGN-S6.T6 Cancellation latency audit — sub-second NFR-008

ID: AGN-S6.T6
Status: Backlog
Epic: AGN-7
Sprint: Sprint-6
Release: phase-1
Priority: P0
Story Point: 3
Rank: 950
Jira Key:
Confluence Link:

#### Summary

As a member of the Engineering team, I want a latency audit of the cancellation path to verify NFR-008 compliance, so that sub-second ceasing is evidenced before launch.

#### Requirements

- Measure time from cancellation signal to next ceasing point across all cancellation reason types.
- NFR-008 target: <1s p95.
- Coverage: user, timeout, budget, provider_outage, quality_canary cancellation reasons.

#### Acceptance Criteria

- [ ] Cancellation latency measured for all five typed reasons (per AGN-7.S6 enum).
- [ ] p95 latency < 1s for each reason type (NFR-008).
- [ ] Results committed to `docs/architecture/agents-perf-evidence.md`.
- [ ] CI gate added: cancellation test fails build if p95 ≥ 1s.
- [ ] Cross-link AGN-7.S6.

#### Dependencies

- Blocked by: AGN-7.S6 (cancellation single path must exist)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- All five reason types load-tested; CI gate green.
- Cancellation latency evidence committed to `docs/architecture/`.

---

## Agents SRS Traceability Matrix (Appendix D)

Every FR-NNN / UI-NNN / NFR-NNN in `docs/architecture/agents-srs.md` mapped to its owning Epic and Ticket(s) in this backlog. Cross-link DOC-3.T15 (RTM walk-through) and AGN-7.T3 (RTM evidence script).

### Functional Requirements (FR-001..088)

| FR ID  | Epic  | Ticket(s)                    |
| ------ | ----- | ---------------------------- |
| FR-001 | AGN-1 | AGN-1.S2                     |
| FR-002 | AGN-1 | AGN-1.S3                     |
| FR-003 | AGN-5 | AGN-5.S1, AGN-5.S2, AGN-5.S3 |
| FR-004 | AGN-1 | AGN-1.S6                     |
| FR-005 | AGN-1 | AGN-1.S5                     |
| FR-006 | AGN-1 | AGN-1.S7                     |
| FR-007 | AGN-1 | AGN-1.S8                     |
| FR-008 | AGN-4 | AGN-4.S1                     |
| FR-009 | AGN-4 | AGN-4.S1                     |
| FR-010 | AGN-4 | AGN-4.S1                     |
| FR-011 | AGN-4 | AGN-4.S1                     |
| FR-012 | AGN-4 | AGN-4.S2                     |
| FR-013 | AGN-4 | AGN-4.S2                     |
| FR-014 | AGN-4 | AGN-4.S3                     |
| FR-015 | AGN-4 | AGN-4.S4                     |
| FR-016 | AGN-4 | AGN-4.S4                     |
| FR-017 | AGN-4 | AGN-4.S5                     |
| FR-018 | AGN-4 | AGN-4.S6                     |
| FR-019 | AGN-7 | AGN-7.S1                     |
| FR-020 | AGN-7 | AGN-7.S2                     |
| FR-021 | AGN-7 | AGN-7.S2                     |
| FR-022 | AGN-7 | AGN-7.S2                     |
| FR-023 | AGN-7 | AGN-7.S6                     |
| FR-024 | AGN-7 | AGN-7.S6                     |
| FR-025 | AGN-7 | AGN-7.S9                     |
| FR-026 | AGN-5 | AGN-5.S4                     |
| FR-027 | AGN-5 | AGN-5.S1, AGN-5.S2, AGN-5.S3 |
| FR-028 | AGN-7 | AGN-7.S3                     |
| FR-029 | AGN-7 | AGN-7.S3                     |
| FR-030 | AGN-7 | AGN-7.S3                     |
| FR-031 | AGN-7 | AGN-7.S3                     |
| FR-032 | AGN-6 | AGN-6.S5                     |
| FR-033 | AGN-6 | AGN-6.S5                     |
| FR-034 | AGN-6 | AGN-6.S5                     |
| FR-035 | AGN-6 | AGN-6.S5                     |
| FR-036 | AGN-7 | AGN-7.S7                     |
| FR-037 | AGN-7 | AGN-7.S7                     |
| FR-038 | AGN-7 | AGN-7.S7                     |
| FR-039 | AGN-7 | AGN-7.S7                     |
| FR-040 | AGN-4 | AGN-4.S6                     |
| FR-041 | AGN-4 | AGN-4.S6                     |
| FR-042 | AGN-4 | AGN-4.S6                     |
| FR-043 | AGN-4 | AGN-4.S6                     |
| FR-044 | AGN-4 | AGN-4.S6                     |
| FR-045 | AGN-4 | AGN-4.S6                     |
| FR-046 | AGN-7 | AGN-7.S4                     |
| FR-047 | AGN-7 | AGN-7.S4                     |
| FR-048 | AGN-7 | AGN-7.S4                     |
| FR-049 | AGN-7 | AGN-7.S4                     |
| FR-050 | AGN-3 | AGN-3.S3                     |
| FR-051 | AGN-3 | AGN-3.S4                     |
| FR-052 | AGN-3 | AGN-3.S3                     |
| FR-053 | AGN-3 | AGN-3.S1                     |
| FR-054 | AGN-3 | AGN-3.S2                     |
| FR-055 | AGN-3 | AGN-3.S5                     |
| FR-056 | AGN-3 | AGN-3.S5                     |
| FR-057 | AGN-3 | AGN-3.S6                     |
| FR-058 | AGN-3 | AGN-3.S6                     |
| FR-059 | AGN-3 | AGN-3.S5                     |
| FR-060 | AGN-2 | AGN-2.S1                     |
| FR-061 | AGN-2 | AGN-2.S1                     |
| FR-062 | AGN-2 | AGN-2.S1, AGN-2.S5           |
| FR-063 | AGN-2 | AGN-2.S5, AGN-2.S6, AGN-2.S7 |
| FR-064 | AGN-2 | AGN-2.S1, AGN-2.S5           |
| FR-065 | AGN-2 | AGN-2.S2                     |
| FR-066 | AGN-2 | AGN-2.S2, AGN-2.S3           |
| FR-067 | AGN-2 | AGN-2.S3                     |
| FR-068 | AGN-2 | AGN-2.S4                     |
| FR-069 | AGN-2 | AGN-2.S4                     |
| FR-070 | AGN-2 | AGN-2.S4                     |
| FR-071 | AGN-5 | AGN-5.S1, AGN-5.S2, AGN-5.S3 |
| FR-072 | AGN-5 | AGN-5.S4                     |
| FR-073 | AGN-5 | AGN-5.S1, AGN-5.S2, AGN-5.S3 |
| FR-074 | AGN-5 | AGN-5.S5                     |
| FR-075 | AGN-5 | AGN-5.S5                     |
| FR-076 | AGN-6 | AGN-6.S1                     |
| FR-077 | AGN-6 | AGN-6.S2                     |
| FR-078 | AGN-6 | AGN-6.S3                     |
| FR-079 | AGN-6 | AGN-6.S4                     |
| FR-080 | AGN-6 | AGN-6.S5                     |
| FR-081 | AGN-6 | AGN-6.S5                     |
| FR-082 | AGN-6 | AGN-6.S6                     |
| FR-083 | AGN-6 | AGN-6.S6                     |
| FR-084 | AGN-6 | AGN-6.S1, AGN-6.S6           |
| FR-085 | AGN-7 | AGN-7.S6                     |
| FR-086 | AGN-7 | AGN-7.S6                     |
| FR-087 | AGN-7 | AGN-7.S6, AGN-S6.T6          |
| FR-088 | AGN-7 | AGN-7.S6                     |

### UI Requirements (UI-001..025)

| UI ID  | Epic  | Ticket(s)                                        |
| ------ | ----- | ------------------------------------------------ |
| UI-001 | AGN-1 | AGN-1.S2                                         |
| UI-002 | AGN-1 | AGN-1.S8                                         |
| UI-003 | AGN-1 | AGN-1.S2, AGN-4.S1                               |
| UI-004 | AGN-1 | AGN-1.S2, AGN-7.S6                               |
| UI-005 | AGN-1 | AGN-1.S5, AGN-1.S6                               |
| UI-006 | AGN-1 | AGN-1.S7                                         |
| UI-007 | AGN-4 | AGN-4.S1, AGN-4.S6                               |
| UI-008 | AGN-4 | AGN-4.S2, AGN-4.S6                               |
| UI-009 | AGN-7 | AGN-7.S7                                         |
| UI-010 | AGN-7 | AGN-7.S7                                         |
| UI-011 | AGN-1 | AGN-1.S3                                         |
| UI-012 | AGN-1 | AGN-1.S3                                         |
| UI-013 | AGN-1 | AGN-1.S3, AGN-4.S1                               |
| UI-014 | AGN-1 | AGN-1.S3                                         |
| UI-015 | AGN-6 | AGN-6.S1                                         |
| UI-016 | AGN-6 | AGN-6.S1, AGN-6.S2, AGN-6.S3, AGN-6.S4, AGN-6.S5 |
| UI-017 | AGN-3 | AGN-3.S1, AGN-3.S5                               |
| UI-018 | AGN-6 | AGN-6.S2, AGN-6.S6                               |
| UI-019 | AGN-6 | AGN-6.S6                                         |
| UI-020 | AGN-4 | AGN-4.S6                                         |
| UI-021 | AGN-4 | AGN-4.S6                                         |
| UI-022 | AGN-4 | AGN-4.S6                                         |
| UI-023 | AGN-1 | AGN-1.S2                                         |
| UI-024 | AGN-1 | AGN-1.S2                                         |
| UI-025 | AGN-1 | AGN-1.S2                                         |

### Non-Functional Requirements (NFR-001..039)

| NFR ID  | Epic  | Ticket(s)           |
| ------- | ----- | ------------------- |
| NFR-001 | AGN-1 | AGN-1.S5            |
| NFR-002 | AGN-7 | AGN-7.S6            |
| NFR-003 | AGN-7 | AGN-7.S7            |
| NFR-004 | AGN-7 | AGN-7.S5            |
| NFR-005 | AGN-7 | AGN-7.S5            |
| NFR-006 | AGN-3 | AGN-3.S2, AGN-S6.T4 |
| NFR-007 | AGN-3 | AGN-3.S3, AGN-S6.T5 |
| NFR-008 | AGN-7 | AGN-7.S6, AGN-S6.T6 |
| NFR-009 | AGN-7 | AGN-7.S1            |
| NFR-010 | AGN-7 | AGN-7.S1            |
| NFR-011 | AGN-7 | AGN-7.S2            |
| NFR-012 | AGN-7 | AGN-7.T1            |
| NFR-013 | AGN-7 | AGN-7.T1            |
| NFR-014 | AGN-4 | AGN-4.S5            |
| NFR-015 | AGN-7 | AGN-7.S9            |
| NFR-016 | AGN-7 | AGN-7.S5            |
| NFR-017 | AGN-7 | AGN-7.S8            |
| NFR-018 | AGN-7 | AGN-7.T4            |
| NFR-019 | AGN-7 | AGN-7.S2            |
| NFR-020 | AGN-1 | AGN-1.S2            |
| NFR-021 | AGN-1 | AGN-1.S2            |
| NFR-022 | AGN-7 | AGN-7.S7            |
| NFR-023 | AGN-1 | AGN-1.S5            |
| NFR-024 | AGN-1 | AGN-1.S2, AGN-4.S1  |
| NFR-025 | AGN-7 | AGN-7.S7            |
| NFR-026 | AGN-7 | AGN-7.S7            |
| NFR-027 | AGN-7 | AGN-7.S7            |
| NFR-028 | AGN-7 | AGN-7.S7            |
| NFR-029 | AGN-7 | AGN-7.S7            |
| NFR-030 | AGN-7 | AGN-7.S7            |
| NFR-031 | AGN-7 | AGN-7.S4            |
| NFR-032 | AGN-4 | AGN-4.S6            |
| NFR-033 | AGN-7 | AGN-7.T2            |
| NFR-034 | AGN-7 | AGN-7.S5            |
| NFR-035 | AGN-7 | AGN-7.S6            |
| NFR-036 | AGN-7 | AGN-7.S1            |
| NFR-037 | AGN-7 | AGN-7.S7            |
| NFR-038 | AGN-6 | AGN-6.S6            |
| NFR-039 | AGN-7 | AGN-7.S7            |
