# SCOPE — platform/agent/sdk  (@seta/agent-sdk)

## Purpose
The public, consumer-facing TypeScript client for the seta-os agent runtime over HTTP.
Owns the shape of an outbound HTTP/SSE call to an agent endpoint exposed by `apps/api` (or
any host that mounts `modules/products/agent`): builds the request, opens the SSE stream,
parses kernel chunks back into a typed `KernelChunk` async-iterable, and forwards
`AbortSignal` into a server-side abort. Re-exports the **types** of the kernel's wire
contract (chunk union, `Run`, `RunStatus`, error shape) from `@seta/agent-core` so external
SDK consumers get one import surface. It is **not** the kernel itself — there is no model
adapter, no tool loop, no testkit here.

## Responsibilities
- **Owns:**
  - The HTTP client surface: a small `AgentClient` (or equivalent factory) that posts a run
    request and returns an `AsyncIterable<KernelChunk>` parsed from an SSE response. Uses
    global `fetch` only (same MSW-interceptable rule as the kernel —
    `06-llm-recording-replay.md:69`).
  - The SSE *consumer* (the inverse of `@seta/agent-core`'s `streamKernelSSE` producer):
    line-by-line `text/event-stream` framing, `event:`/`data:`/`id:` field reassembly,
    JSON-decode of each `data:` payload into `KernelChunk`.
  - Forwarding `AbortSignal` from caller → `fetch` → server. When the caller aborts, the
    underlying HTTP connection closes and the kernel's `streamKernelSSE` `onAbort`
    triggers (setup.md §5 lines 397–426; `03-run-loop.md:64`).
  - Re-exporting (type-only) the kernel's wire contract: `KernelChunk`, `Run`, `RunStatus`,
    `ToolAnnotations`, the `KernelError` JSON shape (RFC 7807 problem document body) so
    SDK consumers don't depend on the kernel runtime to read response types
    (`02-agent-core.md:46, 49, 53`; `05-workflows.md:36`).
  - Public Zod schemas for the **request** shape (e.g. `RunRequest`) and the chunk
    discriminated union — Zod 4 (`zod@4.4.3`, setup.md §13 line 1741). Schemas are the
    source of truth; TS types are `z.infer<>` (CLAUDE.md "Schema-driven").
- **Does NOT own:**
  - The agent kernel — `@seta/agent-core` (run loop, model adapters, tools, processors,
    memory). `@seta/agent-sdk` is the *client*; the kernel is the *server*.
  - Authentication / token acquisition — callers pass an `Authorization` header (or
    similar) in the request init. The SDK is auth-mechanism-agnostic and never imports
    `@seta/auth` or `@seta/oauth`.
  - Tenant context — there is no ALS on the client side; the tenant id is conveyed via
    the request (header or implied by the auth token). Client code does not import
    `@seta/tenancy`.
  - HTTP transport polyfills — node-fetch shims, undici tuning, retry policy. P1 targets
    Node 22+ where `fetch` is built-in (setup.md §1).
  - Streaming **production** — the producer side is `@seta/agent-core`'s
    `streamKernelSSE` (setup.md §5 line 426). This SDK only **consumes** SSE.
  - LLM SDKs — no `openai`, no `@anthropic-ai/sdk`. The SDK talks to a seta-os agent
    endpoint, not to a model provider directly.

## Current state (Epic 1)
**Stub-only.** Epic 1 focused on MS365 auth; nothing in the SDK was implemented. Current
files:
- `src/index.ts` — `export {}` placeholder.
- `src/index.test.ts` — placeholder test.
- `package.json` — pinned to `zod@4.4.3` per setup.md §13 line 1741; **no** dependency on
  `@seta/agent-core` yet.

When the SDK lands, it must add a *type-only* workspace dependency on `@seta/agent-core`
via `pnpm --filter @seta/agent-sdk add @seta/agent-core@workspace:*` (CLAUDE.md CLI-only).
Runtime imports of `@seta/agent-core` are forbidden (see "Imports" below).

## Public interface

- `interface AgentClientOptions` — `{ baseUrl: string; fetch?: typeof fetch; headers?:
  HeadersInit; defaultSignal?: AbortSignal }`. `fetch` injection point exists so callers
  can swap in MSW or a corporate-proxy transport for tests (`06-llm-recording-replay.md:67`
  pattern, applied symmetrically on the consumer side).
- `class AgentClient` — constructor `(opts: AgentClientOptions)`; method `run(input:
  RunRequest, opts?: { signal?: AbortSignal; headers?: HeadersInit }):
  AsyncIterable<KernelChunk>`. Internally posts to `${baseUrl}/runs` (or the agreed path
  decided when the agent product lands), parses `text/event-stream`, yields `KernelChunk`
  values, and propagates `signal` into the underlying `fetch`.
- `parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<SseEvent>` — pure
  parser, exported for callers that already have a `Response.body` and want chunks without
  the `AgentClient` ceremony. Mirrors the framing emitted by `streamKernelSSE` (setup.md
  §5 lines 397–426).
- `decodeKernelChunk(event: SseEvent): KernelChunk` — converts one SSE event into the
  typed chunk; throws `AgentSdkParseError` on malformed payloads.
- `type SseEvent` — `{ event?: string; data: string; id?: string }`.
- `class AgentSdkError extends Error` — base for client errors. Subclasses:
  - `AgentSdkParseError` — malformed SSE event or unknown chunk type.
  - `AgentSdkHttpError` — non-2xx response; carries `{ status, problem }` where `problem`
    is the parsed RFC 7807 body produced by `@seta/middleware`'s `onError` (setup.md §15
    lines 1406–1490).
