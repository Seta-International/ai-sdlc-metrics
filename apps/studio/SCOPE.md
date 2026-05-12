# SCOPE — apps/studio  (@seta/studio — P2)

> **Status:** **P2 — directory placeholder only.** No `package.json`, no `src/`, no Vite config, no migrations land in this PR. This SCOPE.md is the P2 contract and the on-disk placeholder, mirroring how `platform/agent/memory/SCOPE.md` and `platform/agent/workflows/SCOPE.md` were authored ahead of their implementation PRs. The package is created in the P2-kickoff PR via `pnpm new:package` — see CLAUDE.md "CLI-only — packages and dependencies".
>
> No P1 override applies here. The P1 override (`docs/explorations/2026-05-12-mastra-spike/README.md` §"P1 scope override (2026-05-12)") pulled `@seta/agent-memory`, `@seta/agent-workflows`, the four RAG packages, and the FAQ + PMO Agents forward to P1 — but **inbound web SSO (Entra + Google) is still P2** per setup.md §4 row 190 + §11 line 1012, and Studio is the consumer that ships alongside it. Studio stays P2.

## 1. Purpose

Studio is the web admin/management UI for Seta-managed tenants. It is the surface where tenant admins (and Seta staff with multi-tenant access) configure connector consent, browse agent runs, manage the FAQ knowledge corpus, and inspect the audit log. It is **not** the end-user agent chat surface — that is Teams (1:1 + group/channel) per `modules/channels/teams/` and `modules/products/agent/`'s `teams-handler.ts` (setup.md §11 lines 909–951). Studio is where the *configuration* and *observability* live; Teams is where the *interaction* happens. Setup.md §11 line 905 pins the slot ("(P2) Vite + React web app — uses @seta/ui + @seta/agent-sdk").

## 2. Responsibilities

**Owns:**

- The four functional areas that make up the P2 admin surface:
  - **Tenant + connector admin** (the largest surface). List the tenants the current Seta staff (or tenant admin) session has access to; per tenant, list configured connectors with status (`consented` / `pending` / `failed` / `token-expired`); trigger the MS365 admin-consent flow by redirecting to `apps/api`'s `/oauth/:provider/consent-url` (owner: `@seta/oauth` per `platform/oauth/SCOPE.md` § Public interface — `createOAuthRoutes`); receive the consent-callback via `/oauth/:provider/callback` (same owner); render post-consent status. P2 supports the two P1 MS365 connectors (`@seta/connector-ms365-planner`, `@seta/connector-ms365-directory` per setup.md §11 lines 922–936); designed to accept future Trello / Google Workspace / Jira via the registry's `ConnectorDefinition` shape (`platform/connector-registry/SCOPE.md` § Public interface).
  - **Agent run / thread viewer** (read-only). List runs scoped by tenant; drill into a single run; show timeline of tool calls, model adapter calls, token usage, latency, errors; stream live for in-flight runs via SSE. Consumes `@seta/agent-sdk`'s `parseSseStream` / `decodeKernelChunk` per `platform/agent/sdk/SCOPE.md` § Public interface.
  - **RAG corpus management**. List indexed sources (chunk-count per `source_id` in `agent_vector.chunks` per `platform/agent/rag/SCOPE.md` § Public interface and the underlying `@seta/agent-vector` schema); upload new documents (PDF / MD / txt) for the Seta FAQ Agent's corpus; trigger re-index from a source-of-truth API endpoint; see ingest progress. This closes the FAQ Agent corpus-source open question carried in `modules/products/agent/SCOPE.md` (RAG data-survey track in the P1 override) — Studio is where the operator drives ingestion.
  - **Audit log viewer + tenant-scoped search**. Filter by tenant / user / tool / time-range / event type; drill into a single audit row; export filtered set as CSV; never edit (read-only view). Consumes `audit.audit_log` via `apps/api` per `platform/audit/SCOPE.md` § Responsibilities ("Querying / retention / export. P1 ships write-only; reads happen via admin tooling that lives outside this package" — Studio is that admin tooling).
