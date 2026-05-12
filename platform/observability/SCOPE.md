# SCOPE — platform/observability  (@seta/observability)

## Purpose
Process-level observability primitives: a structured pino logger with redaction defaults,
an `AlertSink` fan-out interface, and the OTel SDK dependencies that the app's
`instrumentation.ts` boots via Node 22's `--import`. Vendor-neutral platform primitive —
imported by `@seta/middleware` for request-logger wiring and by owner packages that need to
emit logs or alerts. The OTel SDK init **lives in `apps/api`**, not here (footgun: must
run before any application import; see setup.md §8 "OTel init order").

## Responsibilities
- **Owns:**
  - `createLogger(opts?)` — pino factory with seta-OS defaults: ISO-8601 timestamps,
    `{ service, env }` base bindings, friendly string levels (`"info"` not `30`), and a
    static redact path list covering OAuth tokens, API keys, passwords, DEKs, and well-known
    env-var secrets.
  - `logger` — module-level default logger (`createLogger()` with `LOG_LEVEL` from env).
    Imported as `logger` by `@seta/middleware` and used wherever request-scoped child
    loggers are not yet wired.
  - `AlertSink` interface + `MultiSink` fan-out — fan an alert to N sinks via
    `Promise.allSettled`; per-sink rejections logged via the injected logger but never
    rethrown. The interface owns the alert *contract* (severity + summary + structured
    details + optional `tenantId`/`connectorId`); concrete sinks (Slack, PagerDuty, audit)
    live in their own packages.
  - OTel runtime + SDK + auto-instrumentations + OTLP exporter pinned at the versions
    setup.md §8 mandates. Re-exported transitively to whatever package boots the SDK.
- **Does NOT own:**
  - **OTel SDK initialization.** Per setup.md §8 "OTel init order" and CLAUDE.md "Footguns"
    — `sdk.start()` runs in `apps/api/src/instrumentation.ts`, loaded via `node --import`.
    Anything imported before `sdk.start()` is invisible to traces; centralizing init here
    would be the bug.
  - **Request-scoped child loggers** (`requestLogger(reqId, tenantId)` per setup.md §8).
    That helper belongs to `@seta/middleware`, which wires the per-request child onto
    `c.var.log` and reads tenant id from `@seta/tenant`'s ALS. This package stays
    request-agnostic.
  - **Concrete alert transports** (Slack webhook, PagerDuty, SMTP). Each ships in its own
    package; this package only defines `AlertSink` and the `MultiSink` fan-out.
  - **`pino-opentelemetry-transport` wiring.** setup.md §8 footnote calls for it as a
    prod transport; the current package does not yet pull it in. Decision deferred (see
    Open Questions).
  - **`mixin()` for OTel trace_id correlation in log lines.** setup.md §8:651-659 shows the
    pattern; current `createLogger` does not include it. Adding it requires
    `@opentelemetry/api` at runtime call sites (already a dep) and the SDK actually booted
    (which is an `apps/api` concern). See Open Questions.

## Current state (Epic 1)
Implemented to a smaller surface than setup.md §8 sketches.
- `src/logger.ts` — `createLogger({level?, service?, destination?})` produces a pino
  `Logger` with ISO timestamps, friendly level labels, redaction over a hand-curated path
  list (top-level AND `*.field` variants — comment at `logger.ts:11-17` explains pino's
  `*` is single-level-only, no `**` globbing), `censor: '[REDACTED]'`. Optional
  `destination` is for tests that capture writes. Module-level `logger = createLogger()`
  for callers that don't need their own instance.
