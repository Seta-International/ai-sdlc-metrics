# Studio P2 — Full Implementation Master Plan

**Date:** 2026-05-15
**Scope:** All of Studio P2 — `@seta/sso` package, backend route surfaces in `apps/api`, `@seta/agent-sdk` method additions, `@seta/ui` primitives v2, `apps/studio` SPA across nine functional areas (the original four admin areas + workflow-run viewer + agents/playground + tools + memory inspector + metrics dashboard).
**Status:** Approved for implementation planning.
**Companion spec:** [`2026-05-15-studio-design.md`](./2026-05-15-studio-design.md) — design language, token layer, AppShell behaviour, responsive matrix, Mastra reference table. This master plan sits on top of that spec and decomposes it into landable PRs.

---

## 1. Current state (2026-05-15)

| Surface | State |
|---|---|
| `@seta/ui` (`platform/ui/`) | **Shipped.** Tokens, AppShell, Sidebar, TopBar, AgentPanel, all forms primitives, all data primitives (`DataTable`, `StatusBadge`, `Card`, `EmptyState`, `Timeline`, `TimelineEvent`, `TokenUsageBar`, `Code`), all feedback primitives (`Dialog`, `Toast`, `Toaster`, `Tooltip`), provider, hooks (`useChat`, `useAgentRun`, `useSession`, `useSidebar`, `useAgentPanel`, `useMediaQuery`). Commit `41be7714`. |
| `@seta/agent-sdk` (`platform/agent/sdk/`) | **Shipped.** `AgentClient`, `parseSseStream`, `KernelChunk` types. Commit `570e411f`. Will gain typed methods per slice PR. |
| `@seta/sso` | **Does not exist.** This plan creates it. |
| `apps/api` route surface | **Has `/healthz`, `/oauth`, `/agent`, `/teams/messages`.** Missing: `/sso/*`, `/me`, `/tenants`, `/tenants/:id/connectors`, `/runs(+stream)`, `/rag/*`, `/audit(+/export.csv)`, `/agents`, `/workflows(+/runs+stream)`, `/tools(+/try)`, `/threads(+/messages+working-memory)`, `/metrics`. |
| `apps/studio` | **SCOPE.md placeholder only.** |

---

## 2. Functional area scope (9 areas)

### 2.1 Original admin spec (`2026-05-15-studio-design.md` §5)

1. **Tenants + connector admin** — list tenants, list connectors per tenant, grant admin consent.
2. **Run viewer** — agent run list, single run with live SSE timeline.
3. **RAG corpus** — source list, upload, reindex, chunk inspector.
4. **Audit log** — filter, paginate, CSV export.

### 2.2 Mastra-parity expansion

5. **Agents page + Playground chat** — list agent profiles, agent detail page with overview / playground / tools tabs; playground = `useChat` against `/agent` with selected profile. Equivalent to Mastra `playground/src/pages/agents/`.
6. **Workflow-run viewer** — workflow definitions list, runs list per workflow, per-run detail with step DAG + live SSE. Equivalent to Mastra `playground/src/domains/workflows/`.
7. **Tools page** — tool registry browser, per-tool detail, "try this tool" dry-run form driven by JSON schema. Equivalent to Mastra `playground/src/domains/tools/`.
8. **Memory inspector** — per-tenant threads list, thread message browser, working-memory key/value inspector. Equivalent to Mastra `playground/src/domains/memory/`.
9. **Metrics dashboard** — aggregate token spend, run counts, latency p95, error rate. Recharts-based. Equivalent to Mastra `playground-ui/src/domains/metrics/`.

### 2.3 Deferred to P3+

Evals / Scorers / Datasets / Experiments / Review, MCPs, Prompt blocks, Processors, Embedders, Vectors, CMS, Voice, Templates, Schedules, Code editor for tool definitions, Tracing UI separate from runs (we collapse Mastra Traces into our Run viewer for P2).

---

## 3. Sub-project decomposition (13 PRs)

```
PR-1   @seta/sso package                                  (platform/sso/ — new)
PR-2   apps/api: mount /sso + /me                         (composition diff)
PR-3   apps/studio kickoff                                (scaffold + /login + /me + /tenants smoke)
PR-4   Tenants + connector admin slice
PR-5   Run viewer slice
PR-6   RAG corpus slice
PR-7   Audit log slice
PR-8   @seta/ui primitives v2                             (Tabs, KeyValueList, SectionCard, Searchbar)
PR-9   Agents + Playground slice
PR-10  Workflow-run viewer slice                          (includes WorkflowGraph component)
PR-11  Tools slice                                        (includes JsonSchemaForm component)
PR-12  Memory inspector slice                             (includes Tree component)
PR-13  Metrics dashboard slice
```