- The web app's own composition: routing, layout, navigation, auth handshake, error boundaries, toast/notification surface.
- The Vite build configuration, the SPA bundle, the static-asset deploy artifact.
- Studio's local-dev story: `pnpm --filter @seta/studio dev` launches Vite at `localhost:5173`; the Vite dev server proxies `/api/*` to `apps/api` at `localhost:8080` (per `apps/api/SCOPE.md` § Current state — `PORT` default 8080).

**Does NOT own:**

- Business logic, schema, database access — all goes through `apps/api` HTTP routes. Studio reads/writes via the API only. This mirrors CLAUDE.md "Boundaries" `apps/*` rule ("composition only, no business logic"); for a frontend the rule translates to "no business logic — talk to `apps/api` over HTTP" — Studio holds zero rows of its own.
- The agent kernel — `@seta/agent-core` runs server-side in `apps/api` (`platform/agent/sdk/SCOPE.md` § Purpose: "@seta/agent-sdk is the client; the kernel is the server"). Studio is a client.
- The end-user agent chat surface — that is Teams. Studio does **not** include an agent chat UI in P2; a "playground" chat is P3+ (see § Patterns to avoid).
- Auth implementation — `@seta/sso` (the P2 package noted at setup.md §11 line 977 — "@seta/sso — inbound OIDC (Entra ID + Google) → sessions") owns the OIDC + PKCE flow over `jose@6.2.3` per setup.md §4 row 190. The actual OIDC handshake, session table, and signed-cookie minting live in `apps/api` + `@seta/sso`; Studio handles only the redirect-out-and-back UX.
- Workflow execution — Studio does **not** execute `@seta/agent-workflows`; that engine is server-side per `platform/agent/workflows/SCOPE.md` § Responsibilities ("the runner is in-process inside `apps/api`"). A future workflow-run viewer (read-only) is P3+.

## 3. Current state (P2)

- **Directory placeholder only.** This SCOPE.md is the only file under `apps/studio/`. No `package.json`, no `src/`, no `vite.config.ts`, no `index.html`, no tests in this PR.
- The next PR (P2 kickoff) creates the package per CLAUDE.md "CLI-only — packages and dependencies":
  1. `pnpm new:package` to scaffold the workspace entry.
  2. `pnpm --filter @seta/studio add <dep>@<version>` for each external pin (chosen at kickoff via `pnpm view <pkg> version` per CLAUDE.md "For 'add library X' without a known pin").
  3. `pnpm --filter @seta/studio add @seta/agent-sdk@workspace:* @seta/ui@workspace:*` for workspace deps (workspace protocol mandatory per CLAUDE.md).
- The Studio app does **not** appear in `apps/api/SCOPE.md` § Current state — `apps/api` is the only P1 deployable. Studio adds a second deployable shape (SPA bundle), not a second Hono process.

## 4. Tech stack (slot-level, not pinned)

Setup.md §1–§8 do not include frontend tech picks — those tables stop at the kernel + auth + observability stack. Setup.md §11 line 905 names Vite + React but does not pin versions. This section lists the slots; concrete pins come from a future `npm view` pass at P2 kickoff per CLAUDE.md "For 'add library X' without a known pin, run `pnpm view <pkg> version` and propose the pin first".

Recommended (not pinned):