- `src/alert-sink.ts` — `AlertSeverity` (`info | warning | critical`), `AlertInput`
  (`severity, summary, details?, tenantId?, connectorId?`), `AlertSink` interface, and
  `MultiSink` class that fans out via `Promise.allSettled` and logs rejections through an
  injected `{ warn(o, msg) }` shape (`logger` from this package is structurally compatible
  but the constructor doesn't depend on it — easier to test in isolation).
- `src/logger.test.ts` — verifies redaction (`access_token`, `refresh_token`, `api_key` →
  `[REDACTED]`; `normal: 'ok'` survives) and friendly level labels.
- `src/alert-sink.test.ts` — verifies (a) fan-out hits every sink, (b) one sink rejecting
  does not block the others, and the injected logger sees the rejection.

Deps include `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-
instrumentations-node`, `@opentelemetry/exporter-trace-otlp-proto`, `pino`, `pino-pretty`,
`uuid` — i.e. setup.md §13 "Observability" deps minus `pino-opentelemetry-transport`. None
of the OTel packages are touched in `src/**` yet; they exist so `apps/api`'s
`instrumentation.ts` can transitively pull them through this workspace dep.

## Public interface
From `src/index.ts`:
- `type Logger` — alias of `pino.Logger`.
- `type CreateLoggerOpts = { level?: LevelWithSilent; service?: string; destination?:
  DestinationStream }`.
- `function createLogger(opts?: CreateLoggerOpts): Logger` — pino factory with redaction
  defaults baked in.
- `const logger: Logger` — module-level default.
- `type AlertSeverity = 'info' | 'warning' | 'critical'`.
- `type AlertInput = { severity; summary; details?; tenantId?; connectorId? }`.
- `interface AlertSink { alert(input: AlertInput): Promise<void> }`.
- `class MultiSink implements AlertSink` — `new MultiSink(sinks, logger?)`.

Planned (setup.md §8 + Phase-1 spike):
- `mixin()` adding `{ trace_id, span_id, trace_flags }` from `trace.getActiveSpan()` —
  setup.md §8:651-659. Pulls `@opentelemetry/api` (already in deps) into runtime path of
  every log call.
- A `requestLogger(reqId, tenantId)` helper for `@seta/middleware` to bind per-request
  children. Could live here or in `@seta/middleware`; setup.md §8:673 places it here
  ("Per-request child logger (Hono middleware in `@seta/middleware` wires this)").
- Optional `pino-opentelemetry-transport` selection when `NODE_ENV === 'production'`
  (setup.md §8:661-670). Currently `createLogger` ignores transports entirely; the prod
  path is a no-op decision.

## Imports
- **Allowed internal:** none. Platform primitive — vendor-neutral, depends on nothing in
  `@seta/*`.
- **Forbidden:**
  - `@seta/middleware` — would invert: middleware imports `logger` from here.
  - `@seta/tenant` — request context belongs at the HTTP seam (middleware), not in the
    logger. Per `07-request-context.md` § "Deliberately avoid", logger reads tenant id
    from the *bound child*, not by reaching into ALS.
  - any `modules/*` — CLAUDE.md "Boundaries": `platform/*` depends on nothing in `modules/`.
- **External (pinned per setup.md §13 "Observability"):**
  - `@opentelemetry/api@1.9.1`, `@opentelemetry/sdk-node@0.217.0`,
    `@opentelemetry/auto-instrumentations-node@0.75.0`,
    `@opentelemetry/exporter-trace-otlp-proto@0.217.0`.
  - `pino@10.3.1`, `pino-pretty@13.1.3`, `uuid@14.0.0`.
  - **Missing vs setup.md §8:680:** `pino-opentelemetry-transport`. Add when the
    `NODE_ENV === 'production'` transport branch is enabled.
  - dev: `vitest@4.1.5`, `tsup@8.5.1`, `typescript@6.0.3`, `@types/node@^24.12.3`,
    `@seta/tsconfig: workspace:*`.

## Patterns to follow
- **Static redact paths only.** `logger.ts:18-47` — pino docs warn against user-controlled
  redact paths (catastrophic backtracking). Top-level AND `*.field` variants because pino's
  `*` matches exactly one level; setup.md §8:642-649 lists the same paths. Cited at
  `logger.ts:11-17`.
- **Friendly level labels.** `formatters.level: (label) => ({ level: label })` — emits
  `"info"` not `30`. setup.md §8:629-631 + `logger.test.ts:22-30` pin this.
- **`MultiSink` swallows per-sink failures.** Alert delivery must be best-effort across
  sinks; one PagerDuty timeout must not block Slack. Logged through an injected logger so
  the `MultiSink` itself stays import-free of `logger` and easier to unit-test
  (`alert-sink.test.ts:18-32`).
- **OTel SDK boots in `apps/api/src/instrumentation.ts` via `--import`.** Setup.md
  §8:682-721 and CLAUDE.md "Footguns" are explicit; this package only re-exports the
  dependencies. Never call `sdk.start()` from this package or from `main.ts`.
- **Service name + env in `base` bindings.** `logger.ts:53` — every log line carries
  `{ service, env }`; defaults to `"seta-os"` + `process.env.NODE_ENV`.
- **Single Vitest leaf config.** `vitest.config.ts` sets only `test.name: "@seta/
  observability"` (CLAUDE.md "Conventions"). Root owns `pool`/`coverage`/`thresholds`/
  `projects`.

## Patterns to avoid
- **Reading `process.env` for service name.** Mostly avoided — `createLogger` only reads
  `LOG_LEVEL`/`NODE_ENV` as ultimate fallbacks. Library code generally consumes a typed
  `env` from `apps/api/src/env.ts` (CLAUDE.md "Schema-driven"). The fallbacks here are
  acceptable because logger may be imported before the env module loads.
- **`console.log`.** CLAUDE.md "Conventions": forbidden outside CLI scripts. Use `logger`
  or a request-scoped child.
- **Mocking pino in tests.** `logger.test.ts` passes a real `destination` with
  `write: (m) => messages.push(JSON.parse(m))` — exercises the real serializer +
  redact pipeline. Mocking pino would hide redact regressions, which are the highest-stakes
  bug class here.
- **Recursive redact globs.** pino has no `**`; a 2-levels-deep secret won't match. Either
  surface the field at top-level / one-deep, or add it explicitly to `REDACT_PATHS`
  (`logger.ts:11-17`).
- **Inflating the logger with DI/context bag features.** `07-request-context.md` §
  "Deliberately avoid": don't grow this into a request-context store. Per-request bindings
  go through `logger.child({...})` at the middleware seam.
- **`sdk.start()` from this package.** setup.md §8:683 — if anything is imported before
  the SDK starts, auto-instrumentation never patches it. The SDK init lives in `apps/api`
  by design.

## Test strategy
- **Unit, co-located.** `src/logger.test.ts` and `src/alert-sink.test.ts` cover the two
  exports' load-bearing behaviors:
  - Logger: redaction works on the listed paths, and level labels are strings not numbers.
  - MultiSink: fan-out hits every sink; one failure does not block others; logger sees the
    rejection.
- **No integration tests.** Both targets are pure in-process; no DB / network surface to
  exercise here. OTel auto-instrumentation correctness is exercised by `apps/api`'s
  smoke test (hit `/health`, see HTTP + Postgres spans in Jaeger — setup.md §8:721).
- Vitest project name: `@seta/observability`. Root config owns the project list per
  CLAUDE.md "Conventions".

## Open questions
- **`mixin()` for trace_id correlation.** setup.md §8:651-659 specifies it; current
  `createLogger` does not include it. Adding it means every log call pays the cost of
  `trace.getActiveSpan()`. Decision: include unconditionally (price is low) or behind a
  `traceContext: true` opt-in in `CreateLoggerOpts`.
- **`pino-opentelemetry-transport` for prod.** setup.md §8:661-670 + §8:680 require it;
  dep is not yet installed. Need to decide whether prod logs flow over OTLP or stay on
  stdout for a sidecar collector.
- **`requestLogger(reqId, tenantId?)` location.** setup.md §8:673 places the helper here;
  Phase-1 `07-request-context.md` keeps `@seta/tenant` as the ALS reader. Pragmatic
  resolution: helper lives in `@seta/middleware` (it knows the Hono `c`), takes a logger +
  ids as args, calls `logger.child(...)`.
- **`alert-sink` integration with `@seta/audit`.** Setup.md §3 splits alerts (operator
  notification) from audit (compliance record). Cross-link: an audit-only sink could ship
  inside `@seta/audit` and be registered into `MultiSink` at boot — but the contract here
  is intentionally transport-agnostic.
- **Sentry coexistence.** setup.md §8:723-768 — if Sentry is enabled, `Sentry.init({
  skipOpenTelemetrySetup: true })` and processors attach to the NodeSDK. None of this is
  wired today; decision is deferred to whenever `SENTRY_DSN` is set in an env.
