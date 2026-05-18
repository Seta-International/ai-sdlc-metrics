# Plan A — Scaffold `@seta/agent-rag`: package, types, exports

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `@seta/agent-rag` package. Land `package.json` (via `pnpm new:package`), install pinned deps via CLI, write the full public type contract (`src/types.ts`), the main entrypoint re-exports (`src/index.ts`), and the three-subpath exports map (`.`, `./types`, `./testkit`). Ship stub `factory.ts` and `testkit.ts` files so the build is green. No algorithm yet — Plans B–E fill in `rrf`, `testkit`, `ingest`, `retrieve`.

**Architecture:** Standard `pnpm new:package --kind platform-agent` scaffold. Because `platform/agent/rag/` already contains `SCOPE.md`, the scaffolder (which refuses on existing directories) needs a workaround: temporarily move `SCOPE.md` out, run the scaffolder, move it back. After scaffolding, edit `package.json` only via `pnpm pkg` / `npm pkg` (CLAUDE.md ban on hand-editing `package.json`).

**Tech Stack:** TypeScript (ESM), Vitest, Zod 4.4.3, tsup, pnpm 11 workspaces, `@seta/tsconfig`.

**Spec:** [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../specs/2026-05-18-agent-rag-design.md) §Architecture, §Public surface, §File layout

---

## File Structure

After this plan completes:

```
platform/agent/rag/
├── SCOPE.md                     # already exists; unchanged in this plan (updated in Plan E)
├── package.json                 # CREATE via scaffolder + npm pkg
├── tsconfig.json                # CREATE via scaffolder
├── vitest.config.ts             # CREATE via scaffolder
└── src/
    ├── index.ts                 # CREATE — main entrypoint re-exports
    ├── types.ts                 # CREATE — full type surface
    ├── factory.ts               # CREATE — stub createAgentRag (real impl lands Plan E)
    ├── factory.test.ts          # CREATE — minimal shape assertion
    └── testkit.ts               # CREATE — stub createFakeAgentRag (real impl lands Plan C)
```

The scaffolder's auto-generated `src/index.test.ts` is **deleted** at the end of Task A5 (the existing pattern in `@seta/agent-embeddings` Plan A).

---

## Task A1: Run the scaffolder for `@seta/agent-rag`

**Files:**
- Move (temp): `platform/agent/rag/SCOPE.md` → `<temp path>` and back
- Create (via scaffolder): `platform/agent/rag/package.json`
- Create (via scaffolder): `platform/agent/rag/tsconfig.json`
- Create (via scaffolder): `platform/agent/rag/vitest.config.ts`
- Create (via scaffolder, then deleted in A5): `platform/agent/rag/src/index.ts`, `src/index.test.ts`

- [ ] **Step 1: Confirm starting state**

```powershell
Get-ChildItem platform/agent/rag
```

Expected: exactly one item — `SCOPE.md`. If a `package.json` already exists, this task is done — skip to Task A2. If anything else exists, stop and investigate before deleting.

- [ ] **Step 2: Stash `SCOPE.md` out of the package directory**

The scaffolder refuses on any existing directory (`existsSync(pkgDir) ? refuse(...)` in `tooling/scripts/new-package.ts:115`). Move `SCOPE.md` to the repo's `tmp` area and remove the empty dir:

```powershell
New-Item -ItemType Directory -Force -Path .tmp | Out-Null
Move-Item platform/agent/rag/SCOPE.md .tmp/rag-SCOPE.md
Remove-Item -Recurse -Force platform/agent/rag
Test-Path platform/agent/rag
```

Expected last line: `False`.

- [ ] **Step 3: Run the scaffolder non-interactively**

```powershell
pnpm new:package --kind platform-agent --name rag --desc "Composition layer over chunking + embeddings + vector with RRF fusion"
```

Expected stdout includes:
```
→ scaffolding @seta/agent-rag at platform/agent/rag
✓ @seta/agent-rag created at platform/agent/rag
  next: pnpm --filter @seta/agent-rag add <deps>
```

The scaffolder calls `pnpm install --silent` at the end. If that fails, fix the failure before continuing — the most common cause is a lockfile conflict on another branch.

- [ ] **Step 4: Restore `SCOPE.md`**