### 3.1 Dependency graph

- PR-2 ← PR-1
- PR-3 ← PR-2
- PR-4..7 ← PR-3
- PR-8 ← PR-3 (independent of PR-4..7 — can land in parallel)
- PR-9..13 ← PR-8 (need Tabs / KeyValueList / SectionCard / Searchbar)
- Within PR-4..7 and within PR-9..13: mutually independent, can be developed in parallel

### 3.2 Per-PR demo state

| After | Demoable state |
|---|---|
| PR-2  | `/me` returns 401 unauth; OIDC round-trip returns user JSON. |
| PR-3  | Studio at `localhost:5173`. Login. Tenants smoke list. |
| PR-4  | Connector consent end-to-end. |
| PR-5  | Run timeline streams live SSE. |
| PR-6  | Corpus upload + reindex. |
| PR-7  | Audit search + CSV. |
| PR-8  | New primitives available in `@seta/ui`. No new Studio surfaces yet. |
| PR-9  | Agent profile list + Playground chat in a tab. |
| PR-10 | Workflow definitions, runs, per-run graph with live SSE. |
| PR-11 | Tool browser + try-tool dry-run. |
| PR-12 | Thread + working-memory inspector. |
| PR-13 | Metrics dashboard with token-spend / latency / error charts. |

### 3.3 Why two primitive waves?

Original P2 spec primitives shipped in commit `41be7714` (already done). The Mastra-parity slices need additional primitives — `Tabs` (agent-detail), `KeyValueList` (memory, tool detail, metrics summary), `SectionCard` (page sections), `Searchbar` (tool / memory search). These are general enough to land separately as PR-8 before the slices that consume them. Slice-specific primitives (`WorkflowGraph`, `JsonSchemaForm`, `Tree`) ride inside their owning slice PR.

---

## 4. PR-1 — `@seta/sso` package

### 4.1 Location & boundary

`platform/sso/` per CLAUDE.md "framework primitives, vendor-neutral". Depends on `@seta/db`, `@seta/middleware`, `@seta/observability`, `@seta/tenant` (for membership preflight on `/me`). Does not depend on `@seta/auth`, `@seta/oauth`, model SDKs, MSAL.

### 4.2 Owns

- `auth.sessions` table — Drizzle schema with RLS, schema-per-module.
- `auth.user_identities` table — `(provider, subject, user_id)` for cross-provider linking.
- `auth.users` columns for SSO identity (`email`, `name`, `picture_url`, `primary_provider`). If `@seta/auth` already owns `auth.users`, add columns via custom migration `drizzle-kit generate --custom`.
- OIDC + PKCE handshake for Entra + Google via `jose@6.2.3`.
- Signed session cookie minting/verification — opaque session id, HMAC-signed cookie value, session row is SOR.
- `requireSession` + `csrfMiddleware` exported alongside `createSsoRoutes`.

### 4.3 Does NOT own

- Argon2 / local-credential users — `@seta/auth`.
- KMS / outbound token vault — `@seta/oauth`.
- Tenant membership rows — `@seta/tenant` owns `auth.tenant_members(user_id, tenant_id, role)` (added in PR-4; PR-1 returns empty tenants list on `/me`).

### 4.4 Public interface

```ts
export interface SsoProvider {
  id: 'entra' | 'google'
  authorizeUrl(opts: { state: string; pkce: string; redirectUri: string }): string
  exchangeCode(opts: { code: string; pkce: string; redirectUri: string }): Promise<OidcIdToken>
}
export class EntraSsoProvider implements SsoProvider { /* ... */ }
export class GoogleSsoProvider implements SsoProvider { /* ... */ }

export function createSsoRoutes(opts: {
  providers: { entra: SsoProvider; google: SsoProvider }
  sql: Sql
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
}): Hono

export const requireSession: MiddlewareHandler
export const csrfMiddleware: MiddlewareHandler

export type SessionUser = z.infer<typeof SessionUser>
export type TenantSummary = z.infer<typeof TenantSummary>
```

### 4.5 Route surface

- `POST /sso/login/:provider` — body `{ returnTo?: string }`. Sets pkce+state in short-lived signed cookie. Response `{ url }`.
- `GET /sso/callback/:provider` — exchanges code, upserts user, creates session, sets cookie, 302 to `returnTo` or `/`.
- `POST /sso/logout` — deletes session row, clears cookie.
- `GET /me` — reads session cookie, returns `{ user, tenants, csrfToken }`.

### 4.6 TDD

`platform/*` per CLAUDE.md is TDD-required. Tests cover: cookie HMAC roundtrip, PKCE state generation, provider mock with recorded ID tokens, session expiry, `/me` 401 on missing/invalid cookie.

