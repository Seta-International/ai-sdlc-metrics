# Mastra Spike — Foundation Design

**Date:** 2026-05-12
**Status:** Approved (brainstorm) → ready for implementation plan
**Driver:** seta-os P1 foundation bootstrap, informed by reading the Mastra OSS project.

---

## Background

`seta-os` (this repo) is a multi-tenant agent platform monorepo. The full P1 spec is `docs/setup.md` (~2400 lines): pnpm + Turborepo + Hono + Drizzle + Postgres RLS, kernel-first agent runtime (`@seta/agent-core`), MS Teams + MS365 Planner connectors, OpenAI + Anthropic SDKs used directly. Setup.md §10 lists explicit non-picks (LangChain, Vercel AI SDK, NestJS, etc.) but does **not** list Mastra.

Mastra (`mastra`) is a sibling OSS project — a TypeScript AI framework with agents, workflows, model routing, memory, RAG, MCP, evals, and a sizable working monorepo. It is **not** being adopted at runtime by seta-os; setup.md's kernel-first stance stays intact.

The spike's value: **cross-check setup.md's choices against a working 2026 monorepo, and produce per-package scope documents that give future implementing agents full context to build each P1 package without re-reading Mastra or all of setup.md.**

---

## Goal

Pattern extraction (not adoption). The deliverable is two coordinated artifacts in a single PR:

1. **Nine Mastra-comparison research reports** at `docs/explorations/2026-05-12-mastra-spike/` — inputs.
2. **Per-package `SCOPE.md`** co-located with each of the 18 P1 package skeletons — the shipped output that future implementing agents read.

Plus the bare working skeleton (root configs, package stubs, bootable `apps/api`) so the configs the spike recommends are verified against `pnpm install && pnpm typecheck && pnpm lint` before the PR opens.

---

## Non-goals

- Adopting Mastra at runtime, or revisiting the kernel-first decision in setup.md §10.
- Implementing any `@seta/*` package internals.
- Amending `docs/setup.md`. The reports surface a punch list of recommended amendments; those land in follow-up PRs once reviewed.
- Setting up `release.yml`, OSS-flip prep, examples, or per-package `tsup.config.ts`. All deferred per setup.md §9 timing.

---

## § 1 — Overall structure & artifacts

**Artifact 1 — Spike reports (Phase 1 output).** Nine markdown files plus an index, written by nine parallel subagents:

```
docs/explorations/2026-05-12-mastra-spike/
├── README.md                       # index, TL;DR per file, consolidated punch list (I write after Phase 1)
├── 01-monorepo-build-test.md
├── 02-agent-core.md
├── 03-run-loop.md
├── 04-tools-mcp.md
├── 05-workflows.md
├── 06-llm-recording-replay.md
├── 07-request-context.md
├── 08-schema-compat.md
├── 09-memory.md
└── 10-llm-model-router.md
```

Each file follows the same four-H2 shape: *What Mastra does → What setup.md plans → Delta → Punch list*. Targets ~400–600 words each.

**Artifact 2 — Repo skeleton + per-package `SCOPE.md` (Phase 2 + Phase 3 output).** Root configs verbatim from setup.md §12, plus an empty stub for every P1 package in setup.md §11 (18 packages), each containing a `SCOPE.md` written by Phase 2.

A single PR contains both artifacts. The skeleton is the credibility check on the reports — if the proposed configs don't `pnpm install/typecheck/lint` cleanly on the empty workspace, the reports' recommendations are unverified.

**Location choice.** Reports live at `docs/explorations/` not `docs/superpowers/specs/`: setup.md is already the design spec, the spike is a research note that cross-checks it.

---

## § 2 — Phase 1: nine parallel subagents produce the spike reports

**Shared brief template** every subagent receives (self-contained — they have no conversation context):

> You are doing a research spike for the `seta-os` project (path: `seta-os`), a multi-tenant agent platform monorepo. The full P1 spec is `docs/setup.md` (~2400 lines). You are reading the Mastra OSS project at `mastra` to extract patterns that should inform seta-os's foundation. **Do not modify any files in either repo except to write your one output file.** Do not run install/build commands. Do not write `@seta/*` code.
>
> **Output**: a single markdown file at `seta-os/docs/explorations/2026-05-12-mastra-spike/<NN>-<topic>.md`, structured as four H2 sections:
> 1. **What Mastra does** — annotated with `file_path:line_number` refs.
> 2. **What setup.md plans** — quoted excerpts from the listed setup.md sections.
> 3. **Delta** — patterns to fold in, patterns to deliberately avoid, open questions.
> 4. **Punch list** — bullets with `setup.md §X: <specific edit>` OR `@seta/agent-core: <hook to leave>` OR `P2-defer: <reason>`.
>
> Target length: `<word budget>`. Use `file_path:line_number` references so readers can jump. Do not invent paths — if you can't find a Mastra file, say so.