```powershell
Move-Item .tmp/rag-SCOPE.md platform/agent/rag/SCOPE.md
Remove-Item .tmp -ErrorAction SilentlyContinue
Get-ChildItem platform/agent/rag
```

Expected: `package.json`, `tsconfig.json`, `vitest.config.ts`, `SCOPE.md`, `src/` (containing `index.ts` and `index.test.ts`).

- [ ] **Step 5: Verify the scaffolded `package.json`**

```powershell
Get-Content platform/agent/rag/package.json
```

Must contain at least:
- `"name": "@seta/agent-rag"`
- `"private": true`
- `"type": "module"`
- `"description": "Composition layer over chunking + embeddings + vector with RRF fusion"`
- `"main": "./dist/index.js"` / `"types": "./dist/index.d.ts"`
- scripts: `build`, `dev`, `test:unit`, `typecheck`

If any field is missing or wrong, fix via `pnpm pkg set <field>=<value>` from inside the package directory. **Never hand-edit `package.json`.**

- [ ] **Step 6: Verify the scaffolded `vitest.config.ts`**

Must be:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: '@seta/agent-rag' },
})
```

No `fileParallelism` change yet — the integration project gets added in Plan D.

- [ ] **Step 7: Run the placeholder test**

```powershell
pnpm --filter @seta/agent-rag test:unit
```

Expected: 1 test passes (the scaffolder-generated `placeholder` from `src/index.test.ts`).

- [ ] **Step 8: Commit the scaffold**

```powershell
git add platform/agent/rag pnpm-lock.yaml
git commit -m "feat(agent-rag): scaffold package via pnpm new:package"
```

---

## Task A2: Install dependencies

**Files:**
- Modify (via CLI only): `platform/agent/rag/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add runtime workspace dependencies**

Run from repo root (`D:/Work/seta-os`):

```powershell
pnpm --filter @seta/agent-rag add `
  @seta/agent-chunking@workspace:* `
  @seta/agent-core@workspace:* `
  @seta/agent-embeddings@workspace:* `
  @seta/agent-vector@workspace:* `
  @seta/db@workspace:* `
  @seta/observability@workspace:* `
  @seta/tenancy@workspace:*
```

`@seta/agent-core` is required for the testkit's `setupLLMRecording` (integration tests in Plan D). `@seta/db` is type-only at runtime (`DbSql` type) but pnpm requires it to be declared.

- [ ] **Step 2: Add Zod**

```powershell
pnpm --filter @seta/agent-rag add zod@4.4.3
```

Pinned at the same version as siblings (`@seta/agent-chunking`, `@seta/agent-embeddings`).

- [ ] **Step 3: Add dev dependencies**

```powershell
pnpm --filter @seta/agent-rag add -D `
  '@seta/tsconfig@workspace:*' `
  '@types/node@^25.7.0' `
  fast-check@4.8.0 `
  tsup@8.5.1 `
  typescript@6.0.3
```

`fast-check` is for the property tests in Plan B. `@types/node` is pinned to the version vector uses (`^25.7.0`); chunking uses `^24.12.3` — go with the newer pin since this package will be newer code. `tsup` and `typescript` mirror sibling pins.

- [ ] **Step 4: Verify the dependency declarations**

```powershell
Get-Content platform/agent/rag/package.json
```

Expected `dependencies` block (object order may vary; required keys):
- `@seta/agent-chunking: workspace:*`
- `@seta/agent-core: workspace:*`
- `@seta/agent-embeddings: workspace:*`
- `@seta/agent-vector: workspace:*`
- `@seta/db: workspace:*`
- `@seta/observability: workspace:*`
- `@seta/tenancy: workspace:*`
- `zod: 4.4.3`

Expected `devDependencies`:
- `@seta/tsconfig: workspace:*`
- `@types/node: ^25.7.0`
- `fast-check: 4.8.0`
- `tsup: 8.5.1`
- `typescript: 6.0.3`

If any are missing, rerun the matching `pnpm add` command.

- [ ] **Step 5: Run typecheck (still placeholder shape, but should resolve all imports)**

```powershell
pnpm --filter @seta/agent-rag typecheck
```

Expected: clean. The placeholder `src/index.ts` exports an empty object; no imports are exercised yet.

- [ ] **Step 6: Commit**

```powershell
git add platform/agent/rag/package.json pnpm-lock.yaml
git commit -m "feat(agent-rag): pin dependencies"
```

