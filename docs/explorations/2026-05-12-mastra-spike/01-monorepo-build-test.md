# Mastra spike — Monorepo + build/test infrastructure

## What Mastra does

- **pnpm workspaces + catalog.** `pnpm-workspace.yaml:1-25` enumerates ~17 top-level groups (`packages/*`, `stores/*`, `deployers/*`, `auth/*`, `observability/*`, etc., plus pinned individual paths like `e2e-tests/client-js/zod-v3`). A `catalog:` block at `pnpm-workspace.yaml:27-33` pins `typescript`, `vitest`, `@vitest/coverage-v8`, `@vitest/ui`, `zod`, `@microsoft/api-extractor` — packages reference these with the literal string `"catalog:"` (see `package.json:8-25`, `packages/core/package.json:795-808`).
- **Supply-chain hardening in workspace yaml** (no root `.npmrc` — verified absent): `pnpm-workspace.yaml:38-48` sets `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`, `trustPolicyIgnoreAfter: 43200`, `minimumReleaseAge: 1440`, plus an explicit `trustPolicyExclude` for CVE patches.
- **Root `package.json`** (`package.json:104-134`) pins `resolutions` and `pnpm.overrides` for CVE fixes + `patchedDependencies` for upstream forks of `@changesets/get-dependents-graph` and `tsup@8.5.1`. `preinstall: npx only-allow pnpm` enforces the package manager (`package.json:87`).
- **Turbo root config is tiny.** `turbo.json:1-28` declares only `build` / `lint` / `clean` / `dev` / `validate:package`. No `globalDependencies`, no `globalEnv`, no remote-cache signing. Uses `ui: "stream"` and `futureFlags.affectedUsingTaskInputs: true`. Per-package turbo configs extend it (e.g. `packages/core/turbo.json:1-37` splits `build` into `build:lib` + `build:patch-commonjs` and declares fine-grained `inputs` per task including `vitest.config.*`).
- **TS configs.** Root `tsconfig.json:1-28` is a typecheck-only base (`noEmit: true`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `target: ES2020`, `module: ES2022`, `moduleResolution: bundler`, includes only `eslint.config.js` + `prettier.config.js`). `tsconfig.build.json:1-13` flips `noEmit: false` + `emitDeclarationOnly: true` for d.ts emission. Per-package `tsconfig.json` extends `tsconfig.node.json`; `packages/core/tsconfig.json:1-8` excludes tests, includes `vitest.config.ts` + `tsup.config.ts`.
- **Vitest root.** `vitest.config.ts:1-108` uses Vitest `projects` and **dynamically discovers** them via globbing `PROJECT_GLOBS` (`vitest.config.ts:19-30`) — handles nested `test.projects` via `loadConfigFromFile`. `packages/core/vitest.config.ts:7-64` defines three named sub-projects: `unit:packages/core`, `e2e:packages/core`, `typecheck:packages/core` (with `typecheck.enabled: true`).
- **tsup config — multi-entry, dual-format, treeshake decorators.** `packages/core/tsup.config.ts:45-117` exports `format: ['esm','cjs']`, `splitting: true`, `treeshake.preset: 'smallest'`, `dts: false` (d.ts generated separately via `@internal/types-builder` in `onSuccess`), a custom Babel plugin to drop unused decorators, and a `__MASTRA_VERSION__` define injection. ~75 entry points yield ~75 subpath exports in `packages/core/package.json:13-705`.
- **ESLint, not Biome.** Root `eslint.config.js` is absent; configured per-package via shared factory `packages/_config/src/eslint.js:29-323` (`createConfig({ e18e? })`). Rules Biome cannot replicate: `@typescript-eslint/no-floating-promises` + `no-misused-promises` (type-aware, requires `projectService`) at lines 191-193; `import/order` alphabetized with custom `pathGroups` at lines 61-68; `@typescript-eslint/consistent-type-imports` with `fixStyle: 'separate-type-imports'` at lines 182-189; `no-restricted-imports` blocking test files from source at lines 269-285; `vitest/no-focused-tests` at line 319; `unicorn/prefer-node-protocol` at line 60; `eslint-plugin-depend/ban-dependencies` (e18e opt-in) at lines 73-84; `@typescript-eslint/ban-ts-comment` with `minimumDescriptionLength: 3` at lines 196-205. lint-staged is per-package (`packages/core/lint-staged.config.js:1-5`): `eslint --fix --max-warnings=0` + `prettier --write`.

