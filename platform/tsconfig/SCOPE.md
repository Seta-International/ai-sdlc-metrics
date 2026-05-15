# SCOPE — platform/tsconfig  (@seta/tsconfig)

## Purpose
Shared TypeScript compiler configs for the seta-os monorepo. Every package extends one of
the configs published here so strictness flags, module resolution, target, declaration emit,
and `.tsbuildinfo` placement stay identical across the workspace.

## Responsibilities
- **Owns:**
  - `node.json` — Node-process TS config (target/lib `ES2024`, `types: ["node"]`, includes
    `src/**/*`, excludes tests and `__recordings__/**`). Extended by every `platform/*` and
    `modules/*` package via `"extends": "../../platform/tsconfig/node.json"`.
  - Whatever future variants we ship for browser/Studio (P2) — kept here so version drift
    doesn't fork across packages.
- **Does NOT own:**
  - `tsconfig.base.json` at the repo root — that file owns the workspace-wide compiler
    options (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
    `verbatimModuleSyntax`, `incremental`, `tsBuildInfoFile`). `node.json` extends it.
  - Build outputs — emission is owned by each package's `tsup` config or `tsc -p
    tsconfig.build.json`. This package is config only.
  - Path aliases — CLAUDE.md forbids TS path aliases; imports go through workspace package
    names.

## Current state (Epic 1)
Implemented. Two files:
- `package.json` — name `@seta/tsconfig`, `private: true`, no scripts, no deps.
- `node.json` — extends `../../tsconfig.base.json`; sets `target/lib: ES2024`, `types:
  ["node"]`; `include: ["src/**/*"]`, `exclude: ["**/*.test.ts", "**/__recordings__/**"]`.

Every leaf package (e.g. `platform/db/tsconfig.json`, `platform/middleware/tsconfig.json`,
`platform/observability/tsconfig.json`) extends `node.json` with `include: ["src/**/*"]` and
nothing else, which is the contract this package enforces by being the only source of truth.

## Public interface
This package has no JS/TS exports. Its surface is the JSON configs:
- `node.json` — Node service / library variant (current).
- `package.json` `name: "@seta/tsconfig"` so other packages reference it as
  `"@seta/tsconfig": "workspace:*"` in `devDependencies` (lets `pnpm` materialize the path
  before TS resolution).

Planned (post-Epic 1, see Phase-1 §01 punch list and Mastra split):
- A `browser.json` variant once Studio (P2) lands — `lib: ["ES2024", "DOM"]`, no `types:
  ["node"]`, mirrors Mastra's per-target tsconfig split.
- A `build.json` variant that flips `noEmit: false` + `emitDeclarationOnly: true` for
  packages that publish `.d.ts` via `tsc` instead of `tsup --dts` (see
  `01-monorepo-build-test.md` punch list item on tsup defaults).

## Imports
- **Allowed internal:** none. This package is a leaf — nothing imports it at runtime.
- **Forbidden:** all `@seta/*` imports (would create a cycle since every package depends
  on this one for tsconfig).
- **External (pinned per setup.md §13):** none. TypeScript itself lives in each package's
  own `devDependencies` (currently `typescript@6.0.3` per `platform/db/package.json` et al.).

## Patterns to follow
- **Single tsconfig variant per runtime.** `node.json` is the only Node variant; do not
  fork (Mastra carries 3 — `tsconfig.json`, `tsconfig.node.json`, `tsconfig.build.json` —
  see `01-monorepo-build-test.md` § "What Mastra does"). Add new files only when a new
  runtime target appears (browser for Studio).
- **`exclude` tests + `__recordings__/**` here, not per-package.** Centralizing this is
  what makes leaf `tsconfig.json` files one-liners (cf. `platform/db/tsconfig.json:1-5`).
- **Match `tsconfig.base.json` compiler strictness exactly** — `node.json` must not relax
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, or
  `verbatimModuleSyntax` (root `tsconfig.base.json:6-21`). Footguns CLAUDE.md cares about
  (no legacy, schema-driven types) depend on those flags staying on everywhere.

## Patterns to avoid
- **TS path aliases (`compilerOptions.paths`).** Forbidden by CLAUDE.md "Conventions" §
  "No TS path aliases." Imports go through workspace package names; aliases break Biome's
  import-order rules and the `check-public-private.ts` boundary scan.
- **Per-package compiler overrides.** A leaf's `tsconfig.json` should add `include` and
  nothing else. If a package needs different settings (e.g. JSX for Studio), introduce a
  new variant here and have the leaf extend that — not a one-off override (see
  `01-monorepo-build-test.md` § Delta on Mastra's per-package divergence).
- **Bundling `typescript` here as a dependency.** TS pins live in each leaf's
  `devDependencies` so `pnpm up -r typescript@x` works; see `setup.md §13` per-package
  shapes.

## Test strategy
Not applicable. This package contains JSON only; correctness is checked transitively when
any consumer runs `pnpm typecheck`. CI's typecheck task across all workspaces is the
regression net.

## Open questions
- **catalog: pins for `typescript`.** `01-monorepo-build-test.md` punch list § "Fold in"
  recommends moving `typescript`/`vitest`/`zod` to a pnpm `catalog:` block so version drift
  isn't possible. If accepted, `@seta/tsconfig`'s consumers reference `"typescript":
  "catalog:"` in their devDeps; this package itself stays version-free. Decision blocked
  on a workspace-wide `pnpm-workspace.yaml` change.
- **`build.json` variant.** Decide whether Epic 2 publishable packages (`@seta/agent-core`,
  `@seta/agent-sdk`) emit `.d.ts` via `tsup --dts` (current pattern in `platform/db` et al.)
  or via separate `tsc -p tsconfig.build.json --emitDeclarationOnly`
  (`01-monorepo-build-test.md` punch list § tsup defaults). The latter is cleaner for
  multi-entry packages; the former is simpler for single-entry `src/index.ts`.
- **Browser variant timing.** Studio is P2; do not add `browser.json` until a concrete
  consumer exists (`07-request-context.md` § "lazy-resolver split" calls out the eventual
  need for a browser-safe `@seta/tenancy` shim, but P1 has no browser code).