---

## 5. PR-2 — `apps/api`: mount `/sso` + `/me`

Composition-only diff in `apps/api/src/main.ts`:

```ts
import { createSsoRoutes, EntraSsoProvider, GoogleSsoProvider } from '@seta/sso'

const sso = createSsoRoutes({
  providers: {
    entra: new EntraSsoProvider({ clientId: env.ENTRA_CLIENT_ID, clientSecret: env.ENTRA_CLIENT_SECRET }),
    google: new GoogleSsoProvider({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
  },
  sql,
  sessionCookie: {
    name: 'seta_sess',
    hmacKey: env.SESSION_HMAC_KEY,
    ttlSec: env.SESSION_TTL_SEC,
    secure: env.NODE_ENV === 'production',
  },
  redirectBase: env.PUBLIC_BASE_URL,
})

app.route('/', sso)
```

`apps/api/src/env.ts` adds `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_HMAC_KEY`, `SESSION_TTL_SEC`, `PUBLIC_BASE_URL` to the Zod env schema.

---

## 6. PR-3 — `apps/studio` kickoff

### 6.1 Package scaffold

`pnpm new:package` creates `apps/studio` with `"private": true`. Then per CLAUDE.md "CLI-only":

```sh
pnpm --filter @seta/studio add react@<pin> react-dom@<pin> \
  @tanstack/react-router@<pin> @tanstack/router-vite-plugin@<pin> \
  @tanstack/react-query@<pin> vite@<pin> tailwindcss@<pin> \
  zod@4.4.3 lucide-react@<pin> recharts@<pin>
pnpm --filter @seta/studio add @seta/agent-sdk@workspace:* @seta/ui@workspace:*
pnpm --filter @seta/studio add @seta/connector-registry@workspace:* @seta/sso@workspace:*
pnpm --filter @seta/studio add -D vitest@4.1.5 @testing-library/react@<pin> \
  @testing-library/jest-dom@<pin> @testing-library/user-event@<pin> \
  msw@2.14.6 jsdom@<pin> @playwright/test@<pin> @axe-core/playwright@<pin> \
  @types/react@<pin> @types/react-dom@<pin> typescript@6.0.3 \
  @seta/tsconfig@workspace:*
```

Pins chosen via `pnpm view <pkg> version` at PR-3 kickoff.

### 6.2 File tree

```
apps/studio/
  index.html
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  scripts/check-bundle-size.ts
  src/
    env.ts
    main.tsx
    router.tsx
    routes/
      __root.tsx
      login.tsx
      login.$provider.callback.tsx
      _authed.tsx
      _authed/me.tsx
      _authed/tenants.tsx
      _authed/tenants.$id.tsx
      _authed/tenants.$id.setup.tsx
      _authed/tenants.$id.connectors.tsx
      _authed/tenants.$id.connectors.$cid.consent.tsx
      _authed/tenants.$id.runs.tsx
      _authed/tenants.$id.runs.$runId.tsx
      _authed/tenants.$id.corpus.tsx
      _authed/tenants.$id.corpus.$sourceId.tsx
      _authed/tenants.$id.audit.tsx
      _authed/tenants.$id.agents.tsx
      _authed/tenants.$id.agents.$agentId.tsx
      _authed/tenants.$id.workflows.tsx
      _authed/tenants.$id.workflows.$workflowId.tsx
      _authed/tenants.$id.workflows.$workflowId.runs.$runId.tsx
      _authed/tenants.$id.tools.tsx
      _authed/tenants.$id.tools.$toolId.tsx
      _authed/tenants.$id.threads.tsx
      _authed/tenants.$id.threads.$threadId.tsx
      _authed/tenants.$id.metrics.tsx
    api/
      client.ts
      queries.ts
    features/
      tenants/ connectors/ runs/ corpus/ audit/
      agents/ workflows/ tools/ threads/ metrics/
    nav/
      studioNav.ts
      agentContext.ts
    test/
      setup.ts
      __recordings__/sdk/*.json
  tests/integration/
  vitest.config.ts
```

### 6.3 PR-3 scope

- All scaffold above.
- `/login` page with auth gradient hero, Microsoft + Google buttons.
- `/login/:provider/callback` cleanup route.
- `_authed.tsx` with `beforeLoad: ensureQueryData(meQuery)` + redirect, mounts `AppShell` with full nav (route files exist as stubs for slices PR-4..13).
- `/tenants` smoke page using `TenantSummary[]` from `/me`.
- `useSession()` from `@seta/ui` consumed.
- `Toaster` mounted in `__root.tsx`.
- `studioNav.ts` registers all sidebar entries; pages 5–9 stub with `EmptyState("Coming soon", BadgeAlert)` until their slice ships.