## What setup.md plans

§1 toolchain (`docs/setup.md:9-23`): "Package manager | pnpm | **11.0.9**"; "Task runner | Turborepo | **2.9.12**"; "Linter + formatter | Biome | **2.4.15** | One tool; built-in import enforcement"; "Tests | Vitest | **4.1.5**"; "Git hooks | lefthook | **2.1.6**".

§12 `pnpm-workspace.yaml` (`docs/setup.md:1111-1122`): lists only `apps/*`, `modules/{channels,connectors,products}/*`, `platform/*`, `platform/agent/*`, `examples/*` — **no `catalog:` block**.

§12 `.npmrc` (`docs/setup.md:1124-1144`): `engine-strict=true`, `strict-peer-dependencies=true`, `auto-install-peers=false`, `dedupe-peer-dependents=true`, `prefer-offline=true`, `save-workspace-protocol=rolling`. No `blockExoticSubdeps`, `trustPolicy`, or `minimumReleaseAge`.

§12 `turbo.json` (`docs/setup.md:1190-1229`): `remoteCache.signature: true`, `futureFlags.pruneIncludesGlobalFiles: true`, `globalDependencies: [".npmrc","tsconfig.base.json","biome.json","vitest.config.ts"]`, `$TURBO_DEFAULT$` input extension, separate `test:unit` / `test:integration` tasks with `__recordings__/**` and `__fixtures__/**` in `inputs`, `test:integration.env: ["DATABASE_URL"]`. No per-package turbo.json shown.

§12 Root `vitest.config.ts` (`docs/setup.md:1285-1316`): single `defineConfig` with `pool: "forks"`, `isolate: false`, coverage thresholds (lines 80/branches 70/functions 80/statements 80), `projects` declared as **static glob array**. No tsup config in setup.md (deferred to per-package template at line 1701+). No catalog usage anywhere.

## Delta

**Fold in:**
- pnpm `catalog:` for vitest/typescript/zod/@vitest/coverage-v8 pins. Setup.md hard-codes versions in every package's devDeps (§13) — that's a future drift footgun and conflicts with §12 "Schema-driven" stance.
- `blockExoticSubdeps: true` + `minimumReleaseAge` + `trustPolicy: no-downgrade` in `.npmrc` (or `pnpm-workspace.yaml`). Cheap supply-chain hardening that costs nothing.
- `preinstall: npx only-allow pnpm` in root `package.json`. Setup.md §12 has no equivalent guard.
- Per-package `turbo.json` extending the root with fine-grained `inputs` (per `packages/core/turbo.json:5-36`). Setup.md only shows root turbo.json.
- tsup defaults to lock in for `@seta/agent-core` and other published kernel packages: `format: ['esm','cjs']`, `splitting: true`, `treeshake.preset: 'smallest'`, `sourcemap: true`, `clean: true`. Mastra emits `.d.ts` via separate tool (`@internal/types-builder`) — we should emit via `tsc -p tsconfig.build.json` with `emitDeclarationOnly` (cleaner; `tsconfig.build.json:1-13`).
- Vitest sub-projects with `name: "unit:<pkg>"` + `name: "e2e:<pkg>"` + `name: "typecheck:<pkg>"` per package (`packages/core/vitest.config.ts:17-62`). Setup.md §17 implies this but doesn't show the three-project pattern with `typecheck.enabled`.

**Deliberately avoid:**
- Mastra's dynamic project discovery (`vitest.config.ts:37-102`). CLAUDE.md forbids "DI containers, plugin loaders, or runtime discovery" — keep setup.md's static glob list.
- Mastra's ~75-entry tsup `entry` array. Forces every consumer onto fixed subpaths. Prefer one `src/index.ts` per package; if a kernel needs trees-shakeable subpaths, declare them explicitly + few.
- Mastra's eslint factory (`packages/_config/src/eslint.js`) — Biome is the §1 pick and the consolidation win is real. But this is **conditional** (see open questions).

