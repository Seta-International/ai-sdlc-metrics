# SCOPE — platform/connector-registry  (@seta/connector-registry)

## Purpose

Vendor-neutral runtime registry of `ConnectorDefinition` manifests + a consent gate. Every Graph (or future external-system) call path must (a) be exposed by a registered connector and (b) satisfy `requireConsent(tenantId, connectorId)` before the call. The registry is the canonical place to compute scope unions across enabled connectors for admin-consent URLs (setup.md §4 admin-consent block `docs/setup.md:201`) and to ensure connectors stay vendor-decoupled from the auth and tenant layers. Composition root (`apps/api/src/main.ts`) injects the tenant-aware consent check; this package itself stays vendor-neutral per CLAUDE.md "platform/* is vendor-neutral."

## Responsibilities

- **Owns:**
  - The `ConnectorDefinition` type — manifest shape every `modules/connectors/<vendor>` package exports.
  - The runtime `ConnectorRegistry` interface and its in-memory implementation (`Map<id, def>`).
  - Scope-union math across an arbitrary list of connector ids (delegated + application, deduped) — feeds the admin-consent URL builder in `@seta/oauth`.
  - The consent-gate seam: `requireConsent(tenantId, connectorId)` throws `ConnectorNotConsented` (HTTP 403 via `DomainError`); unknown ids throw `ConnectorUnknown` (HTTP 400).
  - `DomainError` subclasses for the two failure modes so the `@seta/middleware` RFC 7807 mapper renders consistent responses.
- **Does NOT own:**
  - The `tenant_connectors` table — that's owned by `@seta/tenancy` (setup.md §3 schema list, `docs/setup.md:111`). The composition root passes a `RequireConsentFn` that queries it.
  - Vendor-specific manifests or scopes — each connector exports its own `ConnectorDefinition` (`modules/connectors/<vendor>/src/manifest.ts`); registry only stores them.
  - Admin-consent URL construction — `@seta/oauth` builds `https://login.microsoftonline.com/<…>/v2.0/adminconsent?…&scope=https://graph.microsoft.com/.default…` (setup.md §4 `docs/setup.md:201`). Registry only supplies the scope union as a sanity-check input.
  - Token acquisition, KMS, or any OAuth state. Those are `@seta/oauth`.
  - MCP-protocol exposure of tools or connectors — setup.md §11 keeps the P1 surface to Teams + REST; MCP is P2-deferred (Phase-1 report `docs/explorations/2026-05-12-mastra-spike/04-tools-mcp.md` "Punch list" item).
  - Auto-discovery / plugin-loader. CLAUDE.md: "No DI containers, plugin loaders, or runtime discovery." `apps/api/src/main.ts` registers connectors by explicit `register()` calls.

## Current state (Epic 1)

Implemented and unit-tested. Cite files:

- `platform/connector-registry/src/types.ts` — `ConnectorDefinition` (id, providerId, displayName, description, customerFacingRationale, `requiredScopes: { delegated; application }`, `capabilities: { syncable; writes }`) and `ConnectorRegistry` (`register`, `get`, `list`, `listByProvider`, `scopeUnion`, `requireConsent`).
- `platform/connector-registry/src/runtime.ts` — `createConnectorRegistry(consentCheck?)` factory with in-memory `Map`, plus `ConnectorNotConsented` (403) and `ConnectorUnknown` (400) extending `@seta/middleware.DomainError`. `RequireConsentFn` type is the injection seam.
- `platform/connector-registry/src/runtime.test.ts` — register/get, unknown-id error, scope union dedupe across two stub connectors (Planner + Directory), `listByProvider` filter, injected-consent-check pass/fail, missing-injection error.
- `platform/connector-registry/src/index.ts` — public surface (see below).

`ConnectorDefinition` is currently a plain TS type, not Zod-derived; the Phase-1 schema-compat report (`08-schema-compat.md`) suggests a future Zod schema, but Epic 1 ships with the TS-type-only shape since no untrusted boundary parses a manifest at runtime.

## Public interface