- **Runtime**: browser (modern evergreen — Chrome / Edge / Safari / Firefox last-two). No IE, no legacy mobile.
- **Framework**: React 19+ (or the current stable when P2 kicks off).
- **Build tool**: Vite 7+ (matches setup.md §11 line 905 "Vite + React").
- **Router**: TanStack Router (typed route params; better than React Router for typed-route guarantees). Acceptable alternative: React Router v7.
- **Server-state cache**: TanStack Query (React Query) — pairs naturally with `@seta/agent-sdk`'s HTTP + SSE clients.
- **Forms**: TanStack Form **or** React Hook Form — both viable; pick at P2 kickoff.
- **Schema validation**: `zod@4.4.3` to match the rest of the workspace (the pin appears throughout setup.md §13, e.g. lines 1741, 1770, 1773, 1777). Studio's HTTP client validates `apps/api` response payloads against the SDK-exported Zod schemas per `platform/agent/sdk/SCOPE.md` § Imports ("zod@4.4.3 — request schema + z.infer<>").
- **Styling**: Tailwind CSS 4+ — utility-first, matches the lean approach in setup.md §10 (no NestJS-style heavy framework picks).
- **Component library**: `@seta/ui` (the P2 internal design system per setup.md §11 line 978 — "shared design system (studio + future webs)") built on Radix UI primitives + shadcn-style copy-paste components. Keep the surface small; do not pull a 500-component library.
- **Charts**: Recharts **or** Tremor — for run-timeline visualizations + audit-trend dashboards. Pick at P2 kickoff.
- **Test (component)**: Vitest + React Testing Library (Vitest 4.1.5 already the workspace standard per setup.md §13 line 1735).
- **Test (e2e)**: Playwright — setup.md §10 ("Explicit non-picks") deferred Playwright until Studio. Studio IS where Playwright lands.

Explicitly **not** picked: **no Next.js, no Remix, no Redux, no Material UI, no Chakra UI**. Reasoning: SPA-only (no SSR — Studio is internal admin UI with auth-gated routes); TanStack Query handles server-state without Redux; `@seta/ui` + Tailwind covers components. Setup.md §10 already encodes the "no second framework" rule (e.g. "NestJS — adds DI / decorators / second framework; one Hono everywhere"); Studio mirrors that on the frontend side ("one React + Vite everywhere").

## 5. Public interface

Studio is an app, not a library. Its "public interface" is the HTTP it consumes from `apps/api`, the env it reads at build/runtime, the deploy artifact, and the SPA URL surface.

### HTTP endpoints consumed from `apps/api`

Grouped by functional area. **Several of these endpoints do not yet exist in `apps/api` § Current state** (`apps/api/SCOPE.md` lists only `/healthz` + `/oauth/*` today). Building Studio requires landing these routes in `apps/api` first — cross-reference `apps/api/SCOPE.md` § Open questions ("`src/routes/` directory") for the route-surface plan.

- `GET  /tenants` — list tenants the current session can access. Owner: `apps/api` middleware reading `@seta/tenant` + `@seta/auth` (`platform/auth/SCOPE.md` for the session shape; tenant ALS per setup.md §3).
- `GET  /tenants/:id/connectors` — owner: `@seta/connector-registry` exposed via a new `apps/api/src/routes/connectors.ts`. Returns the `ConnectorDefinition[]` plus per-tenant consent status. Definition shape per `platform/connector-registry/SCOPE.md` § Public interface.
- `POST /oauth/:provider/consent-url` — returns the admin-consent redirect URL. Owner: `@seta/oauth` per `platform/oauth/SCOPE.md` § Current state (`src/routes.ts` — `createOAuthRoutes`).
- `GET  /oauth/:provider/callback` — owner: `@seta/oauth`, same route file. Already mounted by `apps/api/src/main.ts` per `apps/api/SCOPE.md` § Current state.
- `GET  /runs?tenantId=&since=&limit=` — list agent runs. Owner: kernel `Run` shape from `@seta/agent-core` per `platform/agent/sdk/SCOPE.md` § Public interface ("Re-exports (type-only): KernelChunk, Run, RunStatus"); a new route in `apps/api` or `modules/products/agent` exposes the list query.
- `GET  /runs/:id` — single run with full timeline (tool calls, token usage, errors).
- `GET  /runs/:id/stream` — live SSE for in-flight runs. Studio consumes via `parseSseStream` per `platform/agent/sdk/SCOPE.md` § Public interface.
- `GET  /audit?tenantId=&from=&to=&tool=&user=` — owner: `@seta/audit` per `platform/audit/SCOPE.md` § Open questions (a query surface is explicitly listed as "future" — Studio is that consumer).
- `GET  /rag/sources?tenantId=` — owner: `@seta/agent-rag` exposed via a new `apps/api/src/routes/rag.ts`. Source-count derives from `agent_vector.chunks` per `platform/agent/rag/SCOPE.md`.
- `POST /rag/sources` — multipart upload of a corpus document. Owner: `@seta/agent-rag` `ingest()` per `platform/agent/rag/SCOPE.md` § Public interface.
- `POST /rag/sources/:id/reindex` — owner: `@seta/agent-rag`.
- `GET  /me` — current session (user + tenant memberships). Owner: `@seta/sso` per setup.md §11 line 977.
- `POST /sso/login/:provider` — Entra | Google. Owner: `@seta/sso` per setup.md §4 row 190.
- `POST /sso/logout` — owner: `@seta/sso`.