- `RunRequest` — Zod 4 schema for the request body (`messages`, optional `tools` reference
  by id, optional `model`, optional run-loop opts the server accepts). Inferred TS type
  via `z.infer<typeof RunRequest>` per CLAUDE.md "Schema-driven".
- **Re-exports (type-only) from `@seta/agent-core`:** `KernelChunk`, `Run`, `RunStatus`,
  `ToolAnnotations`, the `KernelError` JSON shape — so SDK consumers have one import
  point (`02-agent-core.md:46-53`; `05-workflows.md:36`).

## Imports

- **Allowed internal:**
  - `@seta/agent-core` — **type-only** import (`import type { KernelChunk, Run, RunStatus
    } from '@seta/agent-core'`). The SDK re-exports those types so external consumers
    don't pull the kernel runtime. Enforced by Biome's `import type` rule per CLAUDE.md
    "Conventions".
- **Forbidden:**
  - `@seta/agent-core` runtime imports — would pull `openai` + `@anthropic-ai/sdk` +
    `js-tiktoken` + `msw` into every consumer of the SDK. The SDK must remain a
    dependency-light, browser-friendly-ish (P2 Studio) client. Type-only is the seam.
  - `@seta/db`, `@seta/auth`, `@seta/oauth`, `@seta/tenancy`, `@seta/ms-graph`, `@seta/
    middleware` — none of these belong on the consumer side. The client just speaks HTTP.
  - Any `modules/*` package — CLAUDE.md `platform/*` boundary rule.
  - `openai` / `@anthropic-ai/sdk` — not a client concern; never installed here.
- **External (pinned per setup.md §13):**
  - `zod@4.4.3` (setup.md §13 line 1741) — request schema + `z.infer<>` types.
  - **No HTTP library.** Use global `fetch` (Node 22+; setup.md §1). Mirrors the kernel's
    "global fetch only" rule (`06-llm-recording-replay.md:69`) so the same MSW-based
    testkit can intercept SDK calls if a downstream test reuses
    `@seta/agent-core/testkit`'s server.

## Patterns to follow

- **`import type` for `@seta/agent-core`** — CLAUDE.md "Conventions". Biome enforces.
  Type-only re-exports keep the SDK runtime weight at "zod + your fetch".
- **Global `fetch` only** — same rule as the kernel (`06-llm-recording-replay.md:69`). Lets
  MSW intercept the SDK's HTTP exactly the same way it intercepts the kernel's outbound
  LLM calls.
- **Mirror the SSE producer contract** — `streamKernelSSE` emits `event: chunk` / `event:
  ping` / `event: error` framing (setup.md §5 lines 397–426); the consumer parser must
  recognize all three and only forward `chunk`-framed payloads as `KernelChunk`.
- **Propagate `AbortSignal` end-to-end** — caller `signal` → `fetch({ signal })` → server
  `stream.onAbort()` (setup.md §5 line 368; `03-run-loop.md:64`). Aborting on the client
  must release server-side LLM tokens.
- **Schema-driven request types** — CLAUDE.md "Schema-driven". `RunRequest` is a Zod
  schema; the TS type is `z.infer<typeof RunRequest>`. Never maintain a parallel
  `interface`.
- **Errors map to `AgentSdkError`** — non-2xx responses parse the RFC 7807 problem+json
  body emitted by `@seta/middleware` (setup.md §15 lines 1440–1480) into
  `AgentSdkHttpError.problem`, preserving the kernel's `code`/`domain`/`category` fields
  (`02-agent-core.md:49, 53`).
- **ESM only** — `"type": "module"` (package.json already correct). No CJS export
  (CLAUDE.md "Conventions").
- **Pre-1.0, no back-compat shims** — CLAUDE.md "Working rules". Wire-shape changes on the
  kernel side change the SDK in the same PR; no aliases.

## Patterns to avoid

- **No runtime dependency on `@seta/agent-core`** — would balloon SDK size and pull
  `openai`+`@anthropic-ai/sdk`+`js-tiktoken` into downstream consumers. Type-only is the
  contract (this SCOPE.md "Imports").
