# Hackathon participant docs — design

## Context

Seta International is running the **Agentic AI Hackathon 2026** (`docs/hackathon/Challenge Brief.docx`). University students (3rd/4th-year, AI/CS-related majors, mixed primary languages) form 3–5 person teams. Round 2 (1 week) is proposal; Round 3 (2 weeks) is execution. Each team draws one of three business domains — **Talent Acquisition**, **PMO**, or **Employee Management** — and ships a Proof-of-Concept agent that solves a real internal workflow problem.

Per the brief §7, the Organizing Committee gives teams a **Technical Guide** explaining "SETA Future architecture, backend module structure, frontend zone structure, AI agent integration, testing standards, and submission expectations" plus a **Codebase**, **Sample Data**, and a **Submission Template**, all released after Round 1.

This spec covers the participant-facing documents that live under `docs/hackathon/`. It does **not** cover organizer-facing materials (planning checklists, judge briefings, infra provisioning).

## Goals

1. A team that has cleared Round 1 can clone the repo, follow `quickstart.md`, and have a streaming agent response in their terminal in under 30 minutes — without needing an MS365 tenant, MS Graph permissions, or a paid LLM key beyond what organizers pre-distribute.
2. By the end of `build-your-agent.md`, the team has a single agent definition with at least one tool, exposed over HTTP/SSE from `apps/api`, demoable via a minimal static chat page.
3. The docs assume teams **design their own agent contract** (the brief judges this on 35%). We give primitives and patterns, not pre-built BDI/memory-tier scaffolding.
4. The docs match the actual surface of the `@seta/agent-*` packages as merged at the time of Round 2 release. No aspirational APIs.
5. Every package in `platform/agent/*` is reachable from the docs — `agent-core`, `agent-sdk`, `agent-memory`, `agent-workflows`, `agent-chunking`, `agent-embeddings`, `agent-vector`, `agent-rag`. Common primitives are on the critical path; opt-in primitives (memory beyond stateless turns, workflows, RAG) live behind clear "do you need this?" decisions.

## Non-goals

- Theory pages on multi-agent topology, BDI architecture, or memory-tier taxonomy. Teams design their own; the rubric explainer in `submission.md` notes which of our primitives are commonly used to satisfy each criterion.
- A bundled playground UI app (separate Vite SPA). Teams ship their own minimal chat page using the pattern in `build-your-agent.md`.
- Reference-style API documentation. Each `@seta/*` package owns its own `SCOPE.md` with public-interface descriptions; the hackathon docs link to those rather than duplicating.
- Organizer-facing materials (Round-1 screening criteria, judge calibration, prize logistics, infra-provisioning runbooks).

## Constraints

- **`platform/agent/*` packages are `"private": true` today.** v1 documents both an in-monorepo path (primary, simplest) **and** an external-repo path (teams that already have a stack and want to consume `@seta/agent-*` from a fresh repo). The external-repo path requires a publishing mechanism (npm public, GitHub Packages, or git-URL/tarball deps); the chosen mechanism is an open question (see Risks) and the docs must not ship until it is decided.
- **`modules/products/agent`, `modules/channels/teams`, `@seta/agent-sdk`, `@seta/agent-memory`, and `@seta/agent-workflows` are stubs at time of writing.** The K-stream roadmap lands the SDK and at least one example product before Round 2; if any of those aren't merged when docs ship, the affected page must call out the gap explicitly rather than describe an API that doesn't exist.
- **Studio is P2 (placeholder only).** No web admin UI today. Demo surface is the team's own minimal chat page over HTTP/SSE.
- **No real MS365 tenant.** Teams cannot reasonably acquire MS Graph admin consent in 3 weeks. The Teams channel and MS365 connectors stay reference-only; the docs do not require teams to use them.
- **Three-week build window.** Every page is optimized for "what does the team need to read *now* to make the next hour of work succeed?" Pages that aren't on that critical path get cut.
- **Multi-tenant from day one** (CLAUDE.md "Scale & multi-tenancy"). The quickstart sets a hardcoded dev tenant id; the docs explain why `tenantContext.getTenantId()` exists and that hackathon code should use it, not pass `tenantId` as a function parameter.