### Environment contract

Vite uses `import.meta.env.VITE_*` for client-readable vars. Studio's required vars at build/runtime:

- `VITE_API_BASE_URL` — e.g. `https://api.os.seta-international.com`. The `@seta/agent-sdk` `AgentClientOptions.baseUrl` is sourced from this per `platform/agent/sdk/SCOPE.md` § Public interface.
- `VITE_PUBLIC_BUILD_SHA` — git SHA injected at build time, rendered in the support-footer.

Server-side vars (SSO client secrets, KMS keys, OAuth client secrets) belong to `apps/api/src/env.ts` per `apps/api/SCOPE.md` § Public interface — NOT to Studio. CLAUDE.md "Schema-driven — always generate" ("`process.env` → typed `env` via Zod once at boot") applies to `apps/api`; Studio does the equivalent for `import.meta.env` in a small Zod schema at app boot.

### Deploy artifact

Vite SPA bundle (`dist/` — static HTML + JS + CSS); served behind a CDN with SPA-fallback to `index.html`; `/api/*` proxied (in prod, separate ALB target group; in dev, Vite proxy) to `apps/api`. Setup.md §9 names the project landing as `os.seta-international.com`; Studio likely lives at `studio.os.seta-international.com` or `os.seta-international.com/studio` — see § Open questions.

### Routes (SPA path tree)

- `/login`
- `/login/:provider/callback`
- `/tenants`
- `/tenants/:id/setup`
- `/tenants/:id/connectors`
- `/tenants/:id/connectors/:connectorId/consent`
- `/tenants/:id/runs`
- `/tenants/:id/runs/:runId`
- `/tenants/:id/corpus`
- `/tenants/:id/corpus/:sourceId`
- `/tenants/:id/audit`
- `/me`

## 6. Imports

- **Allowed internal (P2):**
  - `@seta/agent-sdk` — typed HTTP + SSE client for the runtime API; depends on agent-core types only and is safe to import in a browser per `platform/agent/sdk/SCOPE.md` § Imports ("Studio (P2) will consume this SDK from the browser. Node 22 `fetch` works in both").
  - `@seta/ui` — shared design system / Radix-based components / Tailwind config (setup.md §11 line 978).
  - `@seta/connector-registry` — **type-only** import for `ConnectorDefinition` shape, scope union, so the admin UI can render consent buttons + scope explanations for each registered connector. `platform/connector-registry/SCOPE.md` § Public interface defines the type.
  - `@seta/sso` — **type-only** import for the session shape, login URLs, OIDC provider union (per setup.md §11 line 977 and §4 row 190).
- **Forbidden (any context):**
  - `@seta/agent-core` runtime — the kernel is server-only per `platform/agent/sdk/SCOPE.md` § Patterns to avoid ("No runtime dependency on `@seta/agent-core` — would balloon SDK size and pull `openai`+`@anthropic-ai/sdk`+`js-tiktoken` into downstream consumers").
  - `@seta/db`, `@seta/auth` runtime, `@seta/oauth` runtime, `@seta/audit` runtime, `@seta/agent-memory`, `@seta/agent-workflows`, `@seta/agent-rag`, `@seta/agent-vector`, `@seta/agent-embeddings`, `@seta/agent-chunking` — all server-only. Importing any of them pulls `postgres@3.4.9`, `@aws-sdk/client-kms@3.1045.0`, model SDKs (`openai@6.37.0`, `@anthropic-ai/sdk@0.95.1`), MSAL Node (`@azure/msal-node@5.2.0`) into a browser bundle. Setup.md §13 confirms each of those deps lives only in its owning server-side package.
  - `modules/channels/*`, `modules/connectors/*`, `modules/products/*` — Studio crosses module boundaries via HTTP only, not via in-process imports. CLAUDE.md "Boundaries" applies: `apps/*` (frontend variant) does not import modules' implementation packages.