---

## 7. Backend route ownership pattern

Every Studio-consumed route lives in its **owning platform/module package**, exposed via a `createXRoutes()` factory. `apps/api/src/main.ts` is composition only.

| Route | Owner | Factory (PR) |
|---|---|---|
| `GET /tenants` | `@seta/tenant` | `createTenantRoutes` (PR-4) |
| `GET /tenants/:id/connectors`, `POST /connectors/:cid/consent-url` | `@seta/connector-registry` | `createConnectorAdminRoutes` (PR-4) |
| `GET /runs`, `GET /runs/:runId`, `GET /runs/:runId/stream` | `@seta/agent-server` | `createRunAdminRoutes` (PR-5) |
| `GET /rag/sources`, `POST /rag/sources`, `POST /rag/sources/:id/reindex`, `GET /rag/sources/:id/chunks` | `@seta/agent-rag` | `createRagRoutes` (PR-6) |
| `GET /audit`, `GET /audit/export.csv` | `@seta/audit` | `createAuditRoutes` (PR-7) |
| `GET /agents`, `GET /agents/:id` | `@seta/agent-server` | `createAgentAdminRoutes` (PR-9) |
| `GET /workflows`, `GET /workflows/:id`, `GET /workflows/:id/runs`, `GET /workflow-runs/:runId`, `GET /workflow-runs/:runId/stream` | `@seta/agent-workflows` | `createWorkflowAdminRoutes` (PR-10) |
| `GET /tools`, `GET /tools/:id`, `POST /tools/:id/try` | `@seta/agent-server` | `createToolAdminRoutes` (PR-11) |
| `GET /threads`, `GET /threads/:id`, `GET /threads/:id/messages`, `GET /threads/:id/working-memory` | `@seta/agent-memory` | `createMemoryAdminRoutes` (PR-12) |
| `GET /metrics/runs`, `GET /metrics/tokens`, `GET /metrics/latency`, `GET /metrics/errors` | `@seta/analytics` | `createMetricsRoutes` (PR-13) |

### 7.1 Universal route conventions

1. **Auth wall** — `requireSession` from `@seta/sso`. `/me` is the only auth-aware route.
2. **Tenant scope** — `/tenants/:id/*` and any tenant-scoped query call `tenantMiddleware` from `@seta/tenant`.
3. **Membership preflight** — `requireTenantMembership(tenantId, userId)`. 403 if missing.
4. **Zod-validated** request/response via `@hono/zod-openapi`. Import `z` from there, not `zod`.
5. **RFC 7807 errors** via `@seta/middleware/errors.onError`.
6. **Cursor pagination** (natural-key). Default limit 50, max 200.
7. **SSE** only on `/runs/:runId/stream` and `/workflow-runs/:runId/stream`. Uses `streamKernelSSE(c, run)`.
8. **`X-Request-Id`** propagated to OTel.

### 7.2 `@seta/agent-sdk` method additions

| Slice | Methods |
|---|---|
| PR-4 | `listTenants`, `listConnectors(tenantId)`, `grantConsentUrl({ tenantId, connectorId })` |
| PR-5 | `listRuns(filters)`, `getRun(runId)`, `streamRun(runId, { signal })` |
| PR-6 | `listSources(tenantId)`, `uploadSource(file, metadata)`, `reindexSource(sourceId)`, `getSourceChunks(sourceId, { cursor })` |
| PR-7 | `queryAudit(filters)`, `exportAuditCsv(filters)` |
| PR-9 | `listAgents(tenantId)`, `getAgent(agentId)` |
| PR-10 | `listWorkflows(tenantId)`, `getWorkflow(workflowId)`, `listWorkflowRuns(workflowId, filters)`, `getWorkflowRun(runId)`, `streamWorkflowRun(runId, { signal })` |
| PR-11 | `listTools(tenantId)`, `getTool(toolId)`, `tryTool(toolId, input)` |
| PR-12 | `listThreads(tenantId, filters)`, `getThread(threadId)`, `listThreadMessages(threadId, { cursor })`, `getWorkingMemory(threadId)` |
| PR-13 | `getRunMetrics(tenantId, range)`, `getTokenMetrics(tenantId, range)`, `getLatencyMetrics(tenantId, range)`, `getErrorMetrics(tenantId, range)` |

Each method has Zod request/response schemas exported for MSW test recordings.

---

## 8. PR-4 — Tenants + connector admin slice

### 8.1 Backend

