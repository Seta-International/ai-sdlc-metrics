# SCOPE — platform/ms-graph  (@seta/ms-graph)

## Purpose

Thin typed HTTP wrapper around Microsoft Graph for every connector that talks to MS365. Owns transport-level concerns (429 backoff, 5xx retry, ETag passthrough on `If-Match`, `$batch` packing ≤20 ops, audit-middleware hook, OTel spans). Exists because `@microsoft/microsoft-graph-client` is unmaintained (last published 2022) and the Kiota-generated `@microsoft/msgraph-sdk` was still pre-GA in 2026; see setup.md §4 row "Microsoft Graph (HTTP)" (`docs/setup.md:186`). Vendor-neutral primitive: every Graph-backed connector (`connector-ms365-planner`, `connector-ms365-directory`, future Outlook / OneDrive) imports this and the `@seta/oauth` token vault — no connector talks `fetch` directly.

## Responsibilities

- **Owns:**
  - The Graph HTTP client surface (`GET`, `POST`, `PATCH`, `DELETE`, `paginate`, `batch`).
  - 429 (`Retry-After`) and 5xx exponential-backoff retry policy.
  - `@odata.etag` parsing on GET responses and `If-Match` header injection on mutating verbs (setup.md §7 ETag block, `docs/setup.md:565-589`).
  - `$batch` request packing (≤20 sub-requests per Graph's documented limit) and per-sub-request status fan-out.
  - OTel span emission for every Graph call (one span per outbound HTTP, `$batch` produces parent span + child per sub-request).
  - The hook seam where `@seta/audit.recordAudit` is invoked for each Graph call (setup.md §4 row & §11 layout `docs/setup.md:969`).
  - Strongly typed return shapes via `@microsoft/microsoft-graph-types` (types-only dependency — the runtime SDK is dead, the types package is fine; setup.md `docs/setup.md:187`).
- **Does NOT own:**
  - Token acquisition or refresh — those live in `@seta/oauth` (MSAL Node + `oauth.oauth_tokens` vault, setup.md §4 `docs/setup.md:193-244`). The Graph client receives an already-acquired bearer token (or a token-fetcher callback) per call.
  - Connector-specific endpoint shapes (e.g. `/planner/tasks/...`). Those are typed helpers inside each connector (`modules/connectors/<vendor>/src/client.ts`).
  - Cache tables. Per-surface caches (`planner_tasks_cache`, `directory_users`, …) belong to the consuming connector's schema (setup.md §3 schema table, `docs/setup.md:114-119`).
  - Consent enforcement. The connector calls `connectorRegistry.requireConsent()` before invoking Graph (CLAUDE.md "Connector consent" rule).
  - ID-token validation / OBO. Inbound JWT is `jose` in `modules/channels/teams`; outbound OBO is `@seta/oauth` (setup.md §4 / §7).

## Current state (Epic 1)

Package skeleton exists but is **empty of implementation**:

- `platform/ms-graph/src/index.ts` — exports `{}` (placeholder).
- `platform/ms-graph/src/index.test.ts` — single placeholder assertion.
- `package.json` pins `@microsoft/microsoft-graph-types@2.43.1`, `@seta/oauth` (workspace), `zod@4.4.3`.

No schema (this package owns none — it's pure runtime). No connectors import it yet in Epic 1 since neither MS365 connector has shipped. The contract below pins the surface the connector packages will consume.

## Public interface

> All names provisional; pin them when the first consumer (`@seta/connector-ms365-directory`) lands.

- `type GraphRequestInit` — per-call options: `headers?`, `query?` (URLSearchParams-compatible), `body?` (JSON-serializable), `signal?: AbortSignal`, `ifMatch?: string` (sugar that sets `If-Match`).
- `type GraphResponse<T>` — `{ data: T; etag?: string; headers: Headers; status: number }`. ETag pre-extracted from `@odata.etag` on `data` plus the `ETag` response header for callers that need it raw.
- `type GraphBatchSubRequest` — `{ id: string; method: 'GET'|'POST'|'PATCH'|'DELETE'; url: string; headers?: Record<string,string>; body?: unknown }`.
- `type GraphBatchResult` — `{ id: string; status: number; headers?: Record<string,string>; body?: unknown }[]` keyed by sub-request id.
- `type GraphAuditHook` — `(event: { tenantId: string; method: string; path: string; status: number; durationMs: number; operation?: string; connectorId?: string }) => void | Promise<void>`. Composition wires this to `@seta/audit.recordAudit`.
- `type GraphTokenFetcher` — `(opts: { tenantId: string; scopes: string[] }) => Promise<string>`. Caller injects; the wrapper does not import `@seta/oauth` runtime, only its types.
- `interface GraphClient`:
  - `GET<T>(path, init?): Promise<GraphResponse<T>>`
  - `POST<T>(path, init?): Promise<GraphResponse<T>>`
  - `PATCH<T>(path, init?): Promise<GraphResponse<T>>` — throws if `ifMatch` is missing on resources Graph requires it for (Planner tasks/plans/buckets per setup.md §7).
  - `DELETE(path, init?): Promise<GraphResponse<void>>`
  - `paginate<T>(path, init?): AsyncIterable<T>` — follows `@odata.nextLink` (setup.md §7 pagination note, `docs/setup.md:593`).
  - `batch(subs: GraphBatchSubRequest[]): Promise<GraphBatchResult>` — chunks into ≤20-op pages; merges results.
- `function createGraphClient(opts: { tokenFetcher: GraphTokenFetcher; audit?: GraphAuditHook; connectorId?: string; baseUrl?: string; fetch?: typeof fetch }): GraphClient`.
- `class GraphHttpError extends DomainError` — wraps non-2xx responses with `status`, `code` (Graph's `error.code`), `requestId` (`request-id` header).
- `class GraphThrottledError extends GraphHttpError` — 429 after retry budget exhausted; carries `retryAfterSec`.
- `class GraphPreconditionFailedError extends GraphHttpError` — 412 from `If-Match` conflict (Planner concurrency case in setup.md §7).

## Imports

- **Allowed internal:** `@seta/oauth` (types only — pulls `GraphTokenFetcher` shape; runtime token acquisition stays out so this package is connector-neutral), `@seta/audit` (types only — `AuditEntry` for the hook contract), `@seta/middleware` (errors — extend `DomainError` for RFC 7807 mapping per CLAUDE.md "Errors" rule).
- **Forbidden:**
  - `@seta/connector-*` and `@seta/db` — wrong direction; this is a platform primitive (CLAUDE.md "platform/* depends on nothing in modules/").
  - `modules/products/*` and `modules/channels/*` — same boundary rule.
  - `@microsoft/microsoft-graph-client`, `@microsoft/msgraph-sdk` — explicitly rejected runtime SDKs (setup.md §4 row `docs/setup.md:186`).
- **External (pinned per setup.md §13, `docs/setup.md:1781-1795`):**
  - `@microsoft/microsoft-graph-types@2.43.1` (types-only)
  - `zod@4.4.3` (response-shape validation at trust boundaries)
  - `@seta/oauth@workspace:*`, `@seta/audit@workspace:*` (workspace types — see Allowed above)

## Patterns to follow

- **Read-then-update with ETag for every mutating Planner verb.** Fetch via `GET`, snapshot `@odata.etag`, then `PATCH` with `If-Match` + `Prefer: return=representation` (setup.md §7, `docs/setup.md:565-589`). Surface 412 as `GraphPreconditionFailedError` so the agent-product's preview/commit pair (`modules/products/agent`) can produce a friendly retry message instead of silently overwriting.
- **`$batch` packing ≤20 sub-requests.** Setup.md §4 row pins the limit (`docs/setup.md:186`); chunk larger inputs and merge results client-side.
- **429 `Retry-After` honoring.** Read the header; fall back to exponential backoff with jitter on 5xx. Setup.md §4 row again.
- **OTel spans + audit hook on every call.** Setup.md §11 layout (`docs/setup.md:969`) explicitly calls out "429 backoff, ETag, `$batch`, audit middleware" as `@seta/ms-graph`'s job. One span per HTTP, attributes include `graph.path`, `graph.method`, `graph.status`, `graph.request_id`. Audit row mirrors via the `GraphAuditHook` seam.
- **Tenant id read from `tenantContext.getTenantId()` inside the token fetcher, never threaded through method signatures.** CLAUDE.md "Tenant id is never a function parameter." The wrapper itself stays tenant-agnostic; the injected `tokenFetcher` reads `tenantContext` if it needs to.
- **Idempotent at the external boundary.** CLAUDE.md "Idempotent external boundaries" — retries on 5xx/429 must be safe for all verbs as implemented; consumers requesting non-idempotent retry behavior (e.g. POST creating duplicates) must opt out per call.
- **Errors as `DomainError` subclasses.** CLAUDE.md "Errors" — every non-2xx becomes a `GraphHttpError`/subclass; the `@seta/middleware` RFC 7807 mapper turns them into clean HTTP responses.

## Patterns to avoid

- **Do not pull in `@microsoft/microsoft-graph-client` or `@microsoft/msgraph-sdk`.** Setup.md §4 row (`docs/setup.md:186`) explicitly rules them out — the entire reason this package exists is to replace them.
- **Do not cache token bundles in this package.** Token vault is `@seta/oauth` (setup.md §4 paragraph 2, `docs/setup.md:199`). The wrapper calls the injected `tokenFetcher` each request and trusts its caching policy.
- **Do not enforce consent here.** Connectors call `connectorRegistry.requireConsent` upstream (CLAUDE.md "Connector consent"); the Graph client must not reach into `@seta/connector-registry` runtime.
- **Do not parse `process.env` here.** Setup.md §3/§12 — env reads only at `apps/api/src/env.ts` (CLAUDE.md "schema-driven `env`"). `baseUrl` / retry budgets are injected via `createGraphClient` options.
- **No connector-specific helpers.** `/planner/tasks/...` typed methods belong to `@seta/connector-ms365-planner`, not here. Keeps this package usable for `connector-ms365-directory`, future Outlook/OneDrive connectors, etc. (setup.md §11 boundary rules, `docs/setup.md:1014-1020`).
- **Do not log token values or full bearer-Authorization headers.** Setup.md §8 pino redact list is the authoritative scrub set (`docs/setup.md:616-680`); the audit hook receives no token material.
- **No legacy / compat shims.** CLAUDE.md "No legacy, no backward compat."

## Test strategy

- **Unit (co-located, `src/**/*.test.ts`):**
  - 429 → `Retry-After` honored, then success.
  - 5xx → exponential-backoff retry within budget.
  - `If-Match` preflight: PATCH without `ifMatch` throws on tagged-resource paths (Planner); 412 surfaces as `GraphPreconditionFailedError`.
  - `$batch` chunking (21 sub-requests → 2 batch HTTP calls, merged result).
  - Pagination yields all pages including the last one (no `nextLink`).
  - Audit hook called once per HTTP with correct `{method, path, status, durationMs}`.
- **Integration:** none in P1 — all flows run against `msw`-recorded fixtures (CLAUDE.md "External HTTP via `msw` recordings"). No live Graph calls in CI.
- **Mocking policy:** never mock `@seta/audit` or `@seta/oauth` (CLAUDE.md "never mock internal `@seta/*` modules"); inject test doubles via the constructor's `audit`/`tokenFetcher` seams instead.

## Open questions

- Does the audit hook fire inside the `$batch` parent span (one audit row per batch HTTP) or per sub-request (one row per logical operation)? Per-sub-request matches "every external API call" (setup.md §3 schema row for `audit`, `docs/setup.md:114`), but produces N rows for one HTTP — confirm with security review.
- Are response bodies validated by Zod on every call, or do we trust `@microsoft/microsoft-graph-types`? Zod at trust boundaries argues for validation on writes' echo responses; setup.md doesn't pin this. Default proposal: validate only the fields the connector reads, leave the rest as-is.
- Does `paginate` accept a per-page concurrency hint? Spike Phase 1 didn't address Graph pagination throughput; setup.md §7 only documents the `nextLink` shape. Default: sequential — concurrency lives at the connector's sync-worker layer.
- The `connectorId` constructor argument: should it be per-client (one client per connector) or per-call (one shared client, tagged on each call)? Per-client is simpler; per-call lets `apps/api` share a singleton. Pin when the first consumer lands.