## Architecture

The doc set lives under `docs/hackathon/` as flat Markdown files. No subfolders except `data/` (which gates a separate release after Round 2). The `Challenge Brief.docx` already there stays in place.

```
docs/hackathon/
├── README.md              ← landing: what's where, who reads what, in what order
├── Challenge Brief.docx   ← (already there — the original problem brief)
├── architecture.md        ← monorepo layout, boundaries, request lifecycle, multi-tenancy
├── quickstart.md          ← in-monorepo path: clone → scaffold → first streaming response
├── external-repo.md       ← consume @seta/agent-* from a fresh repo (alternate path)
├── build-your-agent.md    ← define agent, add tools, memory, expose HTTP/SSE, minimal chat page
├── using-rag.md           ← chunk → embed → retrieve, for use cases that need it
├── using-workflows.md     ← multi-step orchestration when the agent loop isn't enough
├── testing.md             ← MSW recordings + integration patterns
├── submission.md          ← submission template + rubric explainer
└── data/
    └── README.md          ← sample-data layout (released after Round 2)
```

**Reading order assumed by the docs:**

1. `README.md` (landing, 5 minutes)
2. `architecture.md` (~15 minutes — read once before writing any code)
3. `quickstart.md` (~30 minutes hands-on) — **OR** `external-repo.md` for teams who picked the alternate path
4. `build-your-agent.md` (~2 hours hands-on, returned to repeatedly)
5. `using-rag.md` (only if the team's use case needs document retrieval)
6. `using-workflows.md` (only if the team needs explicit multi-step orchestration beyond the run loop)
7. `testing.md` (read once, referenced from each test the team writes)
8. `submission.md` (read in week 1, referenced before final submission)
9. `data/README.md` (after Round 2, when sample data is released)

Each page links forward to the next obvious page and backward to its prerequisite. No page assumes the reader has read a sibling unless that sibling is the previous step in the linear order above.

**Tone and pacing:** every page opens with one sentence stating its goal and the time/effort budget. Code blocks are runnable as-is (or annotated where they aren't). No "advanced" sections in v1 — anything advanced is either cut or moved to a package's `SCOPE.md`.

**Package coverage map** (which page is the primary home for each package):

| Package | Primary page | Notes |
| --- | --- | --- |
| `@seta/agent-core` | `architecture.md` + `build-your-agent.md` | Kernel surface, agent contract, run loop, `streamKernelSSE` |
| `@seta/agent-sdk` | `build-your-agent.md` §5 | `parseSseStream`, `decodeKernelChunk` for the chat page |
| `@seta/agent-memory` | `build-your-agent.md` §3.5 | Postgres-backed `MemoryProvider` for cross-turn state |
| `@seta/agent-workflows` | `using-workflows.md` | Opt-in orchestration primitive |
| `@seta/agent-chunking` | `using-rag.md` | RAG pipeline stage 1 |
| `@seta/agent-embeddings` | `using-rag.md` | RAG pipeline stage 2 |
| `@seta/agent-vector` | `using-rag.md` | RAG pipeline stage 3 (pgvector) |
| `@seta/agent-rag` | `using-rag.md` | Retrieval + citation surface |

## Per-document content sketches

These are **content sketches**, not the prose itself. The implementation plan turns each into a writing task.

### `README.md` (landing)

- One-paragraph framing: what this directory is, who it's for, what it's not (it's not the brief — that's `Challenge Brief.docx`).
- Reading-order list (the nine items above) with a one-line description of each, including the in-monorepo vs external-repo fork at step 3 and the two opt-in branches (RAG, workflows).
- Pointer to the brief for problem context.
- Pointer to `CLAUDE.md` and to `docs/setup.md` for the deeper architectural background — *not* required reading, but the source of truth if the docs disagree with the code.

### `architecture.md`

Goal: in 15 minutes the team understands what the framework actually is, what's in the box, and what the rules of the road are — before they write any code.

Sections, in order:

1. **What this framework is.** One paragraph: a TypeScript agent kernel (`@seta/agent-core`), a typed client (`@seta/agent-sdk`), memory + RAG + workflow primitives, and a Hono-based HTTP host (`apps/api`). Not Mastra; not LangChain; deliberately small.
2. **Monorepo layout.** A diagram (ASCII / table) of the four top-level groups — `apps/`, `platform/`, `modules/channels/`, `modules/connectors/`, `modules/products/` — and a one-line purpose for each. This mirrors `CLAUDE.md` "Boundaries" but in participant-friendly language.
3. **The `platform/agent/*` package map.** A short table listing all eight `@seta/agent-*` packages, what each owns, and which hackathon doc covers it. Mirror of the package-coverage table above.
4. **Module boundaries (the import rules).** Why products can't import other products; why channels can't import products; why everything in `platform/agent/*` is dependency-free of `modules/*`. Stated as rules, not as theory. Pointer to `CLAUDE.md` "Boundaries (CI-enforced)" — those rules are enforced in CI; teams will see CI failures if they break them.
5. **The request lifecycle.** A one-page sequence: HTTP request hits `apps/api` → tenant context set on the request → product route invoked → agent run loop drives model + tools (and optionally a workflow) → SSE chunks streamed back via `streamKernelSSE`. Names each component the team will write vs each component the framework provides.
6. **Multi-tenancy and RLS.** Why every persisted row carries `tenant_id`. Why teams should always read tenant-id from `tenantContext.getTenantId()` and never accept it as a function parameter. RLS is the backstop, not the primary defence. For hackathon: one hardcoded dev tenant per team.
7. **Schema-per-module.** Each owner package holds its own Drizzle schema and migrations. Cross-context references go by id, not by foreign key. Pointer to `CLAUDE.md` "Schema-driven".
8. **What's outside the framework's scope.** No DI container; no plugin loader; no runtime discovery. Routes are mounted explicitly in `apps/api/src/main.ts`. This is intentional and the team should not invent indirection.

This page is the "Technical Guide architecture section" called out in the brief §7.

### `quickstart.md`

Goal: in-monorepo path — clone → first streaming response in ~30 minutes. No business logic yet. Sibling to `external-repo.md`; teams pick one based on their preferred working style (the README explains the choice).

- Prereqs (Node 22+, pnpm, Postgres via `pnpm db:up`, an LLM API key the organizers distribute).
- Repo clone + `pnpm install --frozen-lockfile` + `pnpm db:up` + `pnpm migrate`.
- A repo tour folded inline: where `apps/api` lives, where `modules/products/<your-team>` will live, what `platform/agent/*` provides, what teams should never touch (channels they didn't pick, other teams' products, the kernel internals).
- `pnpm new:package` walked through to scaffold a `modules/products/<your-team>` package — **CLI-only** per CLAUDE.md, never hand-edit `package.json`.
- A 20-line agent definition (instructions + model + zero tools + null memory provider) wired to a single `POST /run` route in `apps/api` using `streamKernelSSE`. The route path matches what `build-your-agent.md` evolves later — same path, more behavior.
- `curl` invocation showing SSE chunks streaming back.
- Forward-link to `build-your-agent.md`.

### `external-repo.md`

Goal: a team that prefers to work from a fresh repo (their own GitHub org, their own CI, their own deploy target) can install `@seta/agent-core`, `@seta/agent-sdk`, and the RAG/memory/workflow packages and be productive in ~30 minutes.

The exact mechanism depends on the publishing decision listed in Risks — public npm vs GitHub Packages vs git-URL/tarball. The page is structured the same regardless:

1. **When to pick this path.** Bullet decision: pick external-repo if your team already has a TS stack you want to keep, or if you want to deploy somewhere unrelated to this monorepo. Otherwise the in-monorepo `quickstart.md` path is faster.
2. **Prereqs.** Node 22+, pnpm (or npm/yarn — but examples are pnpm), Postgres 17 with the pgvector extension, an LLM API key.
3. **Install.** One install command (form depends on chosen mechanism). Pinned versions match what's currently published.
4. **Minimal `package.json` and `tsconfig.json`.** ESM-only (`"type": "module"`), no CJS, no path aliases — same conventions as the monorepo.
5. **Database setup.** A single migration script the team runs to create the kernel + memory + RAG schemas in their own Postgres. Either we ship a `pnpm exec @seta/agent-* migrate` entry point per package, or we publish a single `migrations/` SQL bundle teams apply with their tool of choice. Decision deferred to the implementation plan.
6. **Tenant context.** Same model as in-monorepo: `tenantContext.getTenantId()`. The package is reusable as-is; no extra wiring.
7. **A 20-line agent + Hono host.** Same shape as the in-monorepo quickstart's final code — proves the API surface is identical regardless of host.
8. **What's NOT available outside the monorepo.** `pnpm new:package`, the CI boundary checks (`check-no-manual-pkg-edit.ts`, scope-import enforcement), the `apps/api` composition file. Teams take responsibility for those guardrails themselves.
9. **Forward-link to `build-your-agent.md`.** From this point on, both paths read identically.

### `build-your-agent.md`

Goal: a real, demoable agent with one tool, conversation memory if needed, exposed over HTTP/SSE, with a static chat page.

Sections, in order:

1. **The agent contract.** What `instructions`, `model`, `tools`, and `memory` mean in our kernel. How the run loop drives them. Pointer to `@seta/agent-core/SCOPE.md` for the full surface.
2. **Defining a tool.** Zod input schema → `prepareTools` normalization → `execute(input, ctx)` shape. Errors throw `ToolError` (or a `DomainError` subclass), never raw `Error`. Tool input validation is the team's first execution-gateway checkpoint (note for the rubric).
3. **Tenant context.** `tenantContext.getTenantId()` from `@seta/tenant`. Why tenant-id is never a function parameter (CLAUDE.md "Footguns"). RLS as the backstop. For hackathon: one hardcoded dev tenant is fine.
4. **Memory across turns** (covers `@seta/agent-memory`). The kernel's default `NullMemoryProvider` is stateless — every run starts cold. For multi-turn conversations (most hackathon use cases need this), swap in `@seta/agent-memory`'s Postgres-backed provider. One-paragraph "do you need it?" decision, then ~15-line wiring example: instantiate the provider, pass into the agent definition, demonstrate that turn 2 sees turn 1's context. Tenant-scoped automatically. Note: short-term/working/long-term naming maps to message-history-window / summary-buffer / explicit retrieval-via-RAG (referenced for the rubric).
5. **Wiring the route.** `routes(handler?: Handler) => Hono` from your product package, mounted in `apps/api/src/main.ts`. `streamKernelSSE(c, run)` from `@seta/agent-core` is the only correct way to stream — explain why (`onAbort`, keep-alive, error mapping).
6. **The minimal chat page.** A static `index.html` (≤80 lines) that posts to the team's `POST /run` and renders the SSE stream. Uses `@seta/agent-sdk`'s `parseSseStream` + `decodeKernelChunk`. Served from `apps/api`'s static-assets path or just opened from disk for the demo.
7. **What good looks like for the rubric.** Three short paragraphs: clear intent (one agent does one thing well), structured I/O (Zod schemas everywhere), useful errors (typed, not stringly).

### `using-rag.md`

Goal: teams whose use case needs document retrieval (HR policies, project SOPs, candidate CVs) can wire chunking → embeddings → vector → retrieval.

- One-paragraph "do you need RAG?" decision: yes if your domain has long-form unstructured documents the agent must cite; no otherwise.
- Pipeline diagram: source documents → `@seta/agent-chunking` → `@seta/agent-embeddings` (OpenAI `text-embedding-3-small`) → `@seta/agent-vector` (pgvector) → `@seta/agent-rag` (retrieval + citation).
- 30-line example: ingest a markdown file, run a query through `@seta/agent-rag`, hand the retrieved chunks to the agent's `instructions` + a `cite_source` tool.
- Note on tenant scoping: chunks are tenant-scoped via the same `app.tenant_id` mechanism. RAG queries inherit the tenant context — no extra wiring needed.
- Pointer to each package's `SCOPE.md` for tuning (chunk size, embedding batch, retrieval `k`).

### `using-workflows.md`

Goal: teams whose use case needs explicit, deterministic multi-step orchestration (e.g., "screen CV → score → draft personalized rejection → schedule send") can use `@seta/agent-workflows` instead of relying on the agent's tool-calling loop alone.

- One-paragraph "do you need workflows?" decision: prefer the agent run loop if the steps are LLM-decided and the order can vary; reach for workflows when the steps and order are known up front, must run reliably, or need explicit suspend/resume (e.g., wait for a human approval).
- Concept sketch: a workflow is a sequence of steps; each step calls a tool, an agent, or another workflow; control flow is explicit (sequence, branch, parallel) and the workflow can be suspended/resumed across process restarts.
- 30-line example: a two-step workflow (Step 1 = call a tool; Step 2 = call an agent with the tool's output) wired into the same `POST /run` route via `streamKernelSSE` so SSE shape stays uniform.
- Note: workflows and the agent run loop compose — a workflow step can be "run this agent until it stops". Teams don't have to choose one or the other globally.
- Pointer to `@seta/agent-workflows/SCOPE.md` for the full surface (suspend/resume, error handling, retries).

### `testing.md`

Goal: teams understand what to test, how to test it, and how to avoid the LLM-cost trap.

- The three test layers in this repo (CLAUDE.md "Conventions"): unit (`<pkg>/src/**/*.test.ts`), integration (`<pkg>/tests/integration/**`, needs `DATABASE_URL`), E2E (`/tests/e2e/**`).
- **LLM in tests goes through `@seta/agent-core/testkit` recordings.** Never live model APIs in CI (CLAUDE.md "Footguns"). Show a `RECORD=1 pnpm vitest run -t <name>` walkthrough, then a re-play run with `RECORD` unset.
- **Never mock internal `@seta/*` modules.** If a team thinks they need to, the seam is wrong (CLAUDE.md "Conventions"). External HTTP via `msw` recordings.
- **Never mock Postgres in integration tests.** `pnpm db:up` and run against the real schema.
- The four test categories the rubric explicitly calls out (tool failure, hallucination, timeout, conflicting goals) — one short example per category, each ~20 lines.
- Coverage expectations: the repo's existing thresholds apply. `pnpm test:unit` must pass before submission.

### `submission.md`

Goal: teams know exactly what to submit, in what shape, and how the rubric maps onto our framework.

- **Submission template** (the §7 "Submission Template" artifact): required README sections — Project info, Problem statement, Target user, Architecture diagram, Setup guide (must reproduce on the judge's machine following only this README), Demo recording link, Repository link, Known limitations.
- Required structure of the team's `modules/products/<your-team>` package (so judges can find things consistently).
- **Rubric crosswalk** (replaces a separate "patterns" doc):
  - **Business Impact (35%)** — what to put in your problem statement and demo to score here. Not a framework concern.
  - **Agent Architecture (35%)** — how to demonstrate BDI separation, memory architecture, generative-vs-governed boundary, and execution gateway *using our primitives* (instructions = goals; `@seta/agent-memory` provider = beliefs/state; processor hooks + Zod tool input = adoption filters; tool errors + retry classification = execution monitor; `@seta/agent-workflows` for explicit commitment/revision when needed). Two paragraphs per concept, no more. Teams design the architecture; this just maps the vocabulary.
  - **Technical Correctness (20%)** — module boundaries (CLAUDE.md "Boundaries"), tests passing, migrations apply cleanly (`pnpm migrate`).
  - **Demo (10%)** — three-minute walkthrough format suggestion.
- Pre-submission checklist: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm migrate` all pass; demo recording is uploaded; setup guide tested on a clean clone.

### `data/README.md`

Goal: when sample data lands after Round 2, teams know how to load it and what's in it.

- Folder layout (one subfolder per business domain).
- Schema for each dataset: column names, types, row counts, any PII handling notes.
- Load script: `pnpm tsx scripts/load-sample-data.ts --domain <ta|pmo|em>`.
- Note: real internal data must not be used unless explicitly approved (brief §7).
- This page is a **placeholder structure** in the v1 docs PR. The dataset details fill in when sample data is generated. The placeholder is committed so the link from `README.md` is not broken.

## Cross-cutting decisions

- **Diataxis quadrants are an internal mental model, not a folder structure.** Following Mastra's actual practice (capability sections, not quadrant folders), pages are organized by what the reader is trying to do — not by which Diataxis quadrant they sit in.
- **No duplication of `SCOPE.md` content.** Each page links to the relevant package's `SCOPE.md` for the public interface. Hackathon docs explain "how to use it for the hackathon"; `SCOPE.md` is the authoritative API contract.
- **No screenshots of the chat page or the terminal output.** Both can shift between the docs being written and the team running them; verbatim code + expected JSON shape is more durable.
- **All code samples must compile.** Each code block is extracted from a fixture file under `docs/hackathon/_examples/` (or equivalent) that the typecheck job covers. Implementation plan task: wire the typecheck.
- **No emojis, no decorative formatting** (CLAUDE.md). Plain prose, headings, code blocks, tables where genuinely tabular.

## Risks and open questions

1. **External-repo publishing mechanism is undecided.** `external-repo.md` cannot ship until we choose one of: (a) flip `@seta/agent-*` packages to public + publish to npm, (b) publish to GitHub Packages with a hackathon-scoped read token, or (c) document a git-URL / tarball install with pinned commit SHAs. Each option has different ops cost; (c) is fastest for a one-off hackathon but worst long-term. Decision must land before the page is written.
2. **External-repo migrations strategy is undecided.** Once published, teams need to bring up the kernel + memory + RAG schemas in their own Postgres. Either each package exposes a `migrate` script, or we ship a single SQL bundle. Plan-level decision.
3. **`@seta/agent-sdk`, `@seta/agent-memory`, `@seta/agent-workflows` are still stubs.** All three are on the K-stream roadmap but not merged. If any aren't merged when docs ship: `build-your-agent.md` §6 (chat page) needs a hand-rolled SSE parser fallback for the SDK gap; `build-your-agent.md` §4 (memory) shrinks to "TODO when `@seta/agent-memory` lands"; `using-workflows.md` is held back from v1. The plan must check sequencing per page.
4. **`modules/products/agent` is still a stub.** The example product the docs reference doesn't exist yet either. The docs may need to ship with one toy reference product (e.g., `modules/products/example-quickstart`) created specifically for the hackathon, separate from the eventual real product. Confirm before writing.
5. **LLM API keys distribution.** The brief implies the OC provides resources but doesn't pin which models or who pays. The quickstart needs a concrete answer. Confirm with organizers.
6. **One-tenant-per-team vs shared dev tenant.** For hackathon scale, a per-team dev tenant id (UUID picked at scaffold time) is simplest; spec assumes that. If organizers want a shared sandbox tenant, the quickstart changes.
7. **Where does the team's repo live?** Each team forks the seta-os repo and works on a branch / their own fork? Or do they get a clean repo carved from this one? Affects the quickstart's first 5 minutes. Confirm.
8. **Round-2 deadline pressure.** v1 of these docs needs to ship before Round 2 starts. The implementation plan should sequence the prerequisite gaps (publishing mechanism, SDK, memory, workflows, example product, sample-data structure, LLM-key distribution) accordingly.
9. **Kernel outer tool-call iteration loop is not yet merged.** Per `@seta/agent-core/SCOPE.md` "Current state", K2 landed concrete provider adapters but the multi-step tool-call iteration (`accumulatedSteps[]`, `stopWhen`, fallback failover, concurrent tool execution, processor pipeline) is still outstanding. The brief §2 explicitly judges multi-step capability ("The ability to handle multi-step tasks is important"), so `build-your-agent.md` cannot ship until this lands or the gap is documented with a concrete workaround. Plan-level: this is a hard prerequisite, not a "nice to have".