- `type ConnectorDefinition` — manifest shape: `id`, `providerId`, `displayName`, `description`, `customerFacingRationale`, `requiredScopes.{delegated,application}: string[]`, `capabilities.{syncable,writes}: boolean`.
- `interface ConnectorRegistry`:
  - `register(def: ConnectorDefinition): void` — throws if id already registered.
  - `get(id): ConnectorDefinition` — throws `ConnectorUnknown` on miss.
  - `list(): ConnectorDefinition[]`
  - `listByProvider(providerId): ConnectorDefinition[]`
  - `scopeUnion(connectorIds: string[]): { delegated: string[]; application: string[] }` — deduped union.
  - `requireConsent(tenantId, connectorId): Promise<void>` — throws `ConnectorNotConsented` if the injected check returns `false`.
- `type RequireConsentFn = (tenantId: string, connectorId: string) => Promise<boolean>` — injection seam; composition root binds it to a query against `tenant.tenant_connectors`.
- `function createConnectorRegistry(consentCheck?: RequireConsentFn): ConnectorRegistry` — factory; calling `requireConsent` without `consentCheck` throws a config-time error.
- `class ConnectorNotConsented extends DomainError` — HTTP 403 with `detail: "tenant <tid> has not consented to connector <cid>"`.
- `class ConnectorUnknown extends DomainError` — HTTP 400 with `detail: "no connector registered with id '<cid>'"`.

## Imports

- **Allowed internal:** `@seta/middleware` (for `DomainError` — CLAUDE.md "Errors" rule mandates this base class for RFC 7807 mapping).
- **Forbidden:**
  - `@seta/db`, `@seta/tenancy` — registry stays vendor-neutral; the consent-check function is injected, not imported. Pulling `@seta/db` here would force every test to mock or use a real Postgres pool.
  - `@seta/oauth` — wrong direction; `@seta/oauth` *depends on* `@seta/connector-registry` (setup.md §13 `docs/setup.md:1790`).
  - `@seta/ms-graph`, any `@seta/connector-*` — same direction.
  - `modules/*`, `apps/*` — CLAUDE.md "platform/* depends on nothing in modules/ or apps/".
- **External (pinned per setup.md §13, `docs/setup.md:1766-1770`):**
  - `zod@4.4.3` (held available; not yet load-bearing in Epic 1 — `ConnectorDefinition` is a TS type today, but Phase-1 `08-schema-compat.md` and `04-tools-mcp.md` flag a future Zod variant for tool-exposure boundaries).

## Patterns to follow

- **Single explicit registry, no plugin loader.** Each connector exports a `connector: ConnectorDefinition`; `apps/api/src/main.ts` calls `registry.register(plannerConnector); registry.register(directoryConnector)`. CLAUDE.md "Every `modules/*` package … `apps/api/src/main.ts` owns mount prefixes and the connector registration list — it's the only registry. No DI containers, plugin loaders, or runtime discovery."
- **Consent gate before any external call.** CLAUDE.md "Connector consent: every Graph call path must first satisfy `connectorRegistry.requireConsent(tenantId, '<connector-id>')`." The connector module makes the call; this package only supplies the gate.
- **Injection for tenant-aware queries.** `createConnectorRegistry(consentCheck)` keeps `@seta/db` and `@seta/tenancy` out of this package — see `platform/connector-registry/src/runtime.ts` factory comment ("the composition root wires a fn that queries tenant_connectors").
- **Error subclasses extend `DomainError`.** CLAUDE.md "Errors: throw `DomainError` subclasses from `@seta/middleware/errors`; mapped to RFC 7807." See `ConnectorNotConsented` / `ConnectorUnknown` in `runtime.ts`.
- **Scope union via `Set` dedup.** `runtime.ts.scopeUnion` already does this — same pattern any future "all-scopes for tenant X" UI helper should use.
- **`ConnectorDefinition.capabilities` flags drive higher-layer behavior** (e.g. only `syncable` connectors get a sync worker; only `writes` connectors expose `.commit` tools). Phase-1 `04-tools-mcp.md` Punch List notes that MCP annotation propagation (`readOnlyHint` / `destructiveHint`) should derive from these flags in the eventual MCP layer (P2-deferred).