- `@seta/tenant` adds `auth.tenant_members(user_id, tenant_id, role)` (RLS), `listTenantsForUser`, `requireTenantMembership`, `createTenantRoutes`.
- `@seta/connector-registry` adds `createConnectorAdminRoutes` exposing `/tenants/:id/connectors` and `/connectors/:cid/consent-url` (delegates to `@seta/oauth`).
- `apps/api/src/main.ts`: 2-line composition diff.

### 8.2 Studio

- `/tenants` full `DataTable`, columns: name, connector count, last activity.
- `/tenants/:id/connectors` `DataTable` with `StatusBadge`, "Grant consent" → `window.location.href = url` (single OAuth exception).
- `/tenants/:id/connectors/:cid/consent` post-redirect landing.
- `TenantSwitcher` wired in TopBar.
- `AgentPanel` mounted from this PR onward.

---

## 9. PR-5 — Run viewer slice

### 9.1 Backend

`@seta/agent-server` adds `createRunAdminRoutes` exposing `GET /runs`, `GET /runs/:runId`, `GET /runs/:runId/stream`. Cursor-paginated. SSE uses existing `streamKernelSSE`. Replay returns historical chunks for `completed`/`failed`; live stream for `running`.

### 9.2 Studio

- `/tenants/:id/runs` — `DataTable`, `refetchInterval: 5000` when any row `running`. tnum-formatted numerals.
- `/tenants/:id/runs/:runId` — `Card` + `Timeline` driven by `useAgentRun(runId)`. `TokenUsageBar`. Expandable `TimelineEvent` rows with `Code` blocks.

---

## 10. PR-6 — RAG corpus slice

### 10.1 Backend

`@seta/agent-rag` adds `createRagRoutes`. Postgres `bytea ≤100MB` per upload (P2 cap), reject 413 above. Content-hash dedup. Object storage P3+.

### 10.2 Studio

- `/tenants/:id/corpus` — `DataTable`, "Upload" → `Dialog` with `FileUpload`. Optimistic insert with `info` `StatusBadge`. `refetchInterval: 3000` while indexing.
- `/tenants/:id/corpus/:sourceId` — chunk count, metadata, "Re-index" button.

---

## 11. PR-7 — Audit log slice

### 11.1 Backend

`@seta/audit` adds `createAuditRoutes`. Indexes `(tenant_id, created_at)`, `(tenant_id, user_id, created_at)`, `(tenant_id, tool, created_at)`. CSV export streams `text/csv`.

### 11.2 Studio

- `/tenants/:id/audit` — filter bar (`Select`, `DateRangePicker`) + `DataTable`. Cursor "Load more". "Export CSV" → blob download.

---

## 12. PR-8 — `@seta/ui` primitives v2

New components in `platform/ui/src/components/data/` and `feedback/`:

- **`Tabs`** — Radix Tabs wrapper. `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`. Underline active variant matches Linear style. Used for agent-detail tabs (overview / playground / tools) and workflow detail.
- **`KeyValueList`** — props: `entries: { key: string; value: ReactNode; copyable?: boolean }[]`. Two-column key/value table, monospace values, optional copy button. Used for tool detail, working memory inspector, metrics summary, audit row drill-down.
- **`SectionCard`** — props: `title`, `description?`, `action?: ReactNode`, `children`. `Card` with built-in section header. Used across detail pages.
- **`Searchbar`** — debounced text input with `Search` icon prefix and clear button. Props: `value`, `onChange`, `placeholder?`, `debounceMs?: number = 200`. Used in tools list, threads list.

Each has co-located tests. No additions to `tokens.css` — all variants map to existing CSS vars.

Exports in `platform/ui/src/index.ts`.

---

## 13. PR-9 — Agents + Playground slice

### 13.1 Backend

`@seta/agent-server` adds `createAgentAdminRoutes` exposing `GET /agents?tenantId=` (returns agent profile list — id, name, description, model, tools list, system prompt preview) and `GET /agents/:id` (full profile).

### 13.2 Studio

- `/tenants/:id/agents` — `DataTable` of profiles. Columns: name, model, tool count, last-used.
- `/tenants/:id/agents/:agentId` — `Tabs`:
  - **Overview** tab — `SectionCard` with name/model/system prompt (collapsible `Code`), `KeyValueList` of config.
  - **Playground** tab — embedded `AgentPanel` style chat in the main canvas using `useChat`. `stream` callback posts to `/agent` with `{ agentId, agentContext: { tenantId, page: 'playground' } }`. Distinct from the global `AgentPanel` — this is a focused per-agent chat session that doesn't persist outside the page. Reset button clears the in-memory thread.
  - **Tools** tab — list of tools the agent has access to, links to `/tenants/:id/tools/:toolId`.

### 13.3 AgentPanel coexistence

