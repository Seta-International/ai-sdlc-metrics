# 04 — Tool definition + MCP server exposure

## What Mastra does

**Tool shape.** `createTool({ id, description, inputSchema, outputSchema, suspendSchema, resumeSchema, execute, requireApproval, mcp, ... })` returns a `Tool` instance. Schemas are Zod (coerced to a Standard-Schema wrapper via `toStandardSchema`). `execute(inputData, context)` — `context` is a discriminated `ToolExecutionContext` with `mastra?`, `requestContext?`, `abortSignal?`, `workspace?`, `writer?`, plus three mutually-exclusive nested shapes: `agent` (`toolCallId`, `messages`, `suspend`, `resumeData`), `workflow` (`runId`, `state`, `setState`, `suspend`), or `mcp` (`extra`, `elicitation.sendRequest`). See `/Users/canh/Projects/Seta/mastra/packages/core/src/tools/tool.ts:70-561` and `/Users/canh/Projects/Seta/mastra/packages/core/src/tools/types.ts:385-426`.

**Built-in HITL.** `requireApproval: boolean | ((input, ctx) => boolean)` pauses the stream; resume with `agent.approveToolCall({ runId })` / `declineToolCall({ runId })` (`/Users/canh/Projects/Seta/mastra/packages/core/src/tools/hitl.md:9-47`). Separately, `suspend(payload)` + `resumeSchema` lets execution pause mid-flight and resume with typed `resumeData` (`hitl.md:49-89`). The wrapper in `tool.ts:278-432` validates input → reorganizes context → invokes user `execute` → validates `suspendData` (if any) → validates output. Validation errors are *returned*, not thrown, so the LLM can self-correct.

**Registry.** Tools are a flat `Record<string, Tool>` on the `Mastra` instance (`mastra.addTool(tool, key)`, see `/Users/canh/Projects/Seta/mastra/packages/core/src/mcp/index.ts:121-138`). No DI container; agents reference tools by id.

**MCP exposure.** `MCPServerBase.convertTools` transforms `ToolAction` → `InternalCoreTool` (`CoreToolBuilder`, AI-SDK shape with `parameters` instead of `inputSchema`). Server registers `ListToolsRequestSchema` and `CallToolRequestSchema` handlers (`/Users/canh/Projects/Seta/mastra/packages/mcp/src/server/server.ts:600-806`). List emits `{ name: tool.id, description, inputSchema: convertSchema(parameters), outputSchema?, annotations?, _meta? }` — Zod → JSON Schema via `schema.jsonSchema` (`server.ts:2055-2059`). Call: JSON-Schema validate args → enforce FGA (`enforceToolExecutionFGA`) → run with `MastraToolInvocationOptions` carrying `mcp.elicitation` + `mcp.extra` → validate `outputSchema` against `structuredContent` → wrap as `{ content: [{type:'text', text}], structuredContent?, isError }`. Annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) pass through from `tool.mcp.annotations` (`types.ts:205-260`). Agents and workflows can be auto-converted to MCP tools (`server.ts:1251-1282`). Not 1:1 — Mastra rewrites schema, wraps the result, and injects `mcp.elicitation`.

**`mcp-docs-server` simplification.** Tools there are plain objects `{ name, description, parameters: ZodSchema, execute }` — not `createTool` (`/Users/canh/Projects/Seta/mastra/packages/mcp-docs-server/src/tools/docs.ts:205-221`). Shows the minimal MCP-only shape.

## What setup.md plans

§11 (`docs/setup.md:938-946`):

> `agent/` — `@seta/agent` ← P1 — the Seta Agent product … `tools/` — Planner tools (use `@seta/connector-ms365-planner`) … `planner/` … `read/` — `list_my_tasks, list_plan_tasks, get_task, list_plans, list_buckets, workload_analysis` … `write/` — `create_tasks.preview/.commit, update_tasks.preview/.commit, … (preview→commit pairs)` … `schema.ts` — Drizzle: `agent.write_continuations` (HMAC-signed preview→commit tokens)

§3 (`setup.md:117`):

> `agent` | `@seta/agent` (product) | `write_continuations` — HMAC-signed preview→commit tokens; future: conversations, runs, working memory

§7 (`setup.md:569`):

> agent-product preview/commit tools snapshot the ETag at preview time so concurrency conflicts surface as friendly retry messages, not silent overwrites

## Delta