## Patterns to avoid

- **Do not import `@seta/db` or `@seta/tenancy` here.** Phase-1 `07-request-context.md` Delta: "DI/RequestContext conflation — Mastra uses RequestContext as a DI bag. Don't." Keep the registry strictly about manifests + a callable consent seam.
- **Do not auto-discover connectors via filesystem globs or plugin loaders.** CLAUDE.md "No DI containers, plugin loaders, or runtime discovery." The setup.md "one registry in `main.ts`" rule is mirrored in `04-tools-mcp.md` "Avoid: agent-as-tool and workflow-as-tool auto-conversion — too clever; explicit registration in `apps/api/src/main.ts`."
- **Do not expose the registry over MCP in P1.** `04-tools-mcp.md` P2-defer: "MCP server exposure of seta tools. Reason: P1 surface is Teams + REST only (`setup.md:1012`); MCP would force JSON-Schema generation, annotation curation, and auth-bridge work without a P1 consumer."
- **Do not build the admin-consent URL here.** Setup.md §4 (`docs/setup.md:201`): the dedicated `/adminconsent` URL plus `scope=https://graph.microsoft.com/.default` lives in `@seta/oauth`. The registry only supplies the scope-union as a sanity check.
- **No mutability after registration beyond `register`.** Re-registering an id throws (already implemented at `runtime.ts:29`); don't add `unregister` or `replace` without an ADR — connectors are static for a process lifetime per CLAUDE.md "explicit registration."
- **Do not gate consent inline on a hard-coded list.** The `consentCheck` injection is mandatory at the call site; throwing "consentCheck not configured" is the desired failure mode (already in `runtime.ts:54`).

## Test strategy

- **Unit (co-located, `src/runtime.test.ts`, already passing):**
  - `register` + `get` round-trips a definition.
  - `get` throws `ConnectorUnknown` for missing id.
  - `scopeUnion` dedupes across multiple connectors (both delegated and application sets).
  - `listByProvider` filters correctly (e.g. `entra` vs `google`).
  - `requireConsent` resolves when the injected check returns `true`, throws `ConnectorNotConsented` when `false`.
  - `requireConsent` without an injected check throws a config-time error.
- **Integration:** none in this package — the `tenant_connectors` query lives in `apps/api` composition, where an integration test asserts an end-to-end "tenant without consent → 403" path.
- **Mocking policy:** never mock `@seta/middleware` (CLAUDE.md "never mock internal `@seta/*` modules"); use real `DomainError`. The consent check is *not* a mock — it's a real injection seam.

## Open questions

- **Should `ConnectorDefinition` migrate to a Zod schema?** `08-schema-compat.md` Phase-1 punch list argues for Zod 4 everywhere with Standard Schema as the cross-package contract. For manifests authored in TypeScript inside our own monorepo, Zod adds little; for third-party / dynamic registration (P3?), Zod is required. Default: keep TS type until a P2 dynamic-registration use-case lands.
- **Should the registry know about MCP `annotations`?** `04-tools-mcp.md` Punch List wants `readOnlyHint`/`destructiveHint`/`idempotentHint` propagated to a future MCP layer. Connector-level annotations (read-only connector vs. write-capable) could live on `ConnectorDefinition.capabilities` — but per-tool annotations belong with the tool, not the connector. Decide when MCP exposure (P2) is in scope.
- **Per-connector enable-by-default vs explicit-opt-in.** Today `requireConsent` consults `tenant_connectors`; a row's presence == enabled. If we add Studio admin UI, do new tenants get every connector enabled or none? Out of scope for this package, but the API shape needs to support both.
- **Scope-union granularity.** Today it's `delegated`/`application` flat sets. If two connectors disagree on the same scope's *purpose* (one read-only, one write), the union loses that distinction. Acceptable for admin consent (`.default` covers everything declared in the App Registration), but flagged for the Studio "what does this connector access" surface.