---

## Task A3: Add the three-subpath exports map

**Files:**
- Modify (via CLI only): `platform/agent/rag/package.json`

The package needs three subpath exports per the spec: `.` (main), `./types` (type-only), `./testkit` (in-memory fake).

- [ ] **Step 1: Set the `exports` map**

The scaffolder leaves `main` and `types` as top-level fields. Modern node resolution prefers `exports`. Use `npm pkg set` to add the map (single command, escape inner double-quotes for PowerShell):

```powershell
Push-Location platform/agent/rag
npm pkg set 'exports[.][types]=./dist/index.d.ts'
npm pkg set 'exports[.][import]=./dist/index.js'
npm pkg set 'exports[./types][types]=./dist/types.d.ts'
npm pkg set 'exports[./types][import]=./dist/types.js'
npm pkg set 'exports[./testkit][types]=./dist/testkit.d.ts'
npm pkg set 'exports[./testkit][import]=./dist/testkit.js'
Pop-Location
```

If PowerShell's quoting argues with the brackets, fall back to running the commands from a `bash` shell:

```bash
cd platform/agent/rag
npm pkg set 'exports[.][types]=./dist/index.d.ts'
npm pkg set 'exports[.][import]=./dist/index.js'
npm pkg set 'exports[./types][types]=./dist/types.d.ts'
npm pkg set 'exports[./types][import]=./dist/types.js'
npm pkg set 'exports[./testkit][types]=./dist/testkit.d.ts'
npm pkg set 'exports[./testkit][import]=./dist/testkit.js'
cd ../../..
```

- [ ] **Step 2: Update the `build` script to emit three entrypoints**

```powershell
Push-Location platform/agent/rag
npm pkg set 'scripts.build=tsup src/index.ts src/types.ts src/testkit.ts --format esm --dts --sourcemap'
npm pkg set 'scripts.dev=tsup src/index.ts src/types.ts src/testkit.ts --format esm --dts --watch'
Pop-Location
```

- [ ] **Step 3: Verify**

```powershell
Get-Content platform/agent/rag/package.json
```

The `exports` field must show three subpaths, each with `types` + `import`. `scripts.build` and `scripts.dev` must include all three `src/*.ts` entrypoints. `main` and `types` top-level fields **stay** (Node still falls back to them when `exports` is missing for a tool).

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/package.json
git commit -m "feat(agent-rag): wire three-subpath exports map and multi-entry build"
```

---

## Task A4: Write the public types module — `src/types.ts`

**Files:**
- Create: `platform/agent/rag/src/types.ts`

- [ ] **Step 1: Create the file with the full type contract**

Write exactly:

```ts
// platform/agent/rag/src/types.ts
import type { DbSql } from '@seta/db'
import type { EmbeddingsClient } from '@seta/agent-embeddings'

/** Dependencies injected at construction by `createAgentRag`. */
export interface RagDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

export interface IngestOptions {
  /** Chunk size in tokens. Default: 512. */
  maxTokens?: number
  /** Rolling-window overlap in tokens. Default: 64. */
  overlapTokens?: number
  signal?: AbortSignal
}

export interface RetrieveOptions {
  /** Top-k after fusion. Default: 8. */
  k?: number
  /** Vector similarity floor (0..1). Default: 0.3. */
  minSim?: number
  /** RRF smoothing constant. Default: 60 (literature standard). Advanced. */
  rrfK?: number
  signal?: AbortSignal
}

export interface RagCitation {
  sourceId: string
  /**
   * Character span into the original ingested content.
   * `null` only for chunks ingested before the `span jsonb` column landed.
   */
  span: { startChar: number; endChar: number } | null
}

export interface RagHit {
  chunkId: string
  sourceId: string
  content: string
  /** Fused rank score (higher = better). */
  rrfScore: number
  /** 1-based rank in the vector leg. Always present in P1. */
  vectorRank?: number
  /** Reserved for P2 hybrid retrieve. `undefined` in P1. */
  ftsRank?: number
  /** 0..1 cosine similarity from `searchChunks`. */
  vectorSimilarity?: number
  citation: RagCitation
}

export interface RagApi {
  ingest(sourceId: string, content: string, opts?: IngestOptions): Promise<void>
  retrieve(query: string, opts?: RetrieveOptions): Promise<RagHit[]>
}

