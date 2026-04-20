# Agent Runtime — Phase 1 Implementation Plans

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source design:** `docs/superpowers/specs/2026-04-20-agent-runtime-phase-1-design.md`
**Target branch:** `feat/agent-runtime-phase-1-design` (already on)
**Scope:** Runtime foundation slice — gateway, one read-only sub-agent (planner), SSE contract, Langfuse Day 1, security boundary. Inside the existing `apps/api/src/modules/agents` module and `packages/agent` frontend package.
**Out of scope:** Router, multi-sub-agent, synthesizer shapes, writes/approvals, async, cost metering, canary, eval CI, moderation, replay. Each has a dedicated later phase.

---

## Plan files and execution order

Each plan produces working, testable software on its own. Dependencies below are hard — out-of-order work will not compile.

| #   | File                                         | Depends on            | Description                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [01-foundation.md](./01-foundation.md)       | —                     | Drizzle migrations for `agent_prompt_store` + `agent_narrative_store` (with RLS); repositories; Langfuse OTel wiring; `project_to_schema` sanitizer pure function.                                                                                                  |
| 02  | [02-gateway.md](./02-gateway.md)             | 01 (for kernel audit) | Refactor `AgentToolExecutor` into `ToolGateway` with full 10-step pipeline (identity injection → L1 cache → abort → canDo → shadow-mode → tRPC call → post-abort → audit → taint flip → cache write).                                                               |
| 03  | [03-tool-registry.md](./03-tool-registry.md) | 02                    | Extend `TrpcMeta` type to carry `agent`; add `.meta({ agent, permission })` to 5 planner read procedures; build registry adapter that walks the app router and produces AI SDK `tool()` shapes; drift test.                                                         |
| 04  | [04-sub-agents.md](./04-sub-agents.md)       | 01, 02, 03            | `defineSubAgent` factory + `SubAgentRegistry` + `SubAgentRunner` (wraps AI SDK `ToolLoopAgent`, `maxRetries: 0`) + `ContextAssembler` + `plannerSubAgent`.                                                                                                          |
| 05  | [05-endpoint-sse.md](./05-endpoint-sse.md)   | 04                    | Replace `send-message` command with `RunTurnCommand`. Add `POST /agent/turn` SSE controller. Full refactor of `packages/agent/src/runtime/sse-event-schema.ts` + adapter + store to match spec §15.3 Phase-1 subset. Mount `<AgentPanel>` trigger in `web-planner`. |

---

## Conventions locked in

- **TDD.** Every task is test-first. No test = feature not started. `≥70%` coverage per CLAUDE.md.
- **No backward compatibility.** Full refactor of SSE schema in plan 05; `AgentToolExecutor` removed in plan 02; `send-message.command` removed in plan 05. No shims, no legacy aliases, no dual-shape handling.
- **DDD module boundaries.** Cross-module reads only through `QueryFacade`. Runtime only injects `TrpcCaller` from planner side (via tRPC router walking, not direct service injection). `KernelAuditFacade` and `KernelQueryFacade` are consumed as allowed facades.
- **No `__tests__/` directories.** All tests co-located with `.spec.ts` suffix.
- **No `Promise.all` for DB queries inside handlers.** `await` sequentially per CLAUDE.md.
- **No `.js` extensions on relative imports.** NodeNext + CJS in `apps/api`.
- **Package management via CLI only.** `bun add`, `bun remove`, `turbo gen workspace`. Never hand-edit `package.json`.
- **Commit after every task.** Clean history; one task = one commit.

---

## Pre-implementation checks (verify before starting)

Each item references one or more plans. Resolving them up front avoids stalling mid-task.

1. **`KernelQueryFacade.getRolePermissions(tenantId, roleId)`** (Plan 04, Task 4). Returns `{ role: string; allow: readonly string[]; deny: readonly string[] }`. If not present in the kernel module, add a minimal implementation before Plan 04 Task 4 — it powers the permission narrative. 5-minute addition; needs kernel-module PR approval if you follow strict module boundaries.

2. **Session cookie test-helper** (Plan 05, Task 3 integration test). Existing integration specs issue `future-session` cookies via a shared helper. Grep `cookie: 'future-session=` in existing `*.integration.spec.ts` to find the exact helper name and reuse.

3. **Fastify session guard / middleware** (Plan 05, Task 3 controller). The tRPC path uses `createAuthMiddleware`. Fastify controllers in this repo either (a) use a shared NestJS guard or (b) reuse the same middleware against the raw request. Check one of the few existing Fastify controllers (grep `@Controller(` in `apps/api/src/modules/`) and mirror — do not invent a new guard.

4. **`AgentPanel` prop signature** (Plan 05, Task 9). The panel was migrated to `@assistant-ui/react` in commit `84374ffe`. Verify its current prop shape; Plan 05's example passes `{ adapter, store }` — adapt to whatever shape the panel actually accepts today.

5. **`AppLayout` top-toolbar slot** (Plan 05, Task 9). Plan 05 names the slot `toolbarExtras`. If the layout has no such slot, add the most minimal prop that does the job. Keep the change local to the trigger mount.

6. **Next.js rewrite for `/api/agent/turn`** (Plan 05, Task 9). Other zones already proxy tRPC to `apps/api`; mirror the rewrite pattern for the new SSE endpoint.

---

## Exit criterion (re-stated)

A user in `web-planner`:

1. Clicks the agent trigger; panel opens; composer focused.
2. Types "what's overdue on Plan X?" and submits.
3. `turn.started` fires; `answer.token` events stream a narrative answer citing at least one planner tool call.
4. `turn.ended { reason: 'completed' }` closes the stream.
5. Langfuse trace captured with `tenant_id`, `trace_id`, content hashes, `model_id`, `cached_tokens`.
6. Kernel audit events: one `agent.tool_called` per tool call; `agent.prompt_stored` / `agent.narrative_stored` on first use.
7. Cross-tenant seed test: same query in tenant B does not observe tenant A's plan (RLS verified).
8. Abort mid-stream closes the stream; no further tool audit rows written past abort.
