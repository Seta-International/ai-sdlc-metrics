# Agent Module — UX Refactor Design

**Date:** 2026-04-30
**Status:** Approved for implementation planning
**Scope:** `packages/agent` (Panel + Ambient + Inline + runtime/state hooks). Admin pages (`web-admin/src/app/agents`) out of scope.

## 1. Motivation

The `packages/agent` family has a working SSE runtime (`agent-chat-adapter.ts`, `agent-turn-store.ts`, `event-consumer.ts`) and a sound backend (session, conversation, draft-approval, insight, definition, preferences, schedule, rollout, readiness routers). What's missing is the user-facing surface: the current `AgentPanel` is a bare thread + composer with no visualization of the agent's reasoning. The new design (`docs/raws/design/project/planner/ai-panel.jsx`) renders the SSE event contract beat-for-beat — Plan card, Tool-call traces, Draft approval card, iteration loop, action footer — at a fidelity that matches DESIGN.md tokens exactly (dark-mode-first, Accent Violet `#7170ff`, IBM Plex Mono labels, signature weight 510).

This refactor brings the UI to design parity, with no backward compatibility shims.

## 2. Constraints

- **No backward compat.** Rewrite callers in the same change. Per CLAUDE.md.
- **Keep `@assistant-ui/react`.** Integrate via its native extension points (`makeAssistantToolUI`, custom message renderers, composer slots) — do not replace it.
- **DESIGN.md tokens only.** Drop the design file's hex codes; map every color/typography choice to existing tokens.
- **TDD.** Every new component, handler, and adapter mapping ships with tests. ≥70% coverage gate.
- **SSR-safe.** localStorage and `window` reads only via `useSyncExternalStore` per CLAUDE.md.
- **Migrations stay squashed.** Any schema additions go into `0000_initial.sql` per CLAUDE.md dev-phase rule.

## 3. Plan decomposition

Six implementation plans, three execution phases.

```
Phase 1 (sequential — must land first)
└── Plan 1: Foundation — primitives + Panel chrome

Phase 2 (parallel — visual)
├── Plan 2: Streaming — PlanCard + ToolCall traces + AnswerBubble
├── Plan 3: DraftCard + approval inline
└── Plan 6: Iteration + collapsed rail + Ambient/Inline restyle

Phase 3 (parallel — new backend)
├── Plan 4: Idle suggestions
└── Plan 5: ActionFooter — feedback + regenerate
```

| Plan | New backend                                                           | New tables                                                 | New permissions                  |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| 1    | —                                                                     | —                                                          | —                                |
| 2    | —                                                                     | —                                                          | —                                |
| 3    | extend `draftApproval.reject` with optional `note`                    | adds `note` column to existing draft rejection persistence | —                                |
| 4    | new `agents.suggestions.list` router                                  | —                                                          | reuses `AGENT_CONVERSATION_READ` |
| 5    | new `agents.feedback.submit`, new `agents.session.regenerateLastTurn` | new `agents.message_feedback`                              | adds `AGENT_CONVERSATION_WRITE`  |
| 6    | —                                                                     | —                                                          | —                                |

## 4. Plan 1 — Foundation: primitives + panel chrome

**Goal:** Replace inline-style hex codes from `ai-panel.jsx` with design-system tokens; rebuild `AgentPanel` shell to match the design's three-row layout.

### 4.1 File-level changes in `packages/agent`

```
src/
  primitives/                    [NEW]
    tag.tsx                      Uppercase mono pill (color/bg variants)
    mono.tsx                     IBM Plex Mono span
    tiny-btn.tsx                 22px ghost button
    icon-btn.tsx                 24×24 icon-only button
    tool-call-shell.tsx          Collapsible row chrome (Plan 2 consumes)
    primitives.spec.tsx
  panel/
    agent-panel.tsx              REWRITE — new shell composition
    agent-panel-header.tsx       [NEW] logo · "Action Intelligence" · live badge · task context · new-thread · collapse
    agent-panel-meta-strip.tsx   [NEW] flow_id · model · tokens · cost
    agent-context-pills.tsx      DELETE — task context moves into header
    agent-panel.spec.tsx         REWRITE
```