/** Input to `fuseByRRF`: one ranked list per leg. */
export interface RankedItem {
  id: string
}

/** Output of `fuseByRRF`. */
export interface FusedItem {
  id: string
  rrfScore: number
  /** `ranks[legIndex] = 1-based rank within that leg`. */
  ranks: Record<number, number>
}
```

- [ ] **Step 2: Verify the file imports resolve**

```powershell
pnpm --filter @seta/agent-rag typecheck
```

Expected: clean. If `EmbeddingsClient` isn't found, `@seta/agent-embeddings` wasn't added in Task A2 — recheck.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/src/types.ts
git commit -m "feat(agent-rag): declare public type contract"
```

---

## Task A5: Replace the placeholder `src/index.ts` and remove the placeholder test

**Files:**
- Modify: `platform/agent/rag/src/index.ts` (replace the scaffolder's `export {}`)
- Delete: `platform/agent/rag/src/index.test.ts`

- [ ] **Step 1: Confirm the placeholder state**

```powershell
Get-Content platform/agent/rag/src/index.ts
Get-Content platform/agent/rag/src/index.test.ts
```

Expected: `src/index.ts` is `export {}\n`. `src/index.test.ts` is a one-line vitest placeholder.

- [ ] **Step 2: Replace `src/index.ts` with the real re-exports**

Write exactly:

```ts
// platform/agent/rag/src/index.ts
export { createAgentRag } from './factory.js'
export { fuseByRRF } from './rrf.js'
export type {
  FusedItem,
  IngestOptions,
  RagApi,
  RagCitation,
  RagDeps,
  RagHit,
  RankedItem,
  RetrieveOptions,
} from './types.js'
```

This will not typecheck yet — `./factory.js` and `./rrf.js` don't exist. We add the stubs next.

- [ ] **Step 3: Delete the placeholder test**

```powershell
Remove-Item platform/agent/rag/src/index.test.ts
```

Real unit tests land alongside their src files (`rrf.test.ts`, `factory.test.ts`, `testkit.test.ts`, `ingest.test.ts`) in Plans B–D.

- [ ] **Step 4: Defer typecheck**

Don't run typecheck yet — the stubs in Task A6 close the missing-export error.

---

## Task A6: Add the `factory.ts` and `testkit.ts` stubs

**Files:**
- Create: `platform/agent/rag/src/factory.ts`
- Create: `platform/agent/rag/src/factory.test.ts`
- Create: `platform/agent/rag/src/testkit.ts`

These stubs let the package typecheck and build green at the end of Plan A. Plans C, D, E replace each one with the full implementation.

- [ ] **Step 1: Create the `factory.ts` stub**

Write exactly:

```ts
// platform/agent/rag/src/factory.ts
import type { RagApi, RagDeps } from './types.js'

/**
 * Stub implementation. Plans D + E replace this with the real
 * ingest/retrieve closures.
 */
export function createAgentRag(_deps: RagDeps): RagApi {
  return {
    async ingest(): Promise<void> {
      throw new Error('createAgentRag.ingest: not implemented yet (see Plan D)')
    },
    async retrieve() {
      throw new Error('createAgentRag.retrieve: not implemented yet (see Plan E)')
    },
  }
}
```

The `_deps` underscore-prefix silences the unused-arg lint warning without changing the public signature.

- [ ] **Step 2: Add `rrf.ts` stub**

`src/index.ts` re-exports `fuseByRRF`. Plan B replaces this with the real implementation; for now a no-op shim closes the missing-export error:

```ts
// platform/agent/rag/src/rrf.ts
import type { FusedItem, RankedItem } from './types.js'

/**
 * Stub implementation. Plan B replaces this with the real RRF fusion.
 */
export function fuseByRRF(_rankings: RankedItem[][], _k = 60): FusedItem[] {
  throw new Error('fuseByRRF: not implemented yet (see Plan B)')
}
```

- [ ] **Step 3: Add a shape test for the factory stub**

Write exactly:

```ts
// platform/agent/rag/src/factory.test.ts
import { describe, expect, it } from 'vitest'
import { createAgentRag } from './factory.js'
import type { EmbeddingsClient } from '@seta/agent-embeddings'
import type { DbSql } from '@seta/db'

const dummySql = {} as DbSql
const dummyEmbeddings: EmbeddingsClient = {
  embed: async () => ({ embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } }),
}

describe('createAgentRag', () => {
  it('returns an object with ingest and retrieve methods', () => {
    const rag = createAgentRag({ sql: dummySql, embeddings: dummyEmbeddings })
    expect(typeof rag.ingest).toBe('function')
    expect(typeof rag.retrieve).toBe('function')
  })
})
```

The cast-via-`as` of `dummySql` is acceptable here because no method on `DbSql` is called inside the stub. Plan E replaces this test with one that exercises real composition through a `pgmem` or fake-`sql` seam.

- [ ] **Step 4: Create the `testkit.ts` stub**

Write exactly:

```ts
// platform/agent/rag/src/testkit.ts
import type { RagApi, RagHit } from './types.js'

export interface FakeRagOptions {
  /** Canned hits returned by `retrieve` regardless of query. */
  hits?: RagHit[]
  /** Optional dynamic responder; takes precedence over `hits` when set. */
  retrieve?: (query: string) => RagHit[] | Promise<RagHit[]>
}

/**
 * Stub implementation. Plan C replaces this with the real fake.
 */
export function createFakeAgentRag(
  _opts?: FakeRagOptions,
): RagApi & { __calls: { ingest: Array<{ sourceId: string; content: string }> } } {
  return {
    __calls: { ingest: [] },
    async ingest(): Promise<void> {
      throw new Error('createFakeAgentRag: not implemented yet (see Plan C)')
    },
    async retrieve() {
      throw new Error('createFakeAgentRag: not implemented yet (see Plan C)')
    },
  }
}
```

- [ ] **Step 5: Run typecheck**

```powershell
pnpm --filter @seta/agent-rag typecheck
```

Expected: clean. If `'./factory.js'` cannot be resolved, the `tsconfig`'s `moduleResolution` is wrong — check `platform/tsconfig/node.json` for `"moduleResolution": "NodeNext"` (or `bundler`).

- [ ] **Step 6: Run unit tests**

```powershell
pnpm --filter @seta/agent-rag test:unit
```

Expected: `factory.test.ts` runs and passes (1 test). If it errors with "Cannot find module", the `vitest.config.ts` didn't pick up the package — recheck Task A1 Step 6.

- [ ] **Step 7: Run lint**

```powershell
pnpm --filter @seta/agent-rag lint
```

Expected: clean. If Biome complains about unused imports in the stub files, double-check the underscore-prefixed parameter names.

- [ ] **Step 8: Commit**

```powershell
git add platform/agent/rag/src
git commit -m "feat(agent-rag): public types + factory/testkit/rrf stubs"
```

---

## Task A7: Final verification

**Files:** none

- [ ] **Step 1: Full local verification chain**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag test:unit
pnpm --filter @seta/agent-rag build
```

All four exit zero. `pnpm build` produces `dist/index.{js,d.ts}`, `dist/types.{js,d.ts}`, `dist/testkit.{js,d.ts}` (six files plus sourcemaps).

- [ ] **Step 2: Verify the subpath exports resolve from a sibling consumer**

Pick any existing package that doesn't yet depend on `@seta/agent-rag` — e.g., write a temporary smoke script (don't commit it):

```powershell
Set-Content -Path .tmp-rag-smoke.mts -Value @'
import type { RagApi, RagHit } from '@seta/agent-rag/types'
import { createFakeAgentRag } from '@seta/agent-rag/testkit'
import { createAgentRag, fuseByRRF } from '@seta/agent-rag'
const _api: RagApi = createFakeAgentRag()
const _hits: RagHit[] = []
console.log(typeof createAgentRag, typeof fuseByRRF, _hits.length, _api.ingest.constructor.name)
'@
pnpm exec tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 .tmp-rag-smoke.mts
Remove-Item .tmp-rag-smoke.mts
```

Expected: typecheck exits zero (it's only checking type resolution, not runtime). The `.tmp-rag-smoke.mts` file is deleted after the check — do NOT commit it.

- [ ] **Step 3: Confirm git log**

```powershell
git log --oneline -8
```

Expected: 5 commits from this plan (scaffold, deps, exports map, types, stubs).

Proceed to Plan B (`fuseByRRF`).
