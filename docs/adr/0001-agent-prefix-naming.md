# ADR 0001 — `agent-` prefix reserved for agent runtime/API packages

- Status: Accepted
- Date: 2026-05-11
- Deciders: Platform team

## Context

The monorepo houses two kinds of packages: those that are specifically about the agent runtime and API surface (kernel, SDK, RAG primitives), and shared infrastructure that is reusable across agents and future ERP modules. A naming convention is needed to keep this distinction obvious from the package list.

## Decision

The `agent-` prefix is reserved for packages whose scope is uniquely the agent runtime or API surface. These packages live under `platform/agent/*` (e.g. `@seta/agent-core`, `@seta/agent-sdk`, `@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`, `@seta/agent-rag`).

Shared infrastructure packages stay unprefixed (`@seta/db`, `@seta/auth`, `@seta/middleware`, `@seta/observability`, …).

The `pnpm new:package` scaffolder enforces this: a `platform` kind cannot use the `agent-` prefix; only `platform-agent` kinds can.

## Consequences

- Adding a new shared infra package: do NOT use the `agent-` prefix.
- Future ERP modules under `modules/products/*` and channels under `modules/channels/*` never use the `agent-` prefix; they are products and adapters, not the agent runtime.

See spec §11 ("Naming rule") for the canonical statement.