### 4.2 Token mapping

| `aiColors` (design file) | DESIGN.md token           | Tailwind class                 |
| ------------------------ | ------------------------- | ------------------------------ |
| `bg #0b0c0d`             | Marketing Black `#08090a` | `bg-background`                |
| `panel #0f1011`          | Panel Dark                | `bg-sidebar`                   |
| `text #f7f8f8`           | Primary Text              | `text-foreground`              |
| `sub #8a8f98`            | Tertiary Text             | `text-muted-foreground`        |
| `muted #62666d`          | Quaternary Text           | `text-muted-foreground/70`     |
| `line 0.05`              | Border Subtle             | `border-border/50`             |
| accent `#7170ff`         | Accent Violet             | `text-accent` (added to theme) |

### 4.3 Wiring

The current `agent-turn-store.ts` exposes `traceId, topology, phase, activeSubAgents, shape, drafts, isRefused, refusalReason, isEnded, endReason`. Plan 1 extends it with `streaming: boolean` (true between `turn.started` and `turn.ended`) and `usage: UsageSnapshot | null` (last snapshot from `iteration.ended`/`turn.ended`). Plan 1 also adds a `getModel(): string` helper that derives the model from `metadata.model` if present (the existing schema attaches a free-form `metadata` field on every event).

The current `use-agent-state.tsx` exposes `panelOpen, activeSessionId, insights`. Plan 1 extends it with `collapsed: boolean` + `setCollapsed(boolean)` (per-zone localStorage-backed in Plan 6; Plan 1 keeps it in-memory).