**Per-subagent scope:**

| # | Output file | Mastra paths to read | setup.md sections | Words |
|---|---|---|---|---|
| 01 | `01-monorepo-build-test.md` | root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.{json,build.json}`, `vitest.config.ts`, `eslint.config.js`, `lint-staged.config.js`, `packages/core/{tsup.config.ts,turbo.json,package.json}`, root `.npmrc` if present, pnpm catalog usage | §1, §12 | 500 |
| 02 | `02-agent-core.md` | `packages/core/src/{agent,llm,_types,base.ts,mastra,processors,hooks,error}/` (+ `di/` for divergence note). **Scope:** Agent class surface + per-provider model *adapters* + message normalization + processors/hooks + DomainError shape + DI divergence. **Do NOT cover provider selection / cross-provider tool-call normalization / token counting / retry-fallback** — those belong to SA-10. | §5, §15 (errors), CLAUDE.md (no-DI rule) | 600 |
| 03 | `03-run-loop.md` | `packages/core/src/{loop,stream,run}/` + streaming bits of `packages/core/src/llm/` | §5 (`streamKernelSSE`, abort wiring, Anthropic prompt cache) | 600 |
| 04 | `04-tools-mcp.md` | `packages/core/src/{action,mcp}/`, `packages/mcp/`, `packages/mcp-docs-server/` | §11 `modules/products/agent/tools/` + preview/commit pattern, §3 `agent.write_continuations` | 500 |
| 05 | `05-workflows.md` | `workflows/` (top-level), `packages/core/src/run/` (suspend/resume) | none — explicitly flag as a setup.md gap | 500 |
| 06 | `06-llm-recording-replay.md` | `packages/_llm-recorder/`, `packages/core/src/{test-utils,harness}/` | §5 testkit footnote, RECORD=1 env-var pattern (Commands table in setup.md) | 500 |
| 07 | `07-request-context.md` | `packages/core/src/request-context/` (+ `di/` intersection) | §3 tenant context + `withTenant` + AsyncLocalStorage footgun | 400 |
| 08 | `08-schema-compat.md` | `packages/schema-compat/`, `packages/core/src/schema/` | §2 Zod 4 + `@hono/zod-openapi` open question, Standard Schema v1 note | 400 |
| 09 | `09-memory.md` | `packages/memory/`, `packages/core/src/{memory,storage}/`, `stores/` (high-level only) | §3 (agent schema future), §6 (P2 RAG primitives) | 500 |
| 10 | `10-llm-model-router.md` | `packages/core/src/llm/` (router/selection/normalization parts), any `packages/*model-router*` or `packages/*provider*` paths if present. **Scope:** provider selection from agent config, cross-provider tool-call shape normalization (OpenAI `tools` vs Anthropic `tools` differ), token counting integration with `js-tiktoken`, retry/fallback policy, response caching (distinct from Anthropic prompt caching). | §5 (`ModelStream<TChunk>` interface, `.stream()` helpers, Anthropic prompt caching note, js-tiktoken pin), §11 (`cfg.model` in `modules/products/agent`), §13 (kernel deps) | 600 |

Total: ~5100 words across the 10 files + a ~500-word README I write after.

**Spawning.** One message containing ten `Agent` tool uses with `subagent_type: "general-purpose"` (Phase 1 agents must write files; `Explore` is read-only and cannot Write).

---

## § 3 — Phase 2: six parallel subagents produce per-package `SCOPE.md`

Phase 2 runs **after** Phase 1 completes — scope writers consume Phase 1 reports.

**`SCOPE.md` template** (no code bodies — contract level only):

```markdown
# SCOPE — <package>  (@seta/<name>)

## Purpose
One paragraph: what this package does and why it exists.

## Responsibilities
- Owns: <bullets>
- Does NOT own: <boundary bullets — keeps adjacent packages clean>

## Public interface
Named exports (types, functions, classes) with one-line descriptions and minimal signatures where the contract requires it. No bodies.

## Imports
- Allowed internal: <@seta/* list>
- Forbidden: <@seta/* list, with reason>
- External (pinned): <list per setup.md §1–8>

## Patterns to follow
Cross-refs to Mastra patterns (link to spike report sections) and setup.md sections that apply.

## Patterns to avoid
Specific anti-patterns (e.g., "no DI container — see 02-agent-core.md § DI divergence").

## Test strategy
Unit/integration split, LLM fixture usage (→ 06-llm-recording-replay.md).

## Open questions
Anything the spike flagged that needs a decision before implementation.
```

**Six scope-writer subagents, grouped by 18 P1 packages:**

| Subagent | Packages |
|---|---|
| SW-1 Foundation infra (4) | `platform/tsconfig`, `platform/db`, `platform/observability`, `platform/middleware` |
| SW-2 Tenancy/auth (3) | `platform/tenant`, `platform/auth`, `platform/oauth` |
| SW-3 External integration (4) | `platform/ms-graph`, `platform/connector-registry`, `platform/directory`, `platform/audit` |
| SW-4 Agent runtime (2) | `platform/agent/core`, `platform/agent/sdk` |
| SW-5 Modules (4) | `modules/channels/teams`, `modules/connectors/ms365-planner`, `modules/connectors/ms365-directory`, `modules/products/agent` |
| SW-6 App (1) | `apps/api` |

Each scope-writer's brief lists which Phase-1 reports it must reference, which setup.md sections apply, and the package paths to write to (e.g., `platform/agent/core/SCOPE.md`).

**Constraints on scope writers.**

- No code bodies. Signatures only where the contract requires pinning (e.g., `export function withTenant<T>(tenantId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T>` is fine; full impl is not).
- Every "Pattern to follow" / "Pattern to avoid" must cite a Phase-1 report section or a setup.md section by number. No unsourced claims.
- "Imports" section lists allowed/forbidden according to CLAUDE.md boundary rules + setup.md §11 dependency direction.

---

## § 4 — Phase 3: I bootstrap the skeleton

### Root files (verbatim from setup.md §12 unless a Phase-1 punch list dictates otherwise)

```
/
├── package.json                    # root, "private": true, scripts per §12
├── pnpm-workspace.yaml             # §12
├── .npmrc                          # §12
├── turbo.json                      # §12
├── biome.json                      # §12
├── tsconfig.base.json              # §12
├── vitest.config.ts                # §12 (Vitest 4 `projects` API)
├── lefthook.yml                    # §12
├── docker-compose.yml              # §12
├── .gitignore                      # node_modules, dist, .turbo, coverage, .tsbuildinfo
├── .nvmrc                          # 24
├── .env.example                    # mirror of apps/api/src/env.ts schema, no real secrets
└── README.md                       # project intro + "see docs/setup.md"
```

### Per-package stubs (all 18 P1 packages)

Each package gets:

```
<package>/
├── package.json                    # name, version 0.0.0, type module, deps from §1–8 pins
├── tsconfig.json                   # extends ../tsconfig/node.json (or base for non-node)
├── src/index.ts                    # one-line: `export {}`
├── README.md                       # one paragraph + link to SCOPE.md
└── SCOPE.md                        # written in Phase 2
```

Eight owner packages (per setup.md §3 schema list) additionally get `drizzle.config.ts` + empty `migrations/` + empty `src/schema.ts`: `@seta/auth`, `@seta/tenant`, `@seta/directory`, `@seta/oauth`, `@seta/audit`, `@seta/connector-ms365-directory`, `@seta/connector-ms365-planner`, `@seta/agent` (product).

### Infra

```
infra/
├── postgres/init.sql               # pgvector + pg_trgm extensions; CREATE ROLE platform_admin WITH LOGIN BYPASSRLS; CREATE ROLE tenant_user
└── otel-collector.yaml             # referenced by docker-compose
```

### Tooling stubs (exit-0)

```
tooling/scripts/
├── check-public-private.ts
├── check-no-manual-pkg-edit.ts
├── new-package.ts
└── verify-versions.ts
```

Real implementations are follow-up tasks; stubs let CI reference them per setup.md.

### apps/api skeleton (slightly fuller — must boot)

```
apps/api/
├── package.json
├── tsconfig.json
├── src/
│   ├── env.ts                      # exact code from setup.md §12
│   ├── instrumentation.ts          # minimal OTel SDK init per §8 — no Sentry
│   └── main.ts                     # Hono app, GET /healthz → 200, SIGTERM shutdown per §11
├── README.md
└── SCOPE.md
```

### CI workflow (in-PR)

`.github/workflows/ci.yml` per setup.md §12 — without integration/e2e jobs (no test files yet). Lint + typecheck + install. `release.yml` deferred until first publish.

### Validation gates (must all pass before opening the PR)

1. **Install clean** — `pnpm install` produces `pnpm-lock.yaml` with zero `ERR_PNPM_PEER_DEP_ISSUES`, zero unresolved workspace links. `strict-peer-dependencies=true` from `.npmrc` makes this a real check.
2. **Typecheck clean** — `pnpm turbo run typecheck` passes across all 18 packages.
3. **Lint clean** — `pnpm lint` (Biome) passes; `pnpm tooling/scripts/check-public-private.ts` and `check-no-manual-pkg-edit.ts` pass (exit-0 stubs).
4. **Boot smoke** — `docker compose up -d pg jaeger otel-collector`, then `pnpm --filter @seta/api dev`, then `curl http://localhost:8080/healthz` returns 200. SIGTERM the process; confirm it exits 0 within 2s. Confirms `tsx --import instrumentation.ts` ordering works (setup.md §8 footgun).

Failures fixed in-place — no skip-flags.

**Out of scope for skeleton validation:** running migrations (no real schemas yet), integration tests (no test files yet), `pnpm build` (no real source yet).

---

## § 5 — Commit / PR plan

**Branching.** New branch `spike/mastra-foundation` off `main`. PR title: `spike: mastra-derived foundation + per-package SCOPE.md`. Single PR per CLAUDE.md "one change, one PR."

**Commit sequence:**

1. `chore(repo): bootstrap pnpm workspace + root configs`
2. `chore(infra): docker-compose + postgres init + otel-collector config`
3. `chore(tooling): stub CI scripts (exit-0)`
4. `chore(platform): package stubs` — 13 platform packages; owners include drizzle.config.ts + empty migrations/.
5. `chore(modules): package stubs` — 4 module packages.
6. `chore(apps): apps/api skeleton` — env.ts, instrumentation.ts, main.ts with healthz + SIGTERM.
7. `docs(explorations): mastra spike reports` — the 9 `0N-*.md` files + README (Phase 1 output).
8. `docs(scopes): per-package SCOPE.md` — Phase 2 output, one commit covering all 18 SCOPE.md files.
9. `ci: pnpm install/typecheck/lint workflow` — `.github/workflows/ci.yml`. Defers `release.yml`.

**PR body.** Lists Artifact 1 and Artifact 2 with bullet pointers; calls out **non-trivial deltas to setup.md the reports recommend** so reviewers can decide merge-as-is vs amend-setup.md-first; reports the four validation-gate results.

**Changesets.** None — all packages are `"private": true` until they have publishable code. The first `@seta/agent-core` PR carries its own changeset.

**What this PR is not.** Not an implementation of any `@seta/*` package. Not a setup.md amendment (follow-up PRs). Not an OSS-flip-prep PR (P1 close-out per setup.md §9).

---

## Subagent inventory

| Phase | Count | Type | Parallel? |
|---|---|---|---|
| Phase 1 (spike reports) | 10 | `general-purpose` | Yes — single message, ten `Agent` calls |
| Phase 2 (SCOPE.md writers) | 6 | `general-purpose` | Yes — single message, six `Agent` calls, after Phase 1 |
| Phase 3 (skeleton + validation + README) | 0 (main agent) | n/a | Sequential after Phase 2 |

Wall-clock dominated by `max(Phase 1 longest agent) + max(Phase 2 longest agent) + Phase 3`. Roughly 1.5 days end-to-end at the deep-read scope agreed in approach B.

---

## Open questions

- **Phase-1 punch lists may surface setup.md amendments before Phase 3 writes the skeleton.** If a report recommends, e.g., a different `turbo.json` `outputs` glob, do I apply it in the skeleton (and note the divergence from setup.md §12 in the PR body) or stick strictly to setup.md §12 and let the amendment land in a follow-up PR? **Default proposal: apply in skeleton, note in PR body, queue setup.md amendment as a follow-up.** Reviewer can revert in-PR if they disagree.
- **`tsup.config.ts` per package.** Setup.md §1 pins tsup but doesn't show a config in §12. Deferring per-package tsup configs until packages have real source. No spec change needed — flagged for the implementing-agent's awareness via SCOPE.md.
- **Per-package `vitest.config.ts`.** Setup.md §12 shows the leaf shape (just `name` override). Stub at Phase 3 or defer until tests exist? **Default: stub now**, so `pnpm test:unit` from the root resolves cleanly.