**Open questions:**
- Biome 2.4 still lacks type-aware rules: there is no `no-floating-promises` equivalent. Mastra's enforcement of `@typescript-eslint/no-floating-promises` (`packages/_config/src/eslint.js:193`) catches real bugs in async tool code. Does P1 need this for `@seta/agent-core`? If yes, we either (a) accept a tiny eslint config layered on top of Biome for `platform/agent/*` only, or (b) defer to runtime via `unhandledRejection` traps.
- Setup.md §1 Vitest is **4.1.5**; Mastra catalog is **4.1.5** — match. But Mastra's `vitest.config.ts` uses `loadConfigFromFile` from `vite` (root devDep `vite: ^7.3.1`, `package.json:23`). Does our root `vitest.config.ts` need `vite` as a devDep? Setup.md doesn't list it.
- Does `@hono/zod-openapi` actually depend on Zod 4 internals? (Setup.md §2 line 33 flags this as "Verify Zod 4 internal compatibility before P1 close-out" — Mastra pins `zod: ^4.3.6` in catalog, useful data point.)

## Punch list

- setup.md §12 `pnpm-workspace.yaml`: add a `catalog:` block pinning `typescript: 6.0.3`, `vitest: 4.1.5`, `@vitest/coverage-v8: 4.1.5`, `zod: 4.4.3`; rewrite §13 to reference `"vitest": "catalog:"` etc. instead of inlining versions.
- setup.md §12 `.npmrc`: add `blockExoticSubdeps=true`, `min-release-age=1440` (or move to `pnpm-workspace.yaml` `minimumReleaseAge`), `trustPolicy=no-downgrade`. Cross-link to §9 publishing.
- setup.md §12 root `package.json` snippet (line ~1156): add `"preinstall": "npx only-allow pnpm"` to scripts.
- setup.md §12 `turbo.json` (line ~1192): add a "Per-package `turbo.json`" subsection right after the root snippet, showing the `extends: ["//"]` + split-task pattern from `packages/core/turbo.json:1-37`. Cite `inputs` whitelisting (`!**/*.test.ts`) so caching survives test edits.
- setup.md §12 root `vitest.config.ts` (line ~1285): add a note that `vite` must be a root devDep if any project config imports from `vite`; verify our static `projects` array stays static (no dynamic discovery per CLAUDE.md).
- setup.md §12 per-package `vitest.config.ts` (line ~1318): expand to show the three-project pattern (`unit:<pkg>` / `e2e:<pkg>` / `typecheck:<pkg>` with `typecheck.enabled: true` and `include: ['src/**/*.test-d.ts']`).
- setup.md §18: add a "tsup defaults" subsection. Mandate `format: ['esm','cjs']` (for public packages only — private apps are ESM-only), `splitting: true`, `treeshake: { preset: 'smallest' }`, `clean: true`, `sourcemap: true`, `dts: false` with d.ts emitted via `tsc -p tsconfig.build.json --emitDeclarationOnly`.
- setup.md §1 (line 18): footnote — Biome 2.4 has no type-aware `no-floating-promises`. Decision point: layer minimal eslint over Biome for `platform/agent/*`, or rely on runtime traps. Resolve before P1 close-out.
- @seta/agent-core: leave a hook in `tsup.config.ts` for a future `__SETA_VERSION__` define injection (mirrors Mastra `tsup.config.ts:84`); useful for telemetry attributes.
- @seta/agent-core: structure `vitest.config.ts` as a three-project file from day one (unit / e2e / typecheck) — adding later forces churn.
- P2-defer: Mastra's `@internal/types-builder` (custom d.ts bundler with provider-registry copies) — we don't ship a model registry yet, and `tsc --emitDeclarationOnly` is sufficient until we do.
- P2-defer: Mastra's Babel-based decorator treeshake plugin (`packages/core/tsup.config.ts:14-43`). Only matters if we adopt class-decorator-heavy DI; not on the P1 roadmap.
- P2-defer: dynamic vitest project discovery. CLAUDE.md forbids runtime discovery; revisit only if the static glob list exceeds ~30 packages.
- P2-defer: `pnpm.overrides` / `patchedDependencies` infrastructure. Set up the empty stanza in root `package.json` but don't populate until the first real CVE forces it.
