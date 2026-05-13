---
"@seta/agent-workflows": minor
---

W1: initial package — typed workflow DSL (`createWorkflow`, `defineStep`,
`.then`/`.parallel`/`.commit`) with an in-memory runner.

- Strictly-typed builder mirroring Mastra's chained-step generics: step
  output types flow into the next step's input at compile time;
  `.parallel([a, b]).then(c)` requires `c.inputSchema` to accept
  `{ [a.id]: AOut; [b.id]: BOut }`. Step ids are preserved as literal
  types.
- Production-ready cancellation: `wf.run(input, { signal })` accepts an
  external `AbortSignal`; an internal `AbortController` chains to it.
  `ctx.signal` is threaded into every step body. `.parallel()` first
  rejection aborts a sub-controller; siblings observe
  `ctx.signal.aborted` and bail cooperatively (steps that ignore the
  signal still complete in the background — standard Node AbortSignal
  contract).
- Multi-tenant: `tenantContext.run({ tenantId }, ...)` wraps every step
  body (sequential and parallel). Run rejects with `WorkflowError` if
  invoked outside a tenant context.
- One OTel span per step (parent = run span); attributes include
  `step.id`, `step.workflow.id`, `step.run.id`, `tenant.id`, and
  `step.input.hash` (SHA-256 of JSON input).
- `WorkflowError` extends `DomainError` for RFC 7807 mapping at the HTTP
  edge. Subclasses: `WorkflowBuildError`, `StepInputValidationError`,
  `StepOutputValidationError`, `StepExecutionError`, `WorkflowBailed`.
- `ctx.bail()` rejects the run with `WorkflowBailed` (explicit early
  termination signal).

Out of scope for W1 (deferred to W2): Postgres schema + migrations,
durable snapshots, advisory-lock resume, HITL `ctx.suspend()`,
`workflow.resume()`, `p-queue` runner, per-step retry, `@seta/audit`
integration, integration tests.