The global `AgentPanel` (right-side, `useChat` against a generic Seta-help agent) stays visible on the agents page. The playground in the main canvas is a separate `useChat` instance against the selected profile. No state collision — two independent threads.

---

## 14. PR-10 — Workflow-run viewer slice

### 14.1 Backend

`@seta/agent-workflows` adds `createWorkflowAdminRoutes`:
- `GET /workflows?tenantId=` — workflow definitions (id, name, version, step count, last-run).
- `GET /workflows/:id` — definition with step DAG (steps + edges).
- `GET /workflows/:id/runs` — cursor-paginated runs for this workflow.
- `GET /workflow-runs/:runId` — single run with per-step state, inputs, outputs, error.
- `GET /workflow-runs/:runId/stream` — SSE for in-flight workflow runs. Chunk type: `workflow_step_started` / `workflow_step_completed` / `workflow_step_failed` / `workflow_run_end`. New chunk variants extend `KernelChunk` union.

### 14.2 Studio + new primitive (rides in this PR)

- **`WorkflowGraph` component** (`platform/ui/src/components/data/WorkflowGraph.tsx`): SVG DAG renderer. Props: `nodes: { id, label, status }[]`, `edges: { from, to }[]`, `activeNodeId?`. Layout via dagre.js (pinned at this PR). Node status colors map to `StatusBadge` semantic palette. ≤200 nodes — beyond that, fall back to list mode.
- `/tenants/:id/workflows` — `DataTable`.
- `/tenants/:id/workflows/:workflowId` — `Tabs`:
  - **Definition** — `WorkflowGraph` of the static DAG, `SectionCard` of metadata, `Code` of definition JSON.
  - **Runs** — `DataTable` of runs with status, duration, started-at, `refetchInterval: 5000` if any running.
- `/tenants/:id/workflows/:workflowId/runs/:runId` — `WorkflowGraph` with live node-state colorization (info=running, success=completed, error=failed). Below: `Timeline` of step events using `useAgentRun(runId)` adapted for workflow chunks. Per-step expandable rows with `KeyValueList` of inputs/outputs and `Code` for raw payloads.

---

## 15. PR-11 — Tools slice

### 15.1 Backend

`@seta/agent-server` adds `createToolAdminRoutes`:
- `GET /tools?tenantId=` — registered tools (id, name, description, owner connector, JSON schema for input, scopes required).
- `GET /tools/:id` — full tool metadata + recent usage stats.
- `POST /tools/:id/try` — dry-run: body matches the tool's JSON schema; returns the tool's response in `dry-run: true` mode (no side effects on external systems; reads OK, writes return what would happen). Tools opt into try-mode via `tool.dryRun?: (input) => Promise<unknown>` in `ToolDefinition`. Tools without try-mode return 405.

### 15.2 Studio + new primitive (rides in this PR)

- **`JsonSchemaForm` component** (`platform/ui/src/components/forms/JsonSchemaForm.tsx`): renders a form from a JSON schema. Supports `string`, `number`, `boolean`, `object`, `array`, `enum`, `string` with `format: 'date-time' | 'uri'`. Uses existing `Input`, `Select`, `DateRangePicker`. Inline validation via Zod (converted from JSON schema on mount via `json-schema-to-zod` — pinned at this PR). Props: `schema`, `onSubmit`, `defaultValues?`, `submitLabel?: string`.
- `/tenants/:id/tools` — `DataTable` + `Searchbar` filter. Columns: name, connector, scope count, try-mode availability.
- `/tenants/:id/tools/:toolId` — `Tabs`:
  - **Overview** — `KeyValueList` of metadata, `Code` of full JSON schema, list of required scopes with consent status.
  - **Try it** — `JsonSchemaForm` from the tool's input schema. "Run" → `client.tryTool(...)`. Result rendered in `Code` with `lang="json"`. Disabled (with explainer) if tool has no `dryRun`.

---

## 16. PR-12 — Memory inspector slice

### 16.1 Backend

`@seta/agent-memory` adds `createMemoryAdminRoutes`:
- `GET /threads?tenantId=&userId=&cursor=` — thread list (id, agent-id, last-message-at, message-count, working-memory-key-count).
- `GET /threads/:id` — thread metadata.
- `GET /threads/:id/messages?cursor=` — paginated messages (role, parts, timestamp, tool calls).
- `GET /threads/:id/working-memory` — working-memory key/value map.

Read-only. P2 does not allow editing working memory from Studio.

### 16.2 Studio + new primitive (rides in this PR)