- **External (recommended P2 picks; concrete pins decided at kickoff via `pnpm view`):**
  - `react`, `react-dom` (19+)
  - `vite` (7+)
  - `@tanstack/router-vite-plugin`, `@tanstack/react-router`
  - `@tanstack/react-query`
  - `zod@4.4.3` (workspace catalog pin — matches setup.md §13)
  - `tailwindcss` (4+)
  - `recharts` **or** `tremor` (TBD)
  - Dev: `vitest@4.1.5` (catalog), `@testing-library/react`, `@playwright/test`, `typescript@6.0.3` (catalog), `@seta/tsconfig@workspace:*` (workspace).

## 7. Patterns to follow

- **All API calls go through a typed `@seta/agent-sdk` client.** Studio never builds raw `fetch` URL strings; the SDK provides typed routes with Zod request/response validation per `platform/agent/sdk/SCOPE.md` § Public interface ("`RunRequest` — Zod 4 schema for the request body … Inferred TS type via `z.infer<typeof RunRequest>` per CLAUDE.md 'Schema-driven'").
- **TanStack Query is the single server-state cache.** Every endpoint maps to a `queryKey`; mutations invalidate by key. No local React state mirroring server state. This pairs with `platform/agent/sdk/SCOPE.md` § Patterns to follow ("Global `fetch` only — same rule as the kernel … Lets MSW intercept the SDK's HTTP exactly the same way it intercepts the kernel's outbound LLM calls").
- **Suspense + Error Boundary at the route level.** TanStack Router exposes per-route `errorComponent` / `pendingComponent` — lean on the framework rather than per-page try/catch. CLAUDE.md "Errors: throw `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC 7807" — Studio reads the RFC 7807 body and renders it via the error boundary; the SDK already parses it into `AgentSdkHttpError.problem` per `platform/agent/sdk/SCOPE.md` § Public interface.
- **Auth-gated routes via TanStack Router `beforeLoad`.** Call `/me`; redirect to `/login` if unauthenticated. Hydrate session into a `useSession()` hook backed by TanStack Query with `staleTime: Infinity`. Session shape comes from `@seta/sso` (setup.md §11 line 977) — Studio imports the type only.
- **Tenant scope is a route param, not global state.** `/tenants/:id/runs` ensures URL bookmarks survive tenant switches. The tenant switcher in the chrome navigates to the equivalent path on the new tenant id. This mirrors CLAUDE.md "Tenant id is never a function parameter" on the server side: on the client, tenant id is a URL param, not a client-side global. The actual tenant-scoping is still enforced server-side by `tenantContext.getTenantId()` per CLAUDE.md.
- **SSE for in-flight runs only.** List views poll via TanStack Query `refetchInterval`; only `/runs/:id` (when status is `running`) opens an SSE stream, cleaning up on unmount. Studio uses `parseSseStream` from `@seta/agent-sdk` per `platform/agent/sdk/SCOPE.md` § Public interface; `AbortSignal` flows from the React effect's cleanup into `fetch` per `platform/agent/sdk/SCOPE.md` § Patterns to follow ("Propagate `AbortSignal` end-to-end — caller `signal` → `fetch({ signal })` → server `stream.onAbort()`").
- **File upload for RAG corpus uses `multipart/form-data`.** The SDK exposes a typed `uploadCorpusDocument(file, metadata)` that posts to `POST /rag/sources` (the `@seta/agent-rag.ingest` consumer per `platform/agent/rag/SCOPE.md` § Public interface). Chunked upload for >10MB files; resumable upload is P3+.
- **All charts are data-JSON-driven.** The chart components in `@seta/ui` accept structured data (`{ series, axes, ... }`); Studio never inlines D3 / SVG paths. This mirrors the Adaptive Card pattern in `modules/products/agent/src/cards/` (setup.md §11 line 947) — the agent product hands the channel a structured card, never raw HTML; Studio hands `@seta/ui` structured data, never raw SVG.
- **Optimistic updates only for non-destructive mutations.** RAG upload — yes (the server-side ingest is idempotent per `platform/agent/rag/SCOPE.md` § Patterns to follow). Connector revoke / consent — no (server source-of-truth wins; OAuth state per `platform/oauth/SCOPE.md` is the SOR).
- **Error states render via `@seta/ui` empty-state primitives.** Never blank white pages; never `alert()` dialogs. The SDK's `AgentSdkHttpError.problem` shape is the input (`platform/agent/sdk/SCOPE.md` § Public interface).
- **Build identification in the footer.** Every page footer renders `VITE_PUBLIC_BUILD_SHA` so support requests are traceable to a build. This complements `apps/api`'s OTel trace correlation (`apps/api/SCOPE.md` § Current state — `src/instrumentation.ts` placeholder) — Studio surface + backend trace together identify the failing version.