**Fold in:**
- The `ToolAction` field set as the @seta/agent-core tool contract: `id`, `description`, `inputSchema`, `outputSchema` (mandatory for write tools — Mastra's JSON-Schema validation on output keeps LLM hallucination caught), `execute(input, ctx)`, optional `annotations` for MCP hint propagation.
- A `ToolExecutionContext` discriminated by surface (`teams` / `direct` / future `mcp`), parallel to Mastra's nested `agent`/`workflow`/`mcp` keys. Carry `requestContext` (RequestContext-equivalent) + `abortSignal` always.
- Validation errors as *return values*, not throws — keeps the streaming kernel from crashing on a single bad call.
- MCP `annotations` mapping: read tools get `readOnlyHint: true`; `.preview` tools get `readOnlyHint: true` + `idempotentHint: true`; `.commit` tools get `destructiveHint: true`.

**Avoid:**
- Mastra's `requireApproval`-driven stream-close + `approveToolCall(runId)` HITL primitive. Seta has a sharper invariant: writes go through `preview → HMAC-signed continuation → commit`, which is *stateless across requests* (HMAC over server secret) — Mastra's mechanism keeps the run alive in memory keyed by `runId`. Setup.md's pattern is the right one for multi-tenant horizontally-scaled deployments; do not regress to in-process HITL.
- Auto-converting agents/workflows into MCP tools (`server.ts:1251-1282`) — too clever; explicit registration in `apps/api/src/main.ts` per CLAUDE.md "one registry" rule.
- Schema-via-Standard-Schema wrapping at the tool layer. Seta is Zod-everywhere; convert to JSON Schema only at the MCP `ListTools` boundary.

**Open questions:**
- Where does ETag snapshotting live — inside the connector's `preview()` return, or in a separate `write_continuations` row keyed by ULID? (Setup.md implies row; connector ETag is just payload.)
- Does `agent-core` get a `Tool` type at all in P1, or does the @seta/agent product define its own and the kernel just accepts opaque callables? (Mastra's coupling between `Tool` and `Mastra` is heavy — `tool.ts:115` `mastra?: Mastra` — seta should resist.)
- Mastra's `mcp.elicitation.sendRequest` is interesting for multi-turn input gathering (Teams adaptive card prompts) — but it's MCP-protocol-coupled. Defer.

## Punch list

- setup.md §11: add a one-line note that each tool exports `{ id, description, inputSchema, outputSchema, execute, annotations? }` and that `outputSchema` is **required for write tools** (commit pairs) — mirrors Mastra `server.ts:739-761` structured-content validation.
- setup.md §3: spell out the `write_continuations` row shape (`continuation_id ULID, tenant_id, tool_id, input_hash, etag_snapshot jsonb, hmac, expires_at, consumed_at`) and the HMAC algorithm pin (HMAC-SHA-256 over canonicalized payload + server secret from `@seta/auth` KMS).
- setup.md §11: under `tools/planner/write/`, document that `.preview` returns `{ continuation_id, summary, etag_snapshot }` and `.commit` accepts `{ continuation_id }` only (no re-supplying the payload) — prevents argument-tampering between turns.
- @seta/agent-core: leave a hook in the tool-execution context for `requestContext: RequestContext` (tenant id, auth subject, traceparent) — Mastra `types.ts:392` shows this carries across agent/workflow/mcp surfaces. Tenant id stays read from `tenantContext.getTenantId()` per CLAUDE.md, not a tool param.
- @seta/agent-core: leave a hook for `abortSignal` on every `execute` call so streaming `onAbort` cancels in-flight Graph requests (Mastra wires this through `ToolExecutionContext.abortSignal`).
- @seta/agent-core: validation errors must be *returned* values typed as `{ error: ... }` (`tool.ts:282-295`), not thrown — kernel inspects the shape and feeds back to the LLM.
- @seta/agent-core: define a tool-output transform seam (`toModelOutput?: (out) => unknown`, see `tool.ts:163`) so adaptive-card-shaped payloads can be re-rendered as plain text for the model without duplicating tools.
- P2-defer: MCP server exposure of seta tools. Reason: P1 surface is Teams + REST only (`setup.md:1012`); MCP would force JSON-Schema generation, annotation curation, and auth-bridge work without a P1 consumer. Revisit with Studio.
- P2-defer: in-process HITL `approveToolCall(runId)`. Reason: preview/commit + HMAC continuations cover the same need statelessly; in-memory runId tracking conflicts with multi-instance request path (`setup.md` "Stateless request path").
- P2-defer: agent-as-tool and workflow-as-tool auto-conversion. Reason: violates "one registry in `main.ts`" rule; cross-product tool sharing should go through `platform/*` or an explicit connector.