- **`Tree` component** (`platform/ui/src/components/data/Tree.tsx`): expandable hierarchical list. Props: `nodes: { id, label, children?: Node[], data?: T }[]`, `defaultExpanded?: Set<string>`, `onNodeClick?: (node) => void`. Used for working-memory inspector (nested objects), thread message-part tree.
- `/tenants/:id/threads` — `DataTable` + `Searchbar` (filters by agent or user). Columns: thread id, agent, user, message count, last message.
- `/tenants/:id/threads/:threadId` — `Tabs`:
  - **Messages** — virtualized list (using `@tanstack/react-virtual`, pinned at this PR) of messages with role + parts + tool calls. Reuses `AgentMessageList` rendering.
  - **Working memory** — `Tree` of working-memory object, with `KeyValueList` for leaves. `Code` view toggle for raw JSON.

---

## 17. PR-13 — Metrics dashboard slice

### 17.1 Backend

`@seta/analytics` adds `createMetricsRoutes` returning aggregated rollups (reads from existing materialized views — `refreshAnalyticsViews` already runs after planner sync):
- `GET /metrics/runs?tenantId=&range=7d|30d` — `{ buckets: [{ date, started, completed, failed }] }`.
- `GET /metrics/tokens?tenantId=&range=` — `{ buckets: [{ date, prompt, completion, cached }] }`.
- `GET /metrics/latency?tenantId=&range=` — `{ buckets: [{ date, p50, p95, p99 }] }`.
- `GET /metrics/errors?tenantId=&range=` — `{ buckets: [{ date, count, byKind: { ... } }] }`.

Range is bounded (`7d | 30d | 90d`) — no arbitrary ranges in P2 to keep rollups simple.

### 17.2 Studio

- `/tenants/:id/metrics` — four Recharts cards in a 2×2 grid using `MetricsFlexGrid`-style responsive layout (collapses to 1-col below 1024px):
  - **Runs over time** — stacked bar (started/completed/failed).
  - **Token spend** — stacked area (prompt/completion/cached).
  - **Latency p50/p95/p99** — line chart.
  - **Errors by kind** — stacked bar by error kind.
- Range selector (Tabs: 7d / 30d / 90d) in the page header.
- `KeyValueList` summary above the charts: total runs, total tokens, error rate, p95 latency.

No new primitives — Recharts used directly. Future P3+ work could extract a `Chart` wrapper into `@seta/ui`.

---

## 18. AgentPanel context per route

`AgentContext` shape extends `@seta/ui` type:

```ts
export interface AgentContext {
  tenantId: string | null
  page: 'tenants' | 'connectors' | 'consent' | 'runs' | 'run-detail'
       | 'corpus' | 'corpus-detail' | 'audit'
       | 'agents' | 'agent-detail' | 'playground'
       | 'workflows' | 'workflow-detail' | 'workflow-run'
       | 'tools' | 'tool-detail'
       | 'threads' | 'thread-detail'
       | 'metrics'
       | 'me' | null
  record?: { kind: 'run'; runId: string }
         | { kind: 'connector'; connectorId: string }
         | { kind: 'source'; sourceId: string }
         | { kind: 'agent'; agentId: string }
         | { kind: 'workflow'; workflowId: string }
         | { kind: 'workflow-run'; runId: string }
         | { kind: 'tool'; toolId: string }
         | { kind: 'thread'; threadId: string }
}
```

Per-route mapping lives in `apps/studio/src/nav/agentContext.ts`. The agent panel `stream` callback includes `agentContext` in `POST /agent` body. Route navigation does not reset the thread — `agentContext` is per-message metadata.

The agents-page **playground** chat uses a separate `useChat` instance with its own `agentContext: { ..., page: 'playground' }` and the selected `agentId` injected into the request body. The global panel and playground are independent threads.

---

## 19. Cross-cutting concerns

1. **Tenant switching UX.** `TenantSwitcher` navigates to the equivalent path on the new tenant id. Fallback to `/tenants/:id/connectors` if no equivalent exists.
2. **OAuth consent redirect.** Single `window.location.href` exception, `features/connectors/grantConsent.ts`.
3. **CSRF.** `SameSite=Lax` cookie + `X-CSRF-Token` header on state-changing endpoints. Token from `/me`. `csrfMiddleware` from `@seta/sso`.
4. **Observability.** `X-Request-Id` UUIDv7 per request, propagated to OTel.
5. **Build-info footer.** `VITE_PUBLIC_BUILD_SHA` (first 7 chars) in `__root.tsx`.
6. **Accessibility.** `@axe-core/playwright` per route. WCAG AA.
7. **Bundle budget.** ≤250 kB gzipped main, ≤100 kB per route chunk. CI gate. As slice count grows, route-level code-splitting via TanStack Router lazy routes becomes mandatory for PR-9..13.
8. **Local dev.** Vite proxy `/api/*` + `/sso/*` + `/oauth/*` → `localhost:8080`.
9. **Streaming.** Two SSE endpoints: `/runs/:runId/stream` (agent runs) and `/workflow-runs/:runId/stream` (workflow runs). Both share `streamKernelSSE` infrastructure + `parseSseStream` client.
10. **Deferred to P3+.** Light/dark theme, i18n, visual regression, Storybook, playground chat history persistence beyond the page session, evals / scorers / datasets, MCPs, prompt blocks, processors, embedders, voice, CMS, schedules, code-editor for tool authoring.