- Meta strip reads from the turn-store: `traceId` (rendered abbreviated as `flow_{first8}…`), `getModel()`, last `usage` (`input_tokens + output_tokens` for "tokens" cell; cost = `null` placeholder dash until Plan 5 wires actual cost — design's `$0.019` is informational, no backend cost rollup currently exists).
- New-thread button → `trpc.agents.session.create.useMutation()`. Args derived from `useAgentContext()`: `{ tenantId: ctx?.metadata?.tenantId ?? '', actorId: ctx?.metadata?.actorId ?? '', contextModule: ctx?.module, contextEntity: ctx?.entity, contextEntityId: ctx?.id, contextMetadata: ctx?.metadata }`. On success: reset local turn-store + `setActiveSessionId(newSession.id)`.
- Live badge: green when `useAgentTurnStore(s => s.streaming) === true`, muted gray when `isEnded`, hidden until first `turn.started`.
- Task context text: `useAgentContext()?.entity` (e.g. "Refactor token export pipeline"). Hides when context is null.
- Collapse toggle: `useAgentState().setCollapsed(true)` — Plan 6 implements the rail and persistence; Plan 1 wires the state and renders an empty placeholder div when `collapsed === true`.

### 4.4 Test coverage

- Header renders task context, hides when null.
- Meta strip shows flow_id, model, tokens, cost; renders dashes when no flow.
- New-thread button calls `session.create` with current `AgentContext` and resets store.
- Live badge toggles class on `streaming` boolean.
- Panel respects collapsed state — renders rail slot when collapsed.

## 5. Plan 2 — Streaming visualization

**Goal:** Render `turn.started`/`phase.started` as a `PlanCard`, `iteration.*` as collapsible `IterationStep` rows, `answer.token` as a streaming `AnswerBubble`. Existing SSE schema (`packages/agent/src/runtime/sse-event-schema.ts`) drives the visuals — no schema or backend agent-runtime changes.

### 5.1 Files

```
src/
  runtime/
    agent-chat-adapter.ts        EXTEND — emit content parts per SSE event
    agent-chat-adapter.spec.ts   EXTEND — assert part shapes
  thread/
    agent-thread.tsx             REWRITE — register tool UIs + custom message renderer
    agent-message.tsx            [NEW] assistant-message wrapper (PlanCard slot, parts, ActionFooter slot)
    agent-message.spec.tsx
  thread/cards/                  [NEW]
    plan-card.tsx                turn.started + phase.started visualization
    iteration-step.tsx           iteration.started/validated/ended visualization
    answer-bubble.tsx            answer.token stream (assistant-ui Text part)
    user-turn.tsx                user message bubble
    cards.spec.tsx
```

### 5.2 SSE → assistant-ui mapping

The adapter currently flattens everything to a single text part (`agent-chat-adapter.ts:51-56`). New mapping using the actual event union from `sseEventSchema`:

| SSE event               | assistant-ui treatment                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `turn.started`          | seed message metadata `{ traceId, conversationId, topology }`; emit a `tool-call` part `toolName: "agent.plan"` (PlanCard renders)   |
| `phase.started`         | extend `agent.plan` part's args with `phase` + `subAgents[]`                                                                         |
| `iteration.started`     | append a `tool-call` part `toolName: "agent.iteration"`, args `{ n, subAgentDomain, selectionReason }`, state `running`              |
| `iteration.validated`   | mutate the matching iteration part: set `passed`, `scorerResults`, state `done` if `passed === true` else `error`                    |
| `iteration.ended`       | mutate matching iteration part: set `usage` (tokens) + `isComplete`                                                                  |
| `progress`              | append a transient text-line annotation on the message (ephemeral; cleared on next event of any other type)                          |
| `refusal.started`       | replace the assistant text part with a refusal block (red accent, reason); finalize on `turn.ended`                                  |
| `answer.shape_declared` | metadata only — record `shape` on the message                                                                                        |
| `answer.token`          | append `payload.text` to streaming `text` part                                                                                       |
| `answer.complete`       | finalize streaming `text` part with full `content`                                                                                   |
| `draft.proposed`        | append a `tool-call` part `toolName: "agent.draft"`, args `{ actionId, summary, tier, requiresApproval, provenance }` (Plan 3 wires) |
| `turn.ended`            | finalize message: `{ endReason, usage }` written to message metadata; meta strip (Plan 1) reads `usage` to display tokens / cost     |

### 5.3 Tool UI registrations

In `AgentThread`:

```ts
useAssistantToolUI({ toolName: 'agent.plan', render: PlanCard })
useAssistantToolUI({ toolName: 'agent.iteration', render: IterationStep })
useAssistantToolUI({ toolName: 'agent.draft', render: DraftCard }) // Plan 3 wires
```

There are no generic tool-call events emitted by the backend, so no fallback renderer is needed.

### 5.4 Component contracts

`PlanCard` props (from `turn.started` + `phase.started`):

- `traceId: string` (mono, abbreviated to first 8 chars + ellipsis)
- `conversationId: string | null`
- `topology: 'bounded' | 'iterative'` — accent tag
- `phase: 1 | 2 | null` — `1 = router/select`, `2 = synthesize`
- `subAgents: { domain: string; name?: string }[]`
- `iteration?: number` — set after first `iteration.started` arrives

`IterationStep` props (from `iteration.started/validated/ended`):

- `n: number` — iteration number (1-indexed)
- `subAgentDomain: string` — e.g. `planner`, `people`
- `selectionReason: string` — short string (router's reason for selecting this domain)
- `state: 'running' | 'passed' | 'failed'` — driven by `validated.passed` (running until validated)
- `scorerResults?: { scorer: string; passed: boolean; score?: number }[]` — populated on validated
- `usage?: { input_tokens, output_tokens, ... }` — populated on ended
- `isComplete?: boolean` — populated on ended; true when `iteration.ended.is_complete`
- collapsible: header always visible (`{n}. {subAgentDomain}` + status icon); body shows `selectionReason`, `scorerResults`, `usage` when expanded
- defaults to closed when `state !== 'running'`; auto-opens while running

`AnswerBubble` props:

- `text: string` (streaming or finalized — assistant-ui's `MessagePrimitive.Content` handles both)
- `shape?: string` (from `answer.shape_declared`) — rendered as small mono caption above the bubble when present

`UserTurn` props: `text: string` only.

### 5.5 Test coverage

- Adapter unit (parameterized): for each event in `sseEventSchema`, the adapter emits the expected assistant-ui part shape and message-metadata mutation.
- `PlanCard` renders all subAgents; topology tag colors per value; iteration tag hidden when undefined.
- `IterationStep` shows correct status icon per state (loader/check/warn); auto-opens on `running`; collapses on `passed`; stays expanded on `failed`.
- `IterationStep` renders `scorerResults` rows as `name → passed/failed` only when present.
- `AgentThread` renders, for a fixed event sequence (turn.started → phase.started → iteration.started → iteration.validated → iteration.ended → answer.token×N → answer.complete → turn.ended): UserTurn, PlanCard (1), IterationStep (1), AnswerBubble — in that order.
- `AgentThread` renders refusal block when `refusal.started` fires; meta strip shows `endReason: 'refused'`.

## 6. Plan 3 — DraftCard + approval

**Goal:** Render `draft.proposed` events as an inline `DraftCard` that supports approve/reject directly in the panel, gated by permission. The SSE event payload (`{ action_id, summary, tier, requires_approval, provenance }`) is too shallow to populate the card's fields/warnings; the card fetches the full draft row via a new query.

### 6.1 Files

```
packages/agent/src/
  thread/cards/
    draft-card.tsx               [NEW]
    draft-card.spec.tsx
    reject-reason-picker.tsx     [NEW] enum picker (4 reasons + free-text note)
  hooks/
    use-can-approve-drafts.ts    [NEW] permission lookup wrapper
    use-can-approve-drafts.spec.ts
    use-draft-row.ts             [NEW] tRPC query wrapper for agents.drafts.getById
    use-draft-row.spec.ts

apps/api/src/modules/agents/
  domain/repositories/draft.repository.ts          EXTEND — add getDetailById signature
  infrastructure/drizzle-draft.repository.ts       EXTEND — implement getDetailById
  interface/trpc/draft-audit.router.ts             EXTEND — add getById query
  interface/trpc/draft-approval.router.ts          EXTEND — accept optional `note` on reject
  application/services/draft-approval.service.ts   EXTEND — forward `note` to repo
  infrastructure/schema/agent-draft.schema.ts      EXTEND — add executionOutcomeNote column
```

### 6.2 DraftCard layout

```
┌──────────────────────────────────────────────────┐
│ ● Draft · awaiting you   [pending]   {sub_agent_domain}.{toolName}
├──────────────────────────────────────────────────┤
│ {summary}                                        │
│ tool      {toolName}                             │
│ tier      {low_risk_auto | high_risk_approval_required}
│ args      {key1: value1}                         │
│           {key2: value2}                         │
│ ⚠ tainted at draft time  (only when taintAtDraftTime === true)
├──────────────────────────────────────────────────┤
│           [Reject ▾]  [Approve]                  │
└──────────────────────────────────────────────────┘
```

Field sources (after `agents.drafts.getById` returns the row):

- `sub_agent_domain` ← `provenance.sub_agent_domain` from SSE event
- `toolName`, `tier`, `args` ← draft row
- Warnings: render `tainted at draft time` when `taintAtDraftTime === true` (from draft row).

State pill: `pending → amber`, `approved → green`, `rejected → red`, `expired → muted gray`, `executed → green`, `execution_failed → red`, `cancelled → muted` — mapped to design tokens.

### 6.3 Permission gating

`useCanApproveDrafts()` returns `boolean` from existing `PermissionContext` (checks `AGENT_DRAFT_APPROVE`).

| Actor permission                    | Footer rendering                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| Has `AGENT_DRAFT_APPROVE`           | `[Reject ▾] [Approve]` buttons active                                         |
| Lacks permission                    | `[ Sent for approval ]` muted pill, no buttons                                |
| Draft already `approved`/`rejected` | Footer shows resolved state + actor + timestamp from `draft_phase.resolution` |

### 6.4 Mutations

- Approve → `trpc.agents.draftApproval.approve.mutate({ draftId })`. Optimistically transition `state: 'approved'`; backend refresh via SSE.
- Reject → opens `RejectReasonPicker`. 4 enum options: `not_needed`, `wrong_entity`, `wrong_value`, `other_with_note`. On `other_with_note`, exposes a free-text note input. Calls `draftApproval.reject.mutate({ draftId, reason, note? })`.

**Backend extensions (in this plan):**

- `agents.drafts.getById({ draftId })` — new query on `draftAuditRouter`. Permission: `AGENT_DRAFT_AUDIT_READ`. Returns the full draft row (id, traceId, flowId, toolName, args, tier, status, taintAtDraftTime, executionOutcome, draftedAt, expiresAt, etc.). DraftCard fetches this on mount keyed off `action_id` from the SSE event.
- `agents.draftApproval.reject` input schema gains optional `note: z.string().max(500).optional()`.
- `DraftApprovalService.rejectDraft({ ..., note? })` accepts the note and forwards it to the repo.
- `agent_draft.schema.ts` gains a sibling column `executionOutcomeNote text NULL`. The existing `executionOutcome text` column keeps storing the enum reason; the note is independent so we don't conflate enum vs free-text content.
- `0000_initial.sql` re-squashed (per CLAUDE.md dev-phase rule): delete `.sql` + `meta/` snapshots, `bun run db:generate --name initial`, reapply.
- The kernel audit event payload (`agent.draft_rejected`) gains `note: string | null` alongside `reason`.

### 6.5 Error handling

- Permission error from server (race: actor lost permission) → toast + revert optimistic state.
- Network error → button stays in pending state; retry on next click.
- Stale draft (already approved by another actor) → show resolved state, no buttons.

### 6.6 Test coverage

- `DraftCard` renders all states (proposed, approved, rejected).
- Footer respects `useCanApproveDrafts` (mocked) — buttons vs. "Sent for approval" pill.
- Approve calls mutation with `draftId`, optimistic state updates.
- Reject opens picker; selecting reason calls mutation with correct payload.
- Reject `other_with_note` shows note input, sends `{ reason, note }`.
- Resolved drafts (approved/rejected) hide action buttons, show resolution metadata.
- Backend handler accepts and persists optional `note`.

## 7. Plan 4 — Idle suggestions

**Goal:** When the panel opens with no active turn, render a welcome block with 4 contextual prompt suggestions; clicking a suggestion seeds + submits.

### 7.1 Backend files

```
apps/api/src/modules/agents/
  domain/value-objects/
    suggestion.ts                [NEW] { slug, text, surface }
  application/queries/
    list-suggestions.query.ts    [NEW]
    list-suggestions.handler.ts
    list-suggestions.handler.spec.ts
  infrastructure/
    suggestion-config.ts         [NEW] static per-surface map
    suggestion-config.spec.ts
  interface/trpc/
    suggestions.router.ts        [NEW]
  agents.module.ts               WIRE handler + repo
```

### 7.2 Frontend files

```
packages/agent/src/
  panel/idle/
    idle-state.tsx               [NEW] welcome block + suggestion list
    suggestion-chip.tsx          [NEW]
    idle-state.spec.tsx
```

### 7.3 Backend behavior (MVP — static config)

`SuggestionConfig` is a static map keyed by `surface` (the zone, e.g. `planner`, `people`, `hiring`, `finance`). Each surface returns 4 suggestions plus a welcome subtext. The handler:

1. Loads suggestions for `input.surface` from config.
2. If `input.contextEntity` is provided, filters/templates suggestions that reference it (e.g. `"What's blocking {contextEntity.title}?"`).
3. Returns `Suggestion[]` and welcome subtext.

LLM-derived / personalized suggestions are deferred to a later sub-project.

### 7.4 tRPC contract

```ts
agents.suggestions.list({
  surface: string,
  contextEntity?: string,
  contextEntityId?: string,
}) → { suggestions: Suggestion[], welcomeSubtext: string }
```

Permission: `AGENT_CONVERSATION_READ`.

### 7.5 Frontend wiring

- `idle-state` mounts when assistant-ui's `useThread().messages.length === 0` (the turn-store doesn't track per-thread messages — assistant-ui owns the message list).
- Fetched via `trpc.agents.suggestions.list.useQuery({ surface, contextEntity, contextEntityId })` from `useAgentContext()`.
- Click chip → `composer.setValue(suggestion.text)` + `composer.submit()` (assistant-ui composer slots).
- Loading → 4 skeleton chips. Error → render welcome block, hide suggestions list.

### 7.6 Welcome block

- 36px gradient-accent square with spark icon.
- Title: `"Ask about {contextEntity}"` when entity present, else `"Ask about this plan"`.
- Subtext: from server response (`welcomeSubtext` per surface).

### 7.7 Test coverage

- Handler returns 4 suggestions for known surfaces; empty array for unknown.
- Handler templates suggestions when contextEntity present.
- Router enforces `AGENT_CONVERSATION_READ`.
- `IdleState` renders only when turn-store is empty.
- Click on chip seeds composer and submits.
- Loading state shows 4 skeleton chips.
- Welcome subtext templated when contextEntity present.

## 8. Plan 5 — ActionFooter

**Goal:** Each completed assistant turn gets a footer row with copy / regenerate / thumbs-up / thumbs-down / iterate. Two new backend endpoints; rest is UI + existing hooks.

### 8.1 Backend files

```
apps/api/src/modules/agents/
  domain/entities/
    message-feedback.ts                  [NEW] { messageId, rating, note?, actorId, createdAt }
  domain/repositories/
    message-feedback.repository.ts       [NEW]
  infrastructure/
    drizzle/schemas/
      message-feedback.schema.ts         [NEW]
    drizzle-message-feedback.repository.ts
  application/commands/
    submit-feedback.command.ts           [NEW]
    submit-feedback.handler.ts
    submit-feedback.handler.spec.ts
    regenerate-last-turn.command.ts      [NEW]
    regenerate-last-turn.handler.ts
    regenerate-last-turn.handler.spec.ts
  interface/trpc/
    feedback.router.ts                   [NEW]
    session.router.ts                    EXTEND — add regenerateLastTurn
```

### 8.2 Frontend files

```
packages/agent/src/
  thread/footer/
    action-footer.tsx                    [NEW]
    action-footer.spec.tsx
    feedback-note-popover.tsx            [NEW] — collected only on thumbs-down
```

### 8.3 Schema (`agents.message_feedback`)

```sql
tenant_id    uuid       NOT NULL,
message_id   uuid       NOT NULL REFERENCES agents.session_message(id),
actor_id     uuid       NOT NULL,
rating       text       NOT NULL CHECK (rating IN ('up','down')),
note         text       NULL,
created_at   timestamptz NOT NULL DEFAULT now(),
PRIMARY KEY (tenant_id, message_id, actor_id)
```

Squashed into `0000_initial.sql` per CLAUDE.md.

### 8.4 tRPC contracts

```ts
agents.feedback.submit({
  messageId: uuid,
  rating: 'up' | 'down',
  note?: string,                  // collected on thumbs-down only
}) → void

agents.session.regenerateLastTurn({
  sessionId: uuid,
}) → { newTurnId: string }       // new SSE stream begins from this turn
```

Permissions:

- `submit` → new `AGENT_CONVERSATION_WRITE` (granted alongside `AGENT_CONVERSATION_READ`).
- `regenerateLastTurn` → reuses existing `AGENT_SESSION_SEND`.

### 8.5 Footer behaviors

| Button          | Behavior                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Copy**        | `navigator.clipboard.writeText(message.text)`; transient checkmark                                                                            |
| **Regenerate**  | `agents.session.regenerateLastTurn` → new turn streams over the old one; old turn marked `superseded`. Disabled when not last assistant turn. |
| **Thumbs up**   | `feedback.submit({ rating: 'up' })`; toggle to active state                                                                                   |
| **Thumbs down** | Opens `feedback-note-popover` (optional note); on submit → `feedback.submit({ rating: 'down', note })`                                        |
| **Iterate**     | New turn with `iteration: previousIteration + 1` metadata, same `flow_id`. Calls `session.sendMessage` with `{ iterationOf: messageId }`.     |

**Iterate vs Regenerate:** Regenerate replaces the answer (same iteration). Iterate appends a new linked turn (next iteration), which the iteration view in Plan 6 groups visually.

### 8.6 Footer placement

Renders below assistant message, only when message is complete (`turn_end` received) and is one of: standard answer, draft (after resolution), refusal. Hidden during streaming.

### 8.7 Test coverage

- `submit-feedback.handler` happy path (insert) + duplicate actor (idempotent update).
- `regenerate-last-turn.handler` — must target last assistant turn; errors otherwise.
- Router permission gates.
- `ActionFooter` renders only on completed turns.
- Copy button copies message text and shows transient confirmation.
- Thumbs up calls submit immediately; thumbs down opens popover.
- Regenerate disabled when not last turn; enabled when last.
- Iterate calls sendMessage with `iterationOf` metadata.

## 9. Plan 6 — Iteration view + collapsed rail + ambient/inline restyle

**Goal:** Three independent UI-only sub-tasks bundled into a cleanup plan. No new backend.

### 9.1 Iteration view

Turn-store records iterations as linked turns (`iterationOf` chain). Design's iteration view shows a triplet header (`iter 2 of 3`) and stacks iterations vertically with collapse on prior iterations.

```
packages/agent/src/thread/iteration/
  iteration-group.tsx              [NEW] groups turns by flow_id + iterationOf chain
  iteration-header.tsx             [NEW] iter N of M · loop icon
  iteration-group.spec.tsx
```

Behavior:

- `AgentThread` post-processes assistant messages: groups consecutive turns sharing a `flow_id` into one `IterationGroup`.
- Header shows `iter {n} of {total}` + accent loop icon.
- Iterations 1..(n-1) collapsed (one-line summary: first 80 chars of answer); iteration n expanded (PlanCard + ToolCalls + AnswerBubble + ActionFooter).
- Click prior iteration row → expand/collapse.

### 9.2 Collapsed rail (`AIChatRail`)

When `useAgentState(s => s.collapsed) === true`, render a 40-44px vertical strip instead of the full panel. Strip contains: spark logo, expand button, optional unread/insight badge.

```
packages/agent/src/panel/rail/
  agent-chat-rail.tsx              [NEW]
  agent-chat-rail.spec.tsx
  use-collapsed-state.ts           [NEW] — wraps useAgentState + persists to localStorage via useSyncExternalStore (per CLAUDE.md SSR rule)
```

Wiring:

- `AgentPanel` (Plan 1 left a slot) reads `collapsed` and renders `<AIChatRail />` instead of full content.
- Expand button → `setCollapsed(false)`.
- Persisted per-zone in localStorage key `agent-panel-collapsed:${surface}`.

### 9.3 Ambient + Inline restyle

Apply Plan 1 primitives (`Tag`, `Mono`, accent surfaces, Inter 510, IBM Plex Mono labels) — no behavior changes.

```
packages/agent/src/ambient/
  agent-strip.tsx                  Restyle — accent border, Tag for status, Mono for metadata
  agent-badge.tsx                  Restyle — accent dot, mono caption
  agent-banner.tsx                 Restyle — flat dark surface, Tag for severity, accent CTA
packages/agent/src/inline/
  agent-inline-action.tsx          Restyle — TinyBtn + spark icon
  agent-inline-response.tsx        Restyle — AnswerBubble primitive (Plan 2) + ActionFooter compact variant (Plan 5)
```

### 9.4 Test coverage

- IterationGroup groups turns by flow_id correctly; total = max iteration in chain.
- Prior iterations collapse to summary; click toggles expand.
- Current iteration renders expanded by default.
- AIChatRail renders when `collapsed === true`; expand button toggles state.
- localStorage persistence is SSR-safe (initial render matches server snapshot).
- Ambient/inline visual snapshot tests against new tokens.
- AgentInlineResponse uses shared AnswerBubble + compact ActionFooter.

## 10. Cross-cutting concerns

### 10.1 Theming

The whole agent surface is dark. `AgentPanel`, ambient, inline all carry a `dark` class scoped to their root. Zone backgrounds (light or dark) do not bleed through.

### 10.2 Accessibility

- All interactive elements use `<Button>` from `@future/ui` (per CLAUDE.md UI/UX rule). No raw `<button>`.
- Tool-call collapsibles have `aria-expanded`, `aria-controls`.
- Iteration headers are buttons with `aria-expanded` for the collapsed state.
- Copy/thumbs/regenerate/iterate have `aria-label`.
- Focus order matches visual order in panel header → meta strip → thread → composer.

### 10.3 Data flow summary

```
SSE → event-consumer → agent-turn-store ─┬─→ Plan 1 meta strip (flow / model / tokens / cost)
                                          ├─→ Plan 1 live badge
                                          └─→ agent-chat-adapter → assistant-ui parts
                                                ├─→ user-turn         (user message)
                                                ├─→ PlanCard          (toolName: agent.plan)
                                                ├─→ ToolCall (×N)     (toolName: phase.tool)
                                                ├─→ AnswerBubble      (text part from synthesizer_token)
                                                ├─→ DraftCard         (toolName: agent.draft)
                                                └─→ ActionFooter      (after turn_end)

trpc.agents.suggestions.list  ─→ IdleState                        (Plan 4)
trpc.agents.draftApproval.*   ─→ DraftCard buttons                (Plan 3)
trpc.agents.feedback.submit   ─→ ActionFooter thumbs              (Plan 5)
trpc.agents.session.regenerateLastTurn ─→ ActionFooter regenerate (Plan 5)
trpc.agents.session.create    ─→ AgentPanelHeader new-thread      (Plan 1)
trpc.agents.session.sendMessage ─→ ActionFooter iterate           (Plan 5, existing endpoint)
```

### 10.4 Permissions added

| Permission                 | Granted to              | Used by                  |
| -------------------------- | ----------------------- | ------------------------ |
| `AGENT_CONVERSATION_WRITE` | All authenticated users | `agents.feedback.submit` |

### 10.5 Schema additions

- `agents.message_feedback` (Plan 5).
- New `executionOutcomeNote text NULL` column on `agent_draft` table, sibling to existing `executionOutcome` (Plan 3).

### 10.6 Out of scope (later sub-projects)

- LLM-derived / personalized idle suggestions.
- Admin agent pages (`web-admin/src/app/agents/{page,sessions,readiness}`).
- Cross-zone shared session continuity (handed off via `web-shell`).
- Voice input / speech composer.
- Agent-initiated proactive insights surfaced in idle state.

## 11. Rollout

- All six plans land on `main` via PRs, CI green + one approval per CLAUDE.md.
- No feature flag — refactor is total. Old `agent-context-pills.tsx` and the existing bare `AgentPanel` are deleted in Plan 1.
- Workspace package `@future/agent` rebuilt at the end of Plan 1 (consumers in zones rebuild automatically via Turborepo).

## 12. Open questions

None remaining — all confirmed during brainstorming.