## 8. Patterns to avoid

- **No direct DB or `@seta/db` imports.** Leaks `postgres@3.4.9` into the browser. Setup.md §13 line 1825 pins `postgres@3.4.9` exclusively to `@seta/db`. A CI bundle-check should reject any Studio import that resolves to it.
- **No direct `@seta/agent-core` runtime imports.** The kernel is Node-only — see `platform/agent/sdk/SCOPE.md` § Patterns to avoid ("would balloon SDK size and pull `openai`+`@anthropic-ai/sdk`+`js-tiktoken` into downstream consumers"). Type-only re-exports come through `@seta/agent-sdk` only.
- **No in-Studio session storage of secrets.** OAuth access/refresh tokens and KMS-encrypted material live server-side in `oauth.oauth_tokens` per `platform/oauth/SCOPE.md` § Responsibilities ("oauth.oauth_tokens (encrypted at-rest token rows with KMS-wrapped DEK per row, AES-GCM with AAD …)"). Studio sees only session cookies (signed by `@seta/sso`) and the booleans/labels `apps/api` chooses to return.
- **No hand-rolled `fetch` / URL building.** Go through `@seta/agent-sdk` types. Same rule as the kernel — `platform/agent/sdk/SCOPE.md` § Patterns to follow ("Global `fetch` only — same rule as the kernel"); applied to all Studio call sites.
- **No `localStorage` for application state.** TanStack Query owns the cache. `localStorage` is acceptable only for OS-level prefs (theme, sidebar collapsed); never for tenant id, session id, or anything role-bearing. CLAUDE.md "Stateless request path" applies in spirit on the client too — anything that survives a tab close must come from the server.
- **No `window.location.href` for navigation.** TanStack Router only (preserves loaders + cache). The single exception is the OAuth consent redirect, which is intentional cross-origin per `platform/oauth/SCOPE.md` § Patterns to follow ("Admin consent uses `/v2.0/adminconsent` … `getAuthCodeUrl` does not satisfy this").
- **No mocking of `@seta/agent-sdk` in tests.** The boundary is at the HTTP layer; component tests use MSW (`msw@2+`) to intercept network and assert on the SDK's call shape. This matches CLAUDE.md "Mocks: never mock internal `@seta/*` modules — if you need to, your seam is wrong" and mirrors `platform/agent/sdk/SCOPE.md` § Test strategy ("Transport tests use the same MSW pattern the kernel uses").
- **No Redux / Zustand / context-based global state.** TanStack Query is the global state; module-scoped React Context only for theme + i18n. CLAUDE.md "No DI containers, plugin loaders, or runtime discovery" on the server has a frontend equivalent: no parallel state-graph alongside the server cache.
- **No one-off icon imports from a giant library.** Pin a Lucide-icons subset via tree-shakable imports. Same reasoning as setup.md §10 "Explicit non-picks" — keep the bundle slim.
- **No CSS-in-JS runtimes.** Tailwind only. CSS Modules acceptable for one-off page-specific styles. Setup.md §11 line 978 already names `@seta/ui` as the shared design system — that is where styling abstractions live, not in a runtime CSS engine.
- **No "playground" agent chat panel in Studio P2.** That UX belongs to Teams per `modules/channels/teams/` (setup.md §11 lines 909–919). Studio P2 is admin + observability; a playground is P3+.
- **No business logic in Studio.** Mirrors `apps/api/SCOPE.md` § Patterns to avoid ("No business logic in `main.ts` or in any local route handler"); frontend equivalent is "Studio holds no domain rules — every decision rule lives behind an `apps/api` endpoint".