---

## 20. Test strategy

Per existing spec §8 plus:

- **Backend factories** — TDD per CLAUDE.md `platform/*` rule. Integration tests with real Postgres.
- **SDK methods** — MSW-recorded fixtures per method.
- **Studio components** — Vitest + RTL + MSW. Co-located. No `@seta/*` mocking.
- **Workflow graph** — DOM-level tests for layout determinism (snapshot of `<svg>` shape).
- **JsonSchemaForm** — round-trip tests (schema → form → submit → validates).
- **E2E** — Playwright at `/tests/e2e/studio/`. Full dockerized stack. One spec per slice.
- **Accessibility** — `@axe-core/playwright` per route.
- **Bundle size** — CI gate per PR.
- **No live model APIs in CI** — per CLAUDE.md.

---

## 21. Boundaries & constraints

- `@seta/sso` → `platform/sso/`. No imports from `modules/*` or `apps/*`.
- All Studio HTTP through `AgentClient`. No raw `fetch`.
- `apps/studio` imports allowed: `@seta/agent-sdk`, `@seta/ui`, `@seta/connector-registry` (type-only), `@seta/sso` (type-only). Forbidden: every server-only package.
- `localStorage` for `seta:sidebar:collapsed` + `seta:agent-panel:open` only.
- `window.location.href` for OAuth consent redirect only.
- Auth gradient on `/login` only.
- Lucide: named imports only.
- New external deps in slice PRs (`dagre`, `json-schema-to-zod`, `@tanstack/react-virtual`) pinned at slice-kickoff via `pnpm view`.

---

## 22. Open questions (resolved)

| Question | Decision |
|---|---|
| Standalone primitives wave 1 | Dropped — already shipped in `41be7714`. |
| Standalone primitives wave 2 | Adopted as PR-8 — Tabs, KeyValueList, SectionCard, Searchbar. Slice-specific primitives ride inside their owning slice PR. |
| Backend route ownership | Per-package `createXRoutes()` factories. |
| `@seta/sso` vs `@seta/auth` | Dedicated `@seta/sso`. |
| MVP scope | All nine functional areas. No carve-outs. |
| Sequencing | Backend-first vertical slices. 13 PRs. |
| Mocking strategy | MSW for tests only. Dev uses real `apps/api` via Vite proxy. |
| Mastra parity ceiling | Agents+Playground, Workflows, Tools, Memory, Metrics are in. Evals / Scorers / Datasets / MCPs / Voice / CMS / Prompt blocks etc. are P3+. |
| Workflow chunk types | Extend `KernelChunk` union with `workflow_step_*` variants in `@seta/agent-sdk` (PR-10). |
| Dry-run tools | `ToolDefinition` gains optional `dryRun?: (input) => Promise<unknown>` in PR-11. Tools without it return 405 from `/tools/:id/try`. |

---

## 23. Cross-references

- [`2026-05-15-studio-design.md`](./2026-05-15-studio-design.md) — companion design-language spec.
- [`CLAUDE.md`](../../../CLAUDE.md) — boundary rules.
- [`apps/studio/SCOPE.md`](../../../apps/studio/SCOPE.md) — package contract.
- [`apps/api/src/main.ts`](../../../apps/api/src/main.ts) — composition root.
- [`platform/agent/sdk/SCOPE.md`](../../../platform/agent/sdk/SCOPE.md) — SDK contract.
- [`platform/connector-registry/SCOPE.md`](../../../platform/connector-registry/SCOPE.md) — connector-admin route owner.
- [`platform/oauth/SCOPE.md`](../../../platform/oauth/SCOPE.md) — admin-consent URL builder.
- [`platform/audit/SCOPE.md`](../../../platform/audit/SCOPE.md) — audit query route owner.
- [`platform/agent/rag/SCOPE.md`](../../../platform/agent/rag/SCOPE.md) — RAG ingest route owner.
- Mastra reference: `/Users/canh/Projects/Seta/mastra/packages/playground/src/domains/` — reference patterns for agents, workflows, tools, memory, metrics.