- **No `EventSource` polyfill** — `EventSource` does not support POST bodies and does not
  accept an `AbortSignal` cleanly. The SDK uses `fetch` + manual SSE parsing instead
  (mirrors setup.md §5's `streamSSE` producer pattern).
- **No retry / reconnect logic in P1** — chunk-replay cache + `resumeStream()` are
  P2-deferred on the kernel side (`03-run-loop.md:72`); the SDK matches that. Add later
  alongside the kernel work, not unilaterally.
- **No tenant id in the request body or client config** — multi-tenancy is enforced by the
  caller's `Authorization` header (interpreted server-side via `@seta/auth` →
  `tenantContext.run(...)`). Putting tenant id in the SDK is exactly the footgun
  setup.md §3 lines 2063 closes.
- **No LLM SDK imports** — `@seta/agent-sdk` talks to a seta-os agent endpoint, not to
  Anthropic / OpenAI directly. Mixing those layers re-creates the route-imports-vendor-SDK
  anti-pattern setup.md §5 line 338 explicitly closes.
- **No bundling decisions that fork from the kernel** — same `tsup` config shape as
  `@seta/agent-core` so consumers see consistent ESM emit (setup.md §13:1742; `01-monorepo-build-test.md`
  punch list on tsup defaults).
- **No DI / framework hooks** — CLAUDE.md "Boundaries". The SDK is a plain function +
  class surface; callers wire it into their own framework (Hono/Express/Next/etc.).

## Test strategy

- **Unit tests** co-located at `src/**/*.test.ts` (CLAUDE.md "Conventions"). They cover:
  SSE framing parser (multi-byte UTF-8 across chunks, empty lines, comment lines,
  `event:`/`data:`/`id:` reassembly), `decodeKernelChunk` discriminant handling,
  `AgentSdkHttpError` parsing of RFC 7807 bodies, abort propagation (caller signal →
  `fetch`'s `signal`), Zod-schema round-trips for `RunRequest`.
- **Transport tests** use the same MSW pattern the kernel uses
  (`06-llm-recording-replay.md`). Set up `setupServer(...)` against the *agent endpoint
  URL* the SDK posts to, return a recorded SSE stream as `text/event-stream` with
  `chunks[] + chunkTimings[]` shape, assert the SDK yields the expected typed chunks.
  This re-uses the recording format defined by `@seta/agent-core/testkit` so contract
  drift is caught in both directions.
- **No live calls in CI** — same rule as the kernel (setup.md §5 line 2198; CLAUDE.md
  "Footguns" "LLM in tests"), extended here to "no live calls to any seta-os agent
  endpoint in CI either."
- **No mocking of `@seta/agent-core`** — CLAUDE.md "Mocks: never mock internal `@seta/*`
  modules". Since the SDK only type-imports the kernel, this is automatic; just don't
  add a runtime import.
- **No integration tests against a running `apps/api`** here — those belong in
  `tests/e2e/**` (CLAUDE.md "Conventions"). The SDK's contract is HTTP-shape, validated
  with MSW recordings.

## Open questions

- **Endpoint path.** `${baseUrl}/runs` is a placeholder; the actual path is decided when
  `modules/products/agent` registers its route in `apps/api/src/main.ts` (CLAUDE.md
  "Boundaries", setup.md §11 line 1022). The SDK takes the path as constructor-supplied
  or convention — decide before first public release.
- **Auth header convention.** `Authorization: Bearer <token>` is the obvious default, but
  `@seta/auth`'s public surface (API keys vs SSO bearer) lands separately — confirm the
  header name(s) before locking the SDK.
- **Browser-safe shim.** Studio (P2) will consume this SDK from the browser. Node 22
  `fetch` works in both, but `ReadableStream` byte-iteration and `TextDecoderStream`
  details differ — verify when Studio lands (`07-request-context.md:46` calls out the
  general browser-shim issue for `@seta/tenancy`; same class of decision here).
- **`Run` lifecycle endpoints.** Beyond `run()`, do we expose `getRun(id)` / `cancelRun(id)`
  / `listRuns()` in P1? The `Run`/`RunStatus` types are reserved in the kernel
  (`05-workflows.md:36`) but a P1 lifecycle endpoint set is not yet specced.
- **SSE event taxonomy.** `streamKernelSSE` emits `chunk` / `ping` / `error` per setup.md
  §5 lines 397–426; the SDK currently treats only `chunk` as data. Confirm whether `error`
  events should surface as `AgentSdkHttpError` mid-stream or as a final `KernelChunk` of
  `type: 'error'` (consistent with the kernel's chunk union — `02-agent-core.md:46`).
- **Multi-fetch / `fetch` override.** Should `AgentClientOptions.fetch` accept the full
  `fetch` signature or a narrower request/response shape? Narrower is easier to mock but
  forces a wrapper in real use. Decide at first implementation pass.