## 9. Test strategy

- **Component tests** — Vitest + React Testing Library co-located at `src/**/*.test.tsx` per CLAUDE.md "Conventions" ("Tests: unit co-located `<pkg>/src/**/*.test.ts`"). MSW intercepts SDK calls; recorded fixtures (`__recordings__/sdk/*.json`) mirror the same content-hash recording shape as `@seta/agent-core/testkit` per spike `docs/explorations/2026-05-12-mastra-spike/06-llm-recording-replay.md`. Re-record via `RECORD=1 pnpm --filter @seta/studio test -t <name>` matching CLAUDE.md "Re-record LLM fixture" row.
- **E2E tests** — Playwright; full SPA boot against a dockerized `apps/api` + `pg` + `jaeger`. Covers: login round-trip; tenant switch; connector admin-consent (OAuth fakes via MSW at the `apps/api` boundary); upload corpus document; view a recorded run; filter audit log. Lives in `/tests/e2e/studio/*` (cross-package per setup.md §11 line 981 — `tests/e2e/` is the workspace E2E location, not per-package). Playwright is the workspace pick per setup.md §10 ("Explicit non-picks" — deferred until Studio; Studio is where it lands).
- **Accessibility** — Playwright + `@axe-core/playwright` audit; each route has a baseline scan. Fix violations before merge. No external citation in setup.md / CLAUDE.md — added as a Studio-specific quality gate.
- **Bundle-size budget** — Vite bundle analyzer gate at CI; reject PRs that grow the initial JS bundle past N kB (N decided at kickoff — recommend 250 kB gzipped main + 100 kB per route chunk as starting budgets). No external citation; new gate introduced by this SCOPE.
- **Visual regression** — out of scope for P2. Defer to P3 once `@seta/ui` design system stabilises.
- **No live model APIs in CI.** Same rule as the rest of the workspace — CLAUDE.md "LLM in tests: only via `@seta/agent-core/testkit` recordings. Never live model APIs in CI". Studio's tests stop at the SDK boundary; the kernel's recordings are not loaded here.
- **No mocking of internal `@seta/*` modules** — CLAUDE.md "Mocks". MSW intercepts at the HTTP boundary, which is by construction outside the workspace.

## 10. Open questions

1. **`@seta/ui` design-system content + ownership.** Setup.md §11 line 978 lists `@seta/ui` as P2 with no detail. Studio is its first consumer. Does `@seta/ui` ship as part of P2 (Studio + ui co-develop in the same milestone) or does Studio inline temporary components and `@seta/ui` extract them post-launch? Recommend co-develop — same PR cadence, same reviewers, no extraction churn.
2. **`@seta/sso` package shape.** Setup.md §4 row 190 lists "Inbound SSO (P2)" with Entra + Google OIDC via `jose@6.2.3` + PKCE; sessions in Postgres `sessions` table (§3 line 110 — `auth.sessions`). The package boundary (`@seta/sso` as a dedicated package per setup.md §11 line 977 vs. folded into `@seta/auth`) is unresolved — `platform/auth/SCOPE.md` already owns `users` / `sessions` / `api_keys` (setup.md §3 line 110). Recommend a dedicated `@seta/sso` to keep `@seta/auth`'s argon2/KMS surface separate from web-session lifecycle.
3. **Tenant-staff multi-access UX.** Seta engineers admin multiple tenants. Studio's tenant switcher must list those the session has access to; an access-grant table shape (probably `auth.tenant_members(user_id, tenant_id, role)`) is not yet specified in setup.md §3. Cross-reference `platform/auth/SCOPE.md` Open Questions once it exists.
4. **RAG corpus storage.** Where do uploaded source documents live? In `agent_vector` (a `sources` table with `bytea` body)? In S3 / Azure Blob? `platform/agent/rag/SCOPE.md` § Open questions item 1 ("FTS leg corpus provenance") flags the same ambiguity. Recommend pg-only in P2 (≤100MB total corpus assumed; setup.md §3 "pgvector handles 1–10M rows" rationale extends to small corpus bodies); defer object-storage to P3.
5. **Audit log scale.** How many rows over what retention window? Studio's filter UX needs to plan for paginated server-side filtering; if `audit.audit_log` grows to millions of rows, a partial-index strategy is needed in `@seta/audit` — cross-reference `platform/audit/SCOPE.md` § Open questions ("Indexes" + "Retention / partitioning").
6. **Internationalisation.** Seta has Vietnamese + English staff. Defer i18n to P3 unless a sponsor demand surfaces earlier.
7. **Light/dark theme.** Defer to P3 unless trivial to ship from `@seta/ui` on day one.
8. **Browser support matrix.** Confirm Safari iOS support (mobile Seta staff usage) — affects use of cutting-edge CSS (`@container`, `:has()`, view transitions).
9. **OSS publishing for `apps/studio`.** It is an *app*, not a library; not published to npm per setup.md §9 ("Everything else | private (`'private': true`) | — | never (until refactored)"). Source-available in the Apache-2.0 monorepo per setup.md §9 ("Apache 2.0 requires source availability"). Confirm `"private": true` on the package at kickoff.
10. **Live demo URL.** Setup.md §9 line 780 names `os.seta-international.com` as the project landing. Studio likely lives at `studio.os.seta-international.com` or `os.seta-international.com/studio`. Pick at deploy time.

## Cross-references

- **Setup spec:** [`docs/setup.md`](../../docs/setup.md) §1–§8 (no FE picks present — Studio fills the gap), §4 row 190–191 (Inbound SSO P2 + sessions table), §9 (publishing — Studio stays private), §10 (Playwright deferred until Studio), §11 line 905 (Studio slot) and lines 977–978 (`@seta/sso` + `@seta/ui` P2 packages), §13 (no Studio dep block — created at P2 kickoff).
- **Boundary rules:** [`CLAUDE.md`](../../CLAUDE.md) — `apps/*` composition-only rule + "CLI-only — packages and dependencies" + "Schema-driven" + "Mocks: never mock internal `@seta/*` modules" + "Tenant id is never a function parameter".
- **Backend dependency:** [`apps/api/SCOPE.md`](../api/SCOPE.md) — every Studio HTTP call lands on `apps/api`; Open Questions § "`src/routes/` directory" tracks which routes still need to land.
- **Primary runtime dep:** [`platform/agent/sdk/SCOPE.md`](../../platform/agent/sdk/SCOPE.md) — `AgentClient`, `parseSseStream`, `decodeKernelChunk`, `RunRequest`, `AgentSdkHttpError`.
- **Connector admin UI dep:** [`platform/connector-registry/SCOPE.md`](../../platform/connector-registry/SCOPE.md) — `ConnectorDefinition`, scope union, consent gate.
- **Consent flow dep:** [`platform/oauth/SCOPE.md`](../../platform/oauth/SCOPE.md) — `/consent-url`, `/callback`, admin-consent endpoint usage.
- **Audit viewer dep:** [`platform/audit/SCOPE.md`](../../platform/audit/SCOPE.md) — `audit.audit_log` shape + read-side ownership gap that Studio fills.
- **RAG corpus dep:** [`platform/agent/rag/SCOPE.md`](../../platform/agent/rag/SCOPE.md) — `ingest()`, `retrieve()`, `RagHit`.
- **P1 override notice (for what Studio is NOT pulled into):** [`docs/explorations/2026-05-12-mastra-spike/README.md`](../../docs/explorations/2026-05-12-mastra-spike/README.md) § "P1 scope override (2026-05-12)" — confirms inbound web SSO remains P2 even after the override; Studio rides with it.
