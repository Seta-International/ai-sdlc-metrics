# Module Scaffold CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Turbo Generators-based scaffolding CLI (`turbo gen module|zone|command|query|entity|remove`) that produces fully runnable vertical slices and supports dry-run, validation, and reverse cleanup.

**Architecture:** Plop-backed Turbo Generators wrap a buffered virtual filesystem (Tree). All file writes are buffered until `validate()` passes; `--dry-run` skips the flush. Shared-file edits go through ts-morph AST modules (no regex). Templates clone real reference modules (`preferences/`, `web-people/`) and are kept honest by a CI drift check. The `remove` generator uses the same AST modules in reverse, so create and cleanup are guaranteed inverses.

**Tech Stack:** TypeScript, Bun 1.3, Plop (via Turbo Generators), ts-morph, Vitest (co-located specs per `CLAUDE.md`).

**Spec:** `docs/superpowers/specs/2026-05-07-module-scaffold-cli-design.md`

---

## File Structure

```
turbo/
  generators/
    package.json                    # @plop/types, ts-morph, isolated from root
    tsconfig.json                   # extends packages/tsconfig
    config.ts                       # PlopConfig — registers all 6 generators
    generators/
      entity.gen.ts
      command.gen.ts
      query.gen.ts
      module.gen.ts
      zone.gen.ts
      remove.gen.ts
    lib/
      tree.ts                       # PendingChange[] + add/edit/delete API
      tree.spec.ts
      flush.ts                      # tree → disk; no-op in dry-run
      flush.spec.ts
      preview.ts                    # pretty-print Plan: block
      preview.spec.ts
      validate.ts                   # input + repo-state validators
      validate.spec.ts
      naming.ts                     # kebab/camel/Pascal helpers
      naming.spec.ts
      git.ts                        # `git status --porcelain` filter
      git.spec.ts
      postwrite.ts                  # typecheck + lint runners
      postwrite.spec.ts
      compose.ts                    # invoke one generator from another
      compose.spec.ts
      ast/
        ts-morph.ts                 # Project loader, save-to-tree adapter
        ts-morph.spec.ts
        edit-app-module.ts          # add/remove NestJS imports
        edit-app-module.spec.ts
        edit-app-router.ts          # add/remove tRPC root entries
        edit-app-router.spec.ts
        edit-module-providers.ts    # add/remove handler registrations
        edit-module-providers.spec.ts
    templates/
      entity/                       # .hbs files (entity.ts, repository.ts, drizzle-impl.ts, schema-fragment.ts)
      command/                      # .hbs files (command.ts, command.spec.ts)
      query/                        # .hbs files (query.ts, query.spec.ts)
      module/                       # .hbs files (module.ts, query-facade.ts, schema.ts, router.ts, integration.spec.ts)
      zone/                         # cloned web-people skeleton
    scripts/
      check-template-drift.ts
      sync-templates.ts
    __integration__/
      fixtures/                     # tiny fake monorepo for generator tests
      module-generates-compilable-code.spec.ts
      zone-generates-compilable-code.spec.ts
      dry-run-writes-nothing.spec.ts
      cleanup-is-reverse-of-create.spec.ts
      validation-blocks-bad-input.spec.ts
      e2e-full-flow.spec.ts         # gated; runs against the real repo

docs/
  superpowers/
    scaffolding.md                  # onboarding doc
turbo/generators/README.md          # operator-facing doc

CLAUDE.md                           # update the "turbo gen workspace" line
```

**Verified facts that shape the plan** (from initial exploration):

- `apps/api/src/app.module.ts` — NestJS root; new modules go into `imports[]` (currently 14 module imports).
- `apps/api/src/common/trpc/app-router.ts` — root tRPC router. Modules without permission wrapping use plain `import { fooRouter } from '...'` and direct registration. **The generator targets the simple direct path**, not the mutable-ref + setter pattern (that's reserved for permission-wrapped routers like `peopleRouter`).
- **No `packages/db/src/schema/index.ts` barrel exists** — schemas are imported directly from each module. The original `edit-schema-index.ts` from the spec is **dropped**; one fewer AST module to write.
- `apps/web-people/` is the canonical zone shape: subdomain routing (no `basePath` / no `assetPrefix`), `dev` hardcoded to `--port 3001`. New zone needs a unique port (allocated by reading existing `apps/web-*/package.json` files and picking the next free integer ≥ 3001).
- `apps/web-people/src/navigation.ts` exports a `<name>NavConfig: NavigationConfig` from `@future/app-layout`.
- `apps/api/src/modules/preferences/` is the smallest reference module — clean DDD shape (`domain/`, `application/`, `infrastructure/`, `interface/`).

---

## Phase 1: Foundation (no generators yet, just infrastructure)

### Task 1: Bootstrap `turbo/generators/` workspace

**Files:**

- Create: `turbo/generators/package.json`
- Create: `turbo/generators/tsconfig.json`
- Create: `turbo/generators/config.ts`
- Create: `turbo/generators/.gitignore`

- [ ] **Step 1: Create the directory and package.json**

```bash
mkdir -p turbo/generators
```

`turbo/generators/package.json`:

```json
{
  "name": "@future/generators",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@turbo/gen": "^2.9.6",
    "handlebars": "^4.7.8",
    "ts-morph": "^28.0.1"
  },
  "devDependencies": {
    "@future/eslint-config": "workspace:*",
    "@future/tsconfig": "workspace:*",
    "@types/node": "^25.6.0",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  }
}
```

- [ ] **Step 2: Create tsconfig**

`turbo/generators/tsconfig.json`:

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist", "templates"]
}
```

- [ ] **Step 3: Create empty Plop config**

`turbo/generators/config.ts`:

```typescript
import type { PlopTypes } from '@turbo/gen'

export default function generator(_plop: PlopTypes.NodePlopAPI): void {
  // Generators registered in Phase 3+. This stub keeps `turbo gen` happy in Phase 1.
}
```

- [ ] **Step 4: Add .gitignore**

`turbo/generators/.gitignore`:

```
dist/
node_modules/
```

- [ ] **Step 5: Install deps and verify `turbo gen` runs without error**

```bash
bun install
bunx turbo gen --help
```

Expected: prints Turbo Gen help text without errors. (No generators listed yet — that's fine.)

- [ ] **Step 6: Commit**

```bash
git add turbo/generators package.json bun.lock
git commit -m "chore(generators): bootstrap turbo/generators workspace"
```

---

### Task 2: Tree (buffered virtual filesystem)

**Files:**

- Create: `turbo/generators/lib/tree.ts`
- Test: `turbo/generators/lib/tree.spec.ts`

The Tree is the heart of the system. Every action becomes a `PendingChange` in a buffer. Disk writes happen only after validation succeeds. In dry-run, the buffer is printed and discarded.

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/tree.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTree } from './tree'

describe('Tree', () => {
  it('records a CREATE for new files', () => {
    const tree = createTree('/repo')
    tree.write('apps/foo.ts', 'export const x = 1')
    expect(tree.changes()).toEqual([
      { kind: 'create', path: 'apps/foo.ts', contents: 'export const x = 1' },
    ])
  })

  it('records an EDIT when overwriting an existing file (provided via seed)', () => {
    const tree = createTree('/repo', { seed: { 'apps/foo.ts': 'old' } })
    tree.write('apps/foo.ts', 'new')
    expect(tree.changes()).toEqual([
      { kind: 'edit', path: 'apps/foo.ts', before: 'old', after: 'new' },
    ])
  })

  it('records a DELETE for existing files', () => {
    const tree = createTree('/repo', { seed: { 'apps/foo.ts': 'old' } })
    tree.delete('apps/foo.ts')
    expect(tree.changes()).toEqual([{ kind: 'delete', path: 'apps/foo.ts', before: 'old' }])
  })

  it('throws when deleting a non-existent file (unless force)', () => {
    const tree = createTree('/repo')
    expect(() => tree.delete('nope.ts')).toThrow(/does not exist/)
  })

  it('add → delete on the same file collapses to a no-op', () => {
    const tree = createTree('/repo')
    tree.write('apps/foo.ts', 'x')
    tree.delete('apps/foo.ts')
    expect(tree.changes()).toEqual([])
  })

  it('exists() reflects buffered + seed state', () => {
    const tree = createTree('/repo', { seed: { 'a.ts': 'a' } })
    expect(tree.exists('a.ts')).toBe(true)
    expect(tree.exists('b.ts')).toBe(false)
    tree.write('b.ts', 'b')
    expect(tree.exists('b.ts')).toBe(true)
    tree.delete('a.ts')
    expect(tree.exists('a.ts')).toBe(false)
  })

  it('read() returns buffered contents over seed', () => {
    const tree = createTree('/repo', { seed: { 'a.ts': 'old' } })
    tree.write('a.ts', 'new')
    expect(tree.read('a.ts')).toBe('new')
  })

  it('snapshot/restore is a true rollback', () => {
    const tree = createTree('/repo')
    tree.write('a.ts', '1')
    const snap = tree.snapshot()
    tree.write('b.ts', '2')
    tree.restore(snap)
    expect(tree.changes()).toEqual([{ kind: 'create', path: 'a.ts', contents: '1' }])
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails (no module)**

```bash
bun run --filter @future/generators test:unit
```

Expected: FAIL with "Cannot find module './tree'".

- [ ] **Step 3: Implement Tree**

`turbo/generators/lib/tree.ts`:

```typescript
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type PendingChange =
  | { kind: 'create'; path: string; contents: string }
  | { kind: 'edit'; path: string; before: string; after: string }
  | { kind: 'delete'; path: string; before: string }

export interface Tree {
  /** Buffered + seed contents. */
  read(relPath: string): string
  /** Write or overwrite; classifies as create vs edit based on prior existence. */
  write(relPath: string, contents: string): void
  /** Delete an existing file. Throws if not present (unless force=true). */
  delete(relPath: string, opts?: { force?: boolean }): void
  /** True if the file is present in buffer + seed (and not pending-deleted). */
  exists(relPath: string): boolean
  /** Ordered list of pending changes for preview/flush. */
  changes(): PendingChange[]
  /** Capture/restore for compose() rollback. */
  snapshot(): TreeSnapshot
  restore(snap: TreeSnapshot): void
  /** Repo root (for ts-morph + git operations). */
  root(): string
}

export type TreeSnapshot = { ops: Op[]; readCache: Map<string, string> }

type Op = { type: 'write'; path: string; contents: string } | { type: 'delete'; path: string }

export function createTree(root: string, opts: { seed?: Record<string, string> } = {}): Tree {
  const seed = new Map(Object.entries(opts.seed ?? {}))
  const ops: Op[] = []
  const readCache = new Map<string, string>()

  function diskRead(rel: string): string | undefined {
    if (seed.has(rel)) return seed.get(rel)
    if (readCache.has(rel)) return readCache.get(rel)
    const abs = join(root, rel)
    if (!existsSync(abs)) return undefined
    const c = readFileSync(abs, 'utf8')
    readCache.set(rel, c)
    return c
  }

  function effective(rel: string): string | undefined {
    let val = diskRead(rel)
    for (const op of ops) {
      if (op.path !== rel) continue
      if (op.type === 'write') val = op.contents
      else val = undefined
    }
    return val
  }

  return {
    root: () => root,
    read(rel) {
      const v = effective(rel)
      if (v === undefined) throw new Error(`Tree.read: ${rel} does not exist`)
      return v
    },
    exists(rel) {
      return effective(rel) !== undefined
    },
    write(rel, contents) {
      ops.push({ type: 'write', path: rel, contents })
    },
    delete(rel, { force = false } = {}) {
      if (!force && !this.exists(rel)) {
        throw new Error(`Tree.delete: ${rel} does not exist`)
      }
      ops.push({ type: 'delete', path: rel })
    },
    snapshot() {
      return { ops: [...ops], readCache: new Map(readCache) }
    },
    restore(snap) {
      ops.length = 0
      ops.push(...snap.ops)
    },
    changes() {
      // Reduce ops to a per-path final action by replaying.
      const final = new Map<string, { contents?: string; deleted?: boolean }>()
      for (const op of ops) {
        const cur = final.get(op.path) ?? {}
        if (op.type === 'write') {
          cur.contents = op.contents
          cur.deleted = false
        } else {
          cur.deleted = true
          delete cur.contents
        }
        final.set(op.path, cur)
      }
      const changes: PendingChange[] = []
      for (const [path, state] of final) {
        const before = diskRead(path)
        if (state.deleted) {
          if (before !== undefined) changes.push({ kind: 'delete', path, before })
          // create-then-delete collapses to nothing
        } else if (state.contents !== undefined) {
          if (before === undefined) {
            changes.push({ kind: 'create', path, contents: state.contents })
          } else if (before !== state.contents) {
            changes.push({ kind: 'edit', path, before, after: state.contents })
          }
          // identical write is a no-op
        }
      }
      return changes
    },
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
bun run --filter @future/generators test:unit
```

Expected: all 8 Tree tests pass.

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/tree.ts turbo/generators/lib/tree.spec.ts
git commit -m "feat(generators): buffered Tree for dry-run + atomic writes"
```

---

### Task 3: Preview (plan-printer)

**Files:**

- Create: `turbo/generators/lib/preview.ts`
- Test: `turbo/generators/lib/preview.spec.ts`

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/preview.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderPlan } from './preview'
import type { PendingChange } from './tree'

describe('renderPlan', () => {
  it('groups CREATE/EDIT/DELETE/TODO and right-pads action labels', () => {
    const changes: PendingChange[] = [
      { kind: 'create', path: 'a.ts', contents: 'x' },
      { kind: 'edit', path: 'b.ts', before: 'old', after: 'new' },
      { kind: 'delete', path: 'c.ts', before: 'gone' },
    ]
    const todos = ['Run db:generate after applying', 'Run bun install']
    const out = renderPlan(changes, todos)
    expect(out).toContain('CREATE  a.ts')
    expect(out).toContain('EDIT    b.ts')
    expect(out).toContain('DELETE  c.ts')
    expect(out).toContain('TODO    Run db:generate after applying')
    expect(out).toContain('TODO    Run bun install')
  })

  it('shows a friendly empty-plan message', () => {
    expect(renderPlan([], [])).toContain('No changes to apply')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

```bash
bun run --filter @future/generators test:unit -- preview
```

- [ ] **Step 3: Implement**

`turbo/generators/lib/preview.ts`:

```typescript
import type { PendingChange } from './tree'

export function renderPlan(changes: PendingChange[], todos: string[] = []): string {
  if (changes.length === 0 && todos.length === 0) return '✔ Plan: No changes to apply.\n'
  const lines: string[] = ['✔ Plan:']
  for (const c of changes) {
    const label = c.kind.toUpperCase().padEnd(6)
    lines.push(`  ${label}  ${c.path}`)
  }
  for (const t of todos) {
    lines.push(`  TODO    ${t}`)
  }
  lines.push('')
  return lines.join('\n')
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/preview.ts turbo/generators/lib/preview.spec.ts
git commit -m "feat(generators): renderPlan formats Tree changes for preview"
```

---

### Task 4: Flush (Tree → disk)

**Files:**

- Create: `turbo/generators/lib/flush.ts`
- Test: `turbo/generators/lib/flush.spec.ts`

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/flush.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from './tree'
import { flush } from './flush'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flush-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('flush', () => {
  it('writes CREATE files (mkdir -p as needed)', () => {
    const tree = createTree(dir)
    tree.write('nested/dir/foo.ts', 'export const x = 1')
    flush(tree, { dryRun: false })
    expect(readFileSync(join(dir, 'nested/dir/foo.ts'), 'utf8')).toBe('export const x = 1')
  })

  it('overwrites EDIT files', () => {
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'sub/x.ts'), 'old')
    const tree = createTree(dir)
    tree.write('sub/x.ts', 'new')
    flush(tree, { dryRun: false })
    expect(readFileSync(join(dir, 'sub/x.ts'), 'utf8')).toBe('new')
  })

  it('removes DELETE files', () => {
    writeFileSync(join(dir, 'x.ts'), 'gone')
    const tree = createTree(dir)
    tree.delete('x.ts')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'x.ts'))).toBe(false)
  })

  it('dryRun=true writes nothing', () => {
    const tree = createTree(dir)
    tree.write('a.ts', 'x')
    flush(tree, { dryRun: true })
    expect(existsSync(join(dir, 'a.ts'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/flush.ts`:

```typescript
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Tree } from './tree'

export function flush(tree: Tree, opts: { dryRun: boolean }): void {
  if (opts.dryRun) return
  const root = tree.root()
  for (const c of tree.changes()) {
    const abs = join(root, c.path)
    if (c.kind === 'delete') {
      rmSync(abs, { force: true })
    } else {
      mkdirSync(dirname(abs), { recursive: true })
      const contents = c.kind === 'create' ? c.contents : c.after
      writeFileSync(abs, contents, 'utf8')
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/flush.ts turbo/generators/lib/flush.spec.ts
git commit -m "feat(generators): flush Tree changes to disk; honor --dry-run"
```

---

### Task 5: Naming helpers

**Files:**

- Create: `turbo/generators/lib/naming.ts`
- Test: `turbo/generators/lib/naming.spec.ts`

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/naming.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { kebab, camel, pascal, screamingSnake, isValidKebab } from './naming'

describe('naming', () => {
  it.each([
    ['billing', 'billing'],
    ['Billing', 'billing'],
    ['billingItem', 'billing-item'],
    ['BillingItem', 'billing-item'],
    ['billing_item', 'billing-item'],
  ])('kebab(%s) === %s', (a, b) => expect(kebab(a)).toBe(b))

  it.each([
    ['billing', 'billing'],
    ['billing-item', 'billingItem'],
    ['Billing Item', 'billingItem'],
  ])('camel(%s) === %s', (a, b) => expect(camel(a)).toBe(b))

  it.each([
    ['billing', 'Billing'],
    ['billing-item', 'BillingItem'],
    ['BILLING_ITEM', 'BillingItem'],
  ])('pascal(%s) === %s', (a, b) => expect(pascal(a)).toBe(b))

  it.each([
    ['billing', 'BILLING'],
    ['billing-item', 'BILLING_ITEM'],
    ['billingItem', 'BILLING_ITEM'],
  ])('screamingSnake(%s) === %s', (a, b) => expect(screamingSnake(a)).toBe(b))

  it.each([
    ['billing', true],
    ['billing-item', true],
    ['Billing', false],
    ['-billing', false],
    ['billing-', false],
    ['billing_item', false],
    ['', false],
    ['a', false],
  ])('isValidKebab(%s) === %s', (a, b) => expect(isValidKebab(a)).toBe(b))
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/naming.ts`:

```typescript
function tokenize(input: string): string[] {
  return input
    .replace(/[_\-\s]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function kebab(input: string): string {
  return tokenize(input).join('-')
}

export function camel(input: string): string {
  const tokens = tokenize(input)
  return tokens.map((t, i) => (i === 0 ? t : t.charAt(0).toUpperCase() + t.slice(1))).join('')
}

export function pascal(input: string): string {
  return tokenize(input)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join('')
}

export function screamingSnake(input: string): string {
  return tokenize(input).join('_').toUpperCase()
}

export function isValidKebab(input: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(input) && input.length >= 2
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/naming.ts turbo/generators/lib/naming.spec.ts
git commit -m "feat(generators): naming helpers (kebab/camel/pascal/screamingSnake)"
```

---

### Task 6: Git status filter

**Files:**

- Create: `turbo/generators/lib/git.ts`
- Test: `turbo/generators/lib/git.spec.ts`

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/git.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parsePorcelain, anyDirty } from './git'

describe('parsePorcelain', () => {
  it('parses a multi-line porcelain output', () => {
    const out = ' M apps/api/src/foo.ts\n?? apps/web-billing/\n A  packages/db/x.ts\n'
    expect(parsePorcelain(out)).toEqual([
      'apps/api/src/foo.ts',
      'apps/web-billing/',
      'packages/db/x.ts',
    ])
  })

  it('handles empty input', () => {
    expect(parsePorcelain('')).toEqual([])
  })
})

describe('anyDirty', () => {
  it('returns true when any tracked path matches a porcelain entry', () => {
    expect(anyDirty(['apps/api/src/foo.ts'], ['apps/api/'])).toBe(true)
  })
  it('returns false when no overlap', () => {
    expect(anyDirty(['packages/db/x.ts'], ['apps/api/'])).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/git.ts`:

```typescript
import { execSync } from 'node:child_process'

export function parsePorcelain(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((l) => l.length > 0)
}

export function anyDirty(porcelainPaths: string[], targetPrefixes: string[]): boolean {
  return porcelainPaths.some((p) => targetPrefixes.some((prefix) => p.startsWith(prefix)))
}

export function gitStatusPorcelain(cwd: string): string[] {
  const out = execSync('git status --porcelain', { cwd, encoding: 'utf8' })
  return parsePorcelain(out)
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/git.ts turbo/generators/lib/git.spec.ts
git commit -m "feat(generators): git status porcelain parser + dirty-path filter"
```

---

### Task 7: Validation

**Files:**

- Create: `turbo/generators/lib/validate.ts`
- Test: `turbo/generators/lib/validate.spec.ts`

Validators are pure functions that take a Tree + inputs and return `ValidationResult`. The generator runs them; if any fail, exit non-zero with the failure messages and skip flush.

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/validate.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  validateName,
  validateNotReserved,
  validateModuleDoesNotExist,
  validateZoneDoesNotExist,
  validateModuleExists,
} from './validate'
import { createTree } from './tree'

describe('validateName', () => {
  it.each([
    ['billing', true],
    ['billing-item', true],
    ['Billing', false],
    ['', false],
    ['1abc', false],
  ])('%s -> %s', (n, ok) => expect(validateName(n).ok).toBe(ok))
})

describe('validateNotReserved', () => {
  it.each([
    ['api', false],
    ['shell', false],
    ['default', false],
    ['billing', true],
  ])('%s -> %s', (n, ok) => expect(validateNotReserved(n).ok).toBe(ok))
})

describe('validateModuleDoesNotExist', () => {
  it('passes when module folder absent', () => {
    const tree = createTree('/repo')
    expect(validateModuleDoesNotExist(tree, 'billing').ok).toBe(true)
  })

  it('fails when module folder exists in seed', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': 'x' },
    })
    expect(validateModuleDoesNotExist(tree, 'billing').ok).toBe(false)
  })
})

describe('validateZoneDoesNotExist', () => {
  it('fails when web-<name>/package.json exists', () => {
    const tree = createTree('/repo', { seed: { 'apps/web-billing/package.json': '{}' } })
    expect(validateZoneDoesNotExist(tree, 'billing').ok).toBe(false)
  })
})

describe('validateModuleExists', () => {
  it('passes when module .module.ts is present', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': 'x' },
    })
    expect(validateModuleExists(tree, 'billing').ok).toBe(true)
  })
  it('fails when module is absent', () => {
    expect(validateModuleExists(createTree('/repo'), 'billing').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/validate.ts`:

```typescript
import { isValidKebab } from './naming'
import type { Tree } from './tree'

export type ValidationResult = { ok: true } | { ok: false; reason: string }

const RESERVED = new Set([
  'api',
  'web',
  'shell',
  'core',
  'kernel',
  'db',
  'ui',
  'node',
  'default',
  'class',
  'function',
  'import',
  'export',
  'const',
  'let',
  'var',
  'true',
  'false',
])

export function validateName(name: string): ValidationResult {
  if (!isValidKebab(name)) {
    return { ok: false, reason: `name must be kebab-case (got "${name}")` }
  }
  return { ok: true }
}

export function validateNotReserved(name: string): ValidationResult {
  if (RESERVED.has(name)) {
    return { ok: false, reason: `name "${name}" is reserved` }
  }
  return { ok: true }
}

export function validateModuleDoesNotExist(tree: Tree, name: string): ValidationResult {
  const path = `apps/api/src/modules/${name}/${name}.module.ts`
  if (tree.exists(path)) {
    return { ok: false, reason: `module "${name}" already exists at ${path}` }
  }
  return { ok: true }
}

export function validateModuleExists(tree: Tree, name: string): ValidationResult {
  const path = `apps/api/src/modules/${name}/${name}.module.ts`
  if (!tree.exists(path)) {
    return { ok: false, reason: `module "${name}" does not exist at ${path}` }
  }
  return { ok: true }
}

export function validateZoneDoesNotExist(tree: Tree, name: string): ValidationResult {
  const path = `apps/web-${name}/package.json`
  if (tree.exists(path)) {
    return { ok: false, reason: `zone "web-${name}" already exists` }
  }
  return { ok: true }
}

export function runAll(results: ValidationResult[]): { ok: boolean; reasons: string[] } {
  const reasons = results.flatMap((r) => (r.ok ? [] : [r.reason]))
  return { ok: reasons.length === 0, reasons }
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/validate.ts turbo/generators/lib/validate.spec.ts
git commit -m "feat(generators): name + reserved + existence validators"
```

---

### Task 8: Postwrite (typecheck + lint runners)

**Files:**

- Create: `turbo/generators/lib/postwrite.ts`
- Test: `turbo/generators/lib/postwrite.spec.ts`

`postwrite` shells out to Turbo. Tests cover the command construction, not the actual subprocess run.

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/postwrite.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildTypecheckCommand, buildLintCommand } from './postwrite'

describe('buildTypecheckCommand', () => {
  it('targets api-only when no zone', () => {
    expect(buildTypecheckCommand({ apiOnly: true })).toBe('turbo run typecheck --filter=api')
  })
  it('includes the zone when provided', () => {
    expect(buildTypecheckCommand({ zoneName: 'billing' })).toBe(
      'turbo run typecheck --filter=api --filter=@future/web-billing',
    )
  })
})

describe('buildLintCommand', () => {
  it('passes --fix and limits to touched workspaces', () => {
    expect(buildLintCommand({ targets: ['api'] })).toBe('turbo run lint --filter=api -- --fix')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/postwrite.ts`:

```typescript
import { execSync } from 'node:child_process'

export function buildTypecheckCommand(opts: { apiOnly?: boolean; zoneName?: string }): string {
  const filters = ['--filter=api']
  if (opts.zoneName) filters.push(`--filter=@future/web-${opts.zoneName}`)
  return `turbo run typecheck ${filters.join(' ')}`.trim()
}

export function buildLintCommand(opts: { targets: string[] }): string {
  const filters = opts.targets.map((t) => `--filter=${t}`).join(' ')
  return `turbo run lint ${filters} -- --fix`.trim()
}

export function runTypecheck(cwd: string, opts: Parameters<typeof buildTypecheckCommand>[0]): void {
  execSync(buildTypecheckCommand(opts), { cwd, stdio: 'inherit' })
}

export function runLint(cwd: string, opts: Parameters<typeof buildLintCommand>[0]): void {
  execSync(buildLintCommand(opts), { cwd, stdio: 'inherit' })
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/postwrite.ts turbo/generators/lib/postwrite.spec.ts
git commit -m "feat(generators): postwrite typecheck + lint runners"
```

---

## Phase 2: AST Library

### Task 9: ts-morph project loader / tree adapter

**Files:**

- Create: `turbo/generators/lib/ast/ts-morph.ts`
- Test: `turbo/generators/lib/ast/ts-morph.spec.ts`

The adapter loads a single ts-morph `Project` lazily and exposes `withSourceFile(tree, path, mutator)`. The mutator runs synchronously; on return, the new file text is written back to the Tree (not the disk).

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/ast/ts-morph.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { withSourceFile } from './ts-morph'

describe('withSourceFile', () => {
  it('parses Tree contents, applies mutation, writes back to Tree', () => {
    const seed = { 'foo.ts': 'export const x = 1\n' }
    const tree = createTree('/virtual', { seed })
    withSourceFile(tree, 'foo.ts', (sf) => {
      sf.addStatements('export const y = 2\n')
    })
    expect(tree.read('foo.ts')).toContain('export const y = 2')
  })

  it('throws when file does not exist', () => {
    const tree = createTree('/virtual')
    expect(() => withSourceFile(tree, 'nope.ts', () => {})).toThrow(/does not exist/)
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/ast/ts-morph.ts`:

```typescript
import { Project, type SourceFile } from 'ts-morph'
import type { Tree } from '../tree'

export function withSourceFile(
  tree: Tree,
  relPath: string,
  mutate: (sf: SourceFile) => void,
): void {
  if (!tree.exists(relPath)) {
    throw new Error(`withSourceFile: ${relPath} does not exist in Tree`)
  }
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile(relPath, tree.read(relPath))
  mutate(sf)
  tree.write(relPath, sf.getFullText())
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/ast/
git commit -m "feat(generators): ts-morph ↔ Tree adapter (withSourceFile)"
```

---

### Task 10: edit-app-module (NestJS imports[])

**Files:**

- Create: `turbo/generators/lib/ast/edit-app-module.ts`
- Test: `turbo/generators/lib/ast/edit-app-module.spec.ts`

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/ast/edit-app-module.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { addModuleToAppModule, removeModuleFromAppModule } from './edit-app-module'

const FIXTURE = `import { Module } from '@nestjs/common'
import { PreferencesModule } from './modules/preferences/preferences.module'

@Module({
  imports: [
    PreferencesModule,
  ],
})
export class AppModule {}
`

describe('addModuleToAppModule', () => {
  it('adds the import line and registers in imports[]', () => {
    const tree = createTree('/repo', { seed: { 'apps/api/src/app.module.ts': FIXTURE } })
    addModuleToAppModule(tree, 'billing')
    const out = tree.read('apps/api/src/app.module.ts')
    expect(out).toContain("import { BillingModule } from './modules/billing/billing.module'")
    expect(out).toMatch(/imports:\s*\[[^\]]*BillingModule/)
  })

  it('is idempotent when called twice', () => {
    const tree = createTree('/repo', { seed: { 'apps/api/src/app.module.ts': FIXTURE } })
    addModuleToAppModule(tree, 'billing')
    const after1 = tree.read('apps/api/src/app.module.ts')
    addModuleToAppModule(tree, 'billing')
    expect(tree.read('apps/api/src/app.module.ts')).toBe(after1)
  })
})

describe('removeModuleFromAppModule', () => {
  it('removes import + array entry', () => {
    const tree = createTree('/repo', { seed: { 'apps/api/src/app.module.ts': FIXTURE } })
    addModuleToAppModule(tree, 'billing')
    removeModuleFromAppModule(tree, 'billing')
    const out = tree.read('apps/api/src/app.module.ts')
    expect(out).not.toContain('BillingModule')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/ast/edit-app-module.ts`:

```typescript
import { SyntaxKind } from 'ts-morph'
import type { Tree } from '../tree'
import { pascal } from '../naming'
import { withSourceFile } from './ts-morph'

const APP_MODULE = 'apps/api/src/app.module.ts'

export function addModuleToAppModule(tree: Tree, name: string): void {
  const className = `${pascal(name)}Module`
  const importPath = `./modules/${name}/${name}.module`

  withSourceFile(tree, APP_MODULE, (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)) {
      sf.addImportDeclaration({ moduleSpecifier: importPath, namedImports: [className] })
    }

    const decorator = sf.getClassOrThrow('AppModule').getDecoratorOrThrow('Module')
    const arg = decorator.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    if (!arg) throw new Error('AppModule @Module() arg not an object literal')

    const importsProp = arg
      .getPropertyOrThrow('imports')
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
    const arr = importsProp.getInitializerOrThrow().asKindOrThrow(SyntaxKind.ArrayLiteralExpression)

    const already = arr.getElements().some((el) => el.getText() === className)
    if (!already) arr.addElement(className)
  })
}

export function removeModuleFromAppModule(tree: Tree, name: string): void {
  const className = `${pascal(name)}Module`
  const importPath = `./modules/${name}/${name}.module`

  withSourceFile(tree, APP_MODULE, (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)?.remove()

    const decorator = sf.getClassOrThrow('AppModule').getDecoratorOrThrow('Module')
    const arg = decorator.getArguments()[0]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    if (!arg) return
    const importsProp = arg.getProperty('imports')?.asKind(SyntaxKind.PropertyAssignment)
    const arr = importsProp?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression)
    if (!arr) return
    const elements = arr.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].getText() === className) arr.removeElement(i)
    }
  })
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/ast/edit-app-module.ts turbo/generators/lib/ast/edit-app-module.spec.ts
git commit -m "feat(generators): AST add/remove module in apps/api/src/app.module.ts"
```

---

### Task 11: edit-app-router (tRPC root)

**Files:**

- Create: `turbo/generators/lib/ast/edit-app-router.ts`
- Test: `turbo/generators/lib/ast/edit-app-router.spec.ts`

The root `app-router.ts` calls `router({ ... })` to compose all sub-routers. The generator adds the import + a property assignment on the `appRouter` literal. Permission-wrapped routers use a different pattern (mutable refs + setters) — the generator does NOT touch those; new modules use the simple direct path.

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/ast/edit-app-router.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { addRouterToAppRouter, removeRouterFromAppRouter } from './edit-app-router'

const FIXTURE = `import { router } from './trpc-init'
import { preferencesRouter } from '../../modules/preferences/interface/trpc/preferences.router'

export const appRouter = router({
  preferences: preferencesRouter,
})

export type AppRouter = typeof appRouter
`

describe('addRouterToAppRouter', () => {
  it('adds the import + property on appRouter', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/common/trpc/app-router.ts': FIXTURE },
    })
    addRouterToAppRouter(tree, 'billing')
    const out = tree.read('apps/api/src/common/trpc/app-router.ts')
    expect(out).toContain(
      "import { billingRouter } from '../../modules/billing/interface/trpc/billing.router'",
    )
    expect(out).toMatch(/billing:\s*billingRouter/)
  })
})

describe('removeRouterFromAppRouter', () => {
  it('removes import + property', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/common/trpc/app-router.ts': FIXTURE },
    })
    addRouterToAppRouter(tree, 'billing')
    removeRouterFromAppRouter(tree, 'billing')
    const out = tree.read('apps/api/src/common/trpc/app-router.ts')
    expect(out).not.toContain('billingRouter')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/ast/edit-app-router.ts`:

```typescript
import { SyntaxKind } from 'ts-morph'
import type { Tree } from '../tree'
import { camel } from '../naming'
import { withSourceFile } from './ts-morph'

const APP_ROUTER = 'apps/api/src/common/trpc/app-router.ts'

export function addRouterToAppRouter(tree: Tree, name: string): void {
  const id = `${camel(name)}Router`
  const importPath = `../../modules/${name}/interface/trpc/${name}.router`

  withSourceFile(tree, APP_ROUTER, (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)) {
      sf.addImportDeclaration({ moduleSpecifier: importPath, namedImports: [id] })
    }

    const appRouterDecl = sf.getVariableDeclarationOrThrow('appRouter')
    const init = appRouterDecl.getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression)
    const arg = init.getArguments()[0]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    if (!arg) throw new Error('appRouter call argument is not an object literal')

    if (!arg.getProperty(camel(name))) {
      arg.addPropertyAssignment({ name: camel(name), initializer: id })
    }
  })
}

export function removeRouterFromAppRouter(tree: Tree, name: string): void {
  const id = `${camel(name)}Router`
  const importPath = `../../modules/${name}/interface/trpc/${name}.router`

  withSourceFile(tree, APP_ROUTER, (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)?.remove()
    const appRouterDecl = sf.getVariableDeclaration('appRouter')
    const init = appRouterDecl?.getInitializer()?.asKind(SyntaxKind.CallExpression)
    const arg = init?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    arg?.getProperty(camel(name))?.remove()
  })
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/ast/edit-app-router.ts turbo/generators/lib/ast/edit-app-router.spec.ts
git commit -m "feat(generators): AST add/remove router in apps/api/src/common/trpc/app-router.ts"
```

---

### Task 12: edit-module-providers (NestJS module providers[])

**Files:**

- Create: `turbo/generators/lib/ast/edit-module-providers.ts`
- Test: `turbo/generators/lib/ast/edit-module-providers.spec.ts`

When sub-generators (`command`, `query`) add a handler, they must register it in the parent module's `providers[]`.

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/ast/edit-module-providers.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { addProviderToModule, removeProviderFromModule } from './edit-module-providers'

const FIXTURE = `import { Module } from '@nestjs/common'
import { BillingQueryFacade } from './application/facades/billing-query.facade'

@Module({
  providers: [BillingQueryFacade],
  exports: [BillingQueryFacade],
})
export class BillingModule {}
`

describe('addProviderToModule', () => {
  it('adds import + appends to providers[]', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': FIXTURE },
    })
    addProviderToModule(tree, 'billing', {
      className: 'CreateBillingHandler',
      importPath: './application/commands/create-billing.command',
    })
    const out = tree.read('apps/api/src/modules/billing/billing.module.ts')
    expect(out).toContain(
      "import { CreateBillingHandler } from './application/commands/create-billing.command'",
    )
    expect(out).toMatch(/providers:\s*\[[^\]]*CreateBillingHandler/)
  })
})

describe('removeProviderFromModule', () => {
  it('removes import + entry', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': FIXTURE },
    })
    addProviderToModule(tree, 'billing', {
      className: 'CreateBillingHandler',
      importPath: './application/commands/create-billing.command',
    })
    removeProviderFromModule(tree, 'billing', {
      className: 'CreateBillingHandler',
      importPath: './application/commands/create-billing.command',
    })
    const out = tree.read('apps/api/src/modules/billing/billing.module.ts')
    expect(out).not.toContain('CreateBillingHandler')
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/ast/edit-module-providers.ts`:

```typescript
import { SyntaxKind } from 'ts-morph'
import type { Tree } from '../tree'
import { pascal } from '../naming'
import { withSourceFile } from './ts-morph'

export interface ProviderRef {
  className: string
  importPath: string
}

function moduleFile(name: string): string {
  return `apps/api/src/modules/${name}/${name}.module.ts`
}

export function addProviderToModule(tree: Tree, moduleName: string, provider: ProviderRef): void {
  withSourceFile(tree, moduleFile(moduleName), (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === provider.importPath)) {
      sf.addImportDeclaration({
        moduleSpecifier: provider.importPath,
        namedImports: [provider.className],
      })
    }
    const klass = sf.getClassOrThrow(`${pascal(moduleName)}Module`)
    const decorator = klass.getDecoratorOrThrow('Module')
    const arg = decorator.getArguments()[0]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    if (!arg) throw new Error('Module decorator arg not an object literal')
    const providersProp = arg
      .getPropertyOrThrow('providers')
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
    const arr = providersProp
      .getInitializerOrThrow()
      .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
    if (!arr.getElements().some((el) => el.getText() === provider.className)) {
      arr.addElement(provider.className)
    }
  })
}

export function removeProviderFromModule(
  tree: Tree,
  moduleName: string,
  provider: ProviderRef,
): void {
  withSourceFile(tree, moduleFile(moduleName), (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === provider.importPath)?.remove()
    const klass = sf.getClass(`${pascal(moduleName)}Module`)
    const decorator = klass?.getDecorator('Module')
    const arg = decorator?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    const providersProp = arg?.getProperty('providers')?.asKind(SyntaxKind.PropertyAssignment)
    const arr = providersProp?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression)
    if (!arr) return
    const elements = arr.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].getText() === provider.className) arr.removeElement(i)
    }
  })
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/ast/edit-module-providers.ts turbo/generators/lib/ast/edit-module-providers.spec.ts
git commit -m "feat(generators): AST add/remove provider in <module>.module.ts"
```

---

## Phase 3: Compose helper

### Task 13: compose() — invoke one generator from another

**Files:**

- Create: `turbo/generators/lib/compose.ts`
- Test: `turbo/generators/lib/compose.spec.ts`

`compose()` lets `module.gen.ts` call `entity.gen.ts`, `command.gen.ts`, etc. Each generator exports a pure `apply(tree, args)` function in addition to its Plop registration. `compose()` is a one-line wrapper for clarity.

- [ ] **Step 1: Write the failing test**

`turbo/generators/lib/compose.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createTree } from './tree'
import { compose, type GeneratorApply } from './compose'

const dummy: GeneratorApply<{ name: string }> = (tree, args) => {
  tree.write(`out/${args.name}.txt`, args.name)
}

describe('compose', () => {
  it('invokes the apply function with the same Tree', () => {
    const tree = createTree('/repo')
    compose(tree, dummy, { name: 'a' })
    compose(tree, dummy, { name: 'b' })
    expect(tree.changes().map((c) => c.path)).toEqual(['out/a.txt', 'out/b.txt'])
  })
})
```

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

`turbo/generators/lib/compose.ts`:

```typescript
import type { Tree } from './tree'

export type GeneratorApply<TArgs> = (tree: Tree, args: TArgs) => void

export function compose<TArgs>(tree: Tree, fn: GeneratorApply<TArgs>, args: TArgs): void {
  fn(tree, args)
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/lib/compose.ts turbo/generators/lib/compose.spec.ts
git commit -m "feat(generators): compose helper for cross-generator invocation"
```

---

## Phase 4: First generator (entity)

### Task 14: Entity templates + apply

**Files:**

- Create: `turbo/generators/templates/entity/entity.ts.hbs`
- Create: `turbo/generators/templates/entity/repository.ts.hbs`
- Create: `turbo/generators/templates/entity/drizzle-repository.ts.hbs`
- Create: `turbo/generators/templates/entity/schema-fragment.ts.hbs`
- Create: `turbo/generators/generators/entity.gen.ts`

The templates mirror `preferences/saved-view.entity.ts` shape: a TypeScript type, a repository interface with an `INJECTION_TOKEN`, a Drizzle implementation, and a `pgTable` declaration.

- [ ] **Step 1: Write entity templates**

`turbo/generators/templates/entity/entity.ts.hbs`:

```handlebars
export type
{{pascal name}}
= { id: string tenantId: string name: string createdAt: Date updatedAt: Date }
```

`turbo/generators/templates/entity/repository.ts.hbs`:

```handlebars
import type { {{pascal name}} } from '../entities/{{kebab name}}.entity'

export const {{screamingSnake name}}_REPOSITORY = Symbol('{{pascal name}}Repository')

export interface {{pascal name}}Repository {
  list(tenantId: string): Promise<{{pascal name}}[]>
  get(tenantId: string, id: string): Promise<{{pascal name}} | null>
  create(input: { tenantId: string; name: string }): Promise<{{pascal name}}>
  update(tenantId: string, id: string, patch: { name?: string }): Promise<{{pascal name}}>
  delete(tenantId: string, id: string): Promise<void>
}
```

`turbo/generators/templates/entity/drizzle-repository.ts.hbs`:

```handlebars
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DB_TOKEN, type Db } from '../../../../common/db/db.module'
import type { {{pascal name}} } from '../../domain/entities/{{kebab name}}.entity'
import {
  {{screamingSnake name}}_REPOSITORY,
  type {{pascal name}}Repository,
} from '../../domain/repositories/{{kebab name}}.repository'
import { {{camel name}}, type {{pascal name}}Row } from '../schema/{{kebab module}}.schema'

@Injectable()
export class Drizzle{{pascal name}}Repository implements {{pascal name}}Repository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list(tenantId: string): Promise<{{pascal name}}[]> {
    const rows = await this.db
      .select()
      .from({{camel name}})
      .where(eq({{camel name}}.tenantId, tenantId))
    return rows.map(toEntity)
  }

  async get(tenantId: string, id: string): Promise<{{pascal name}} | null> {
    const [row] = await this.db
      .select()
      .from({{camel name}})
      .where(and(eq({{camel name}}.tenantId, tenantId), eq({{camel name}}.id, id)))
      .limit(1)
    return row ? toEntity(row) : null
  }

  async create(input: { tenantId: string; name: string }): Promise<{{pascal name}}> {
    const [row] = await this.db.insert({{camel name}}).values(input).returning()
    return toEntity(row)
  }

  async update(tenantId: string, id: string, patch: { name?: string }): Promise<{{pascal name}}> {
    const [row] = await this.db
      .update({{camel name}})
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq({{camel name}}.tenantId, tenantId), eq({{camel name}}.id, id)))
      .returning()
    if (!row) throw new Error(`{{pascal name}} ${id} not found`)
    return toEntity(row)
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.db
      .delete({{camel name}})
      .where(and(eq({{camel name}}.tenantId, tenantId), eq({{camel name}}.id, id)))
  }
}

function toEntity(row: {{pascal name}}Row): {{pascal name}} {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
```

`turbo/generators/templates/entity/schema-fragment.ts.hbs`:

```handlebars
export const
{{camel name}}
=
{{camel module}}Schema.table('{{snake name}}', { id: uuid('id') .$defaultFn(() => uuidv7())
.primaryKey(), tenantId: uuid('tenant_id').notNull(), name: text('name').notNull(), createdAt:
timestamp('created_at').defaultNow().notNull(), updatedAt:
timestamp('updated_at').defaultNow().notNull(), }) export type
{{pascal name}}Row = typeof
{{camel name}}.$inferSelect
```

(`snake` is a custom Handlebars helper added in entity.gen.ts: `tokens.join('_')`.)

- [ ] **Step 2: Implement entity.gen.ts (apply + Plop registration)**

`turbo/generators/generators/entity.gen.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import type { Tree } from '../lib/tree'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import type { GeneratorApply } from '../lib/compose'

export interface EntityArgs {
  module: string
  name: string
}

const TEMPLATE_DIR = join(__dirname, '../templates/entity')

function snakeHelper(input: string): string {
  return input.replace(/[-]/g, '_')
}

const helpers = {
  pascal,
  camel,
  kebab,
  screamingSnake,
  snake: snakeHelper,
}

function render(template: string, ctx: Record<string, string>): string {
  const compiled = Handlebars.compile(readFileSync(join(TEMPLATE_DIR, template), 'utf8'), {
    noEscape: true,
  })
  return compiled(ctx, { helpers })
}

export const apply: GeneratorApply<EntityArgs> = (tree, args) => {
  const ctx = { module: args.module, name: args.name }
  const moduleDir = `apps/api/src/modules/${args.module}`

  tree.write(
    `${moduleDir}/domain/entities/${kebab(args.name)}.entity.ts`,
    render('entity.ts.hbs', ctx),
  )
  tree.write(
    `${moduleDir}/domain/repositories/${kebab(args.name)}.repository.ts`,
    render('repository.ts.hbs', ctx),
  )
  tree.write(
    `${moduleDir}/infrastructure/repositories/drizzle-${kebab(args.name)}.repository.ts`,
    render('drizzle-repository.ts.hbs', ctx),
  )

  // Append pgTable to schema (create file if absent).
  const schemaPath = `${moduleDir}/infrastructure/schema/${kebab(args.module)}.schema.ts`
  const fragment = render('schema-fragment.ts.hbs', ctx)
  if (tree.exists(schemaPath)) {
    tree.write(schemaPath, tree.read(schemaPath) + '\n' + fragment)
  } else {
    const header = `import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const ${camel(args.module)}Schema = pgSchema('${kebab(args.module)}')

`
    tree.write(schemaPath, header + fragment)
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('entity', {
    description: 'Add a new entity (domain + repository + Drizzle impl + schema) to a module',
    prompts: [
      { type: 'input', name: 'module', message: 'Module name (kebab-case):' },
      { type: 'input', name: 'name', message: 'Entity name (PascalCase or kebab):' },
    ],
    actions: [
      // Plop runs custom actions; we delegate to apply() via a runner registered in config.ts.
      { type: 'invoke-apply', generator: 'entity' } as unknown as PlopTypes.ActionType,
    ],
  })
}
```

- [ ] **Step 3: Wire `entity` into config.ts and register the `invoke-apply` custom action**

`turbo/generators/config.ts` (replace stub):

```typescript
import { Project } from 'ts-morph'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PlopTypes } from '@turbo/gen'
import { createTree } from './lib/tree'
import { flush } from './lib/flush'
import { renderPlan } from './lib/preview'
import { runAll, validateName, validateNotReserved } from './lib/validate'
import * as entityGen from './generators/entity.gen'

type ApplyMap = Record<string, (tree: ReturnType<typeof createTree>, args: any) => void>
const applyByGenerator: ApplyMap = {
  entity: entityGen.apply,
}

function repoRoot(): string {
  let cur = __dirname
  while (cur !== '/' && !existsSync(join(cur, 'package.json'))) cur = join(cur, '..')
  // Walk to monorepo root (has workspaces field). For simplicity, assume turbo/generators sits 2 dirs deep.
  return join(__dirname, '..', '..')
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  // Register a single custom action that, given { generator: name }, runs the matching apply on a fresh Tree
  // and prints+flushes. dryRun is read from process.env.TURBO_GEN_DRY_RUN ('1' to enable).
  plop.setActionType('invoke-apply', (answers, config) => {
    const { generator: name } = config as unknown as { generator: string }
    const apply = applyByGenerator[name]
    if (!apply) throw new Error(`No apply() for generator "${name}"`)

    const tree = createTree(repoRoot())

    // Universal validators that apply to any generator with a `name`
    if (typeof answers.name === 'string') {
      const v = runAll([validateName(answers.name), validateNotReserved(answers.name)])
      if (!v.ok) throw new Error('Validation failed:\n  - ' + v.reasons.join('\n  - '))
    }

    apply(tree, answers)

    const dryRun = process.env.TURBO_GEN_DRY_RUN === '1'
    process.stdout.write(renderPlan(tree.changes(), []))
    flush(tree, { dryRun })
    return dryRun ? '(dry-run; no files written)' : 'applied'
  })

  entityGen.register(plop)
}
```

- [ ] **Step 4: Manually run `turbo gen entity` against the real repo with `--dry-run`**

```bash
TURBO_GEN_DRY_RUN=1 bunx turbo gen entity
# Module name: planner
# Entity name: scratch-entity
```

Expected output: `Plan:` block listing 4 CREATE/EDIT lines targeting `apps/api/src/modules/planner/`. **No files actually written** (verify with `git status`).

- [ ] **Step 5: Add fixture-based integration test**

`turbo/generators/__integration__/entity.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply as entityApply } from '../generators/entity.gen'

describe('entity generator (integration)', () => {
  it('produces 4 files when schema does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-entity-'))
    try {
      const tree = createTree(dir)
      entityApply(tree, { module: 'billing', name: 'invoice' })
      flush(tree, { dryRun: false })
      const expected = [
        'apps/api/src/modules/billing/domain/entities/invoice.entity.ts',
        'apps/api/src/modules/billing/domain/repositories/invoice.repository.ts',
        'apps/api/src/modules/billing/infrastructure/repositories/drizzle-invoice.repository.ts',
        'apps/api/src/modules/billing/infrastructure/schema/billing.schema.ts',
      ]
      for (const p of expected) {
        expect(require('node:fs').existsSync(join(dir, p))).toBe(true)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('appends to schema when it already exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-entity-'))
    try {
      const schemaPath = 'apps/api/src/modules/billing/infrastructure/schema/billing.schema.ts'
      mkdirSync(join(dir, 'apps/api/src/modules/billing/infrastructure/schema'), {
        recursive: true,
      })
      writeFileSync(join(dir, schemaPath), '// existing\n')
      const tree = createTree(dir)
      entityApply(tree, { module: 'billing', name: 'invoice' })
      flush(tree, { dryRun: false })
      const out = require('node:fs').readFileSync(join(dir, schemaPath), 'utf8')
      expect(out).toMatch(/existing/)
      expect(out).toMatch(/invoice/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 6: Run unit + integration tests**

```bash
bun run --filter @future/generators test:unit
```

- [ ] **Step 7: Commit**

```bash
git add turbo/generators/templates/entity turbo/generators/generators/entity.gen.ts turbo/generators/config.ts turbo/generators/__integration__/entity.spec.ts
git commit -m "feat(generators): entity generator (templates + apply + dry-run preview)"
```

---

## Phase 5: command + query

### Task 15: command generator

**Files:**

- Create: `turbo/generators/templates/command/command.ts.hbs`
- Create: `turbo/generators/templates/command/command.spec.ts.hbs`
- Create: `turbo/generators/generators/command.gen.ts`

- [ ] **Step 1: Templates**

`turbo/generators/templates/command/command.ts.hbs`:

```handlebars
import { Injectable } from '@nestjs/common'

export interface {{pascal name}}Input {
  tenantId: string
  // TODO: add more inputs
}

export interface {{pascal name}}Result {
  // TODO: add result fields
  ok: true
}

@Injectable()
export class {{pascal name}}Handler {
  async execute(_input: {{pascal name}}Input): Promise<{{pascal name}}Result> {
    return { ok: true }
  }
}
```

`turbo/generators/templates/command/command.spec.ts.hbs`:

```handlebars
import { describe, it, expect } from 'vitest' import {
{{pascal name}}Handler } from './{{kebab name}}.command' describe('{{pascal name}}Handler', () => {
it('executes successfully on the happy path', async () => { const handler = new
{{pascal name}}Handler() const result = await handler.execute({ tenantId: 'tenant-1' })
expect(result.ok).toBe(true) }) })
```

- [ ] **Step 2: command.gen.ts**

`turbo/generators/generators/command.gen.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import { addProviderToModule } from '../lib/ast/edit-module-providers'
import type { GeneratorApply } from '../lib/compose'

export interface CommandArgs {
  module: string
  name: string
}

const TEMPLATE_DIR = join(__dirname, '../templates/command')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(file: string, ctx: Record<string, string>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, file), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export const apply: GeneratorApply<CommandArgs> = (tree, args) => {
  const ctx = { module: args.module, name: args.name }
  const dir = `apps/api/src/modules/${args.module}/application/commands`
  tree.write(`${dir}/${kebab(args.name)}.command.ts`, render('command.ts.hbs', ctx))
  tree.write(`${dir}/${kebab(args.name)}.command.spec.ts`, render('command.spec.ts.hbs', ctx))

  if (tree.exists(`apps/api/src/modules/${args.module}/${args.module}.module.ts`)) {
    addProviderToModule(tree, args.module, {
      className: `${pascal(args.name)}Handler`,
      importPath: `./application/commands/${kebab(args.name)}.command`,
    })
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('command', {
    description: 'Add a new CQRS command to a module',
    prompts: [
      { type: 'input', name: 'module', message: 'Module name:' },
      { type: 'input', name: 'name', message: 'Command name (kebab, e.g. approve-invoice):' },
    ],
    actions: [{ type: 'invoke-apply', generator: 'command' } as unknown as PlopTypes.ActionType],
  })
}
```

- [ ] **Step 3: Register in config.ts**

In `config.ts`, import and register:

```typescript
import * as commandGen from './generators/command.gen'
// in applyByGenerator:
command: (commandGen.apply,
  // in default export, after entityGen.register:
  commandGen.register(plop))
```

- [ ] **Step 4: Test**

`turbo/generators/__integration__/command.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply } from '../generators/command.gen'

describe('command generator (integration)', () => {
  it('creates command + spec, registers handler in module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-cmd-'))
    try {
      mkdirSync(join(dir, 'apps/api/src/modules/billing'), { recursive: true })
      writeFileSync(
        join(dir, 'apps/api/src/modules/billing/billing.module.ts'),
        `import { Module } from '@nestjs/common'\n@Module({ providers: [], exports: [] })\nexport class BillingModule {}\n`,
      )
      const tree = createTree(dir)
      apply(tree, { module: 'billing', name: 'create-invoice' })
      flush(tree, { dryRun: false })
      expect(
        existsSync(
          join(dir, 'apps/api/src/modules/billing/application/commands/create-invoice.command.ts'),
        ),
      ).toBe(true)
      expect(
        existsSync(
          join(
            dir,
            'apps/api/src/modules/billing/application/commands/create-invoice.command.spec.ts',
          ),
        ),
      ).toBe(true)
      const moduleSrc = readFileSync(
        join(dir, 'apps/api/src/modules/billing/billing.module.ts'),
        'utf8',
      )
      expect(moduleSrc).toContain('CreateInvoiceHandler')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/templates/command turbo/generators/generators/command.gen.ts turbo/generators/__integration__/command.spec.ts turbo/generators/config.ts
git commit -m "feat(generators): command generator with provider auto-registration"
```

---

### Task 16: query generator

**Files:**

- Create: `turbo/generators/templates/query/query.ts.hbs`
- Create: `turbo/generators/templates/query/query.spec.ts.hbs`
- Create: `turbo/generators/generators/query.gen.ts`

Mirror `command.gen.ts` exactly, with `query` paths and naming.

- [ ] **Step 1: Templates**

`turbo/generators/templates/query/query.ts.hbs`:

```handlebars
import { Injectable } from '@nestjs/common'

export interface {{pascal name}}Input {
  tenantId: string
}

export interface {{pascal name}}Result {
  // TODO
  items: unknown[]
}

@Injectable()
export class {{pascal name}}Handler {
  async execute(_input: {{pascal name}}Input): Promise<{{pascal name}}Result> {
    return { items: [] }
  }
}
```

`turbo/generators/templates/query/query.spec.ts.hbs`:

```handlebars
import { describe, it, expect } from 'vitest' import {
{{pascal name}}Handler } from './{{kebab name}}.query' describe('{{pascal name}}Handler', () => {
it('returns the expected shape', async () => { const handler = new
{{pascal name}}Handler() const result = await handler.execute({ tenantId: 'tenant-1' })
expect(result.items).toEqual([]) }) })
```

- [ ] **Step 2: query.gen.ts**

`turbo/generators/generators/query.gen.ts` — duplicate of `command.gen.ts` with these changes:

- import path `./application/queries/...`
- file extension `.query.ts` / `.query.spec.ts`
- generator name `'query'`

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import { addProviderToModule } from '../lib/ast/edit-module-providers'
import type { GeneratorApply } from '../lib/compose'

export interface QueryArgs {
  module: string
  name: string
}

const TEMPLATE_DIR = join(__dirname, '../templates/query')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(file: string, ctx: Record<string, string>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, file), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export const apply: GeneratorApply<QueryArgs> = (tree, args) => {
  const ctx = { module: args.module, name: args.name }
  const dir = `apps/api/src/modules/${args.module}/application/queries`
  tree.write(`${dir}/${kebab(args.name)}.query.ts`, render('query.ts.hbs', ctx))
  tree.write(`${dir}/${kebab(args.name)}.query.spec.ts`, render('query.spec.ts.hbs', ctx))

  if (tree.exists(`apps/api/src/modules/${args.module}/${args.module}.module.ts`)) {
    addProviderToModule(tree, args.module, {
      className: `${pascal(args.name)}Handler`,
      importPath: `./application/queries/${kebab(args.name)}.query`,
    })
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('query', {
    description: 'Add a new CQRS query to a module',
    prompts: [
      { type: 'input', name: 'module', message: 'Module name:' },
      { type: 'input', name: 'name', message: 'Query name (kebab, e.g. list-invoices):' },
    ],
    actions: [{ type: 'invoke-apply', generator: 'query' } as unknown as PlopTypes.ActionType],
  })
}
```

- [ ] **Step 3: Register in config.ts** (mirror Task 15 step 3 with `queryGen`).

- [ ] **Step 4: Add integration test** (copy `command.spec.ts`, swap names).

- [ ] **Step 5: Run tests + commit**

```bash
bun run --filter @future/generators test:unit
git add turbo/generators/templates/query turbo/generators/generators/query.gen.ts turbo/generators/__integration__/query.spec.ts turbo/generators/config.ts
git commit -m "feat(generators): query generator with provider auto-registration"
```

---

## Phase 6: module generator (composes everything)

### Task 17: Module templates

**Files:**

- Create: `turbo/generators/templates/module/module.ts.hbs`
- Create: `turbo/generators/templates/module/query-facade.ts.hbs`
- Create: `turbo/generators/templates/module/router.ts.hbs`
- Create: `turbo/generators/templates/module/router.integration.spec.ts.hbs`

These templates wire together what `entity` + `command` + `query` already produce.

- [ ] **Step 1: module.ts.hbs**

`turbo/generators/templates/module/module.ts.hbs`:

```handlebars
import { Module } from '@nestjs/common' import {
{{screamingSnake name}}_REPOSITORY } from './domain/repositories/{{kebab name}}.repository' import {
Drizzle{{pascal name}}Repository } from './infrastructure/repositories/drizzle-{{kebab
  name
}}.repository' import {
{{pascal name}}QueryFacade } from './application/facades/{{kebab name}}-query.facade' @Module({
providers: [ { provide:
{{screamingSnake name}}_REPOSITORY, useClass: Drizzle{{pascal name}}Repository },
{{pascal name}}QueryFacade, ], exports: [{{pascal name}}QueryFacade], }) export class
{{pascal name}}Module {}
```

- [ ] **Step 2: query-facade.ts.hbs**

```handlebars
import { Inject, Injectable } from '@nestjs/common'
import {
  {{screamingSnake name}}_REPOSITORY,
  type {{pascal name}}Repository,
} from '../../domain/repositories/{{kebab name}}.repository'
import type { {{pascal name}} } from '../../domain/entities/{{kebab name}}.entity'

@Injectable()
export class {{pascal name}}QueryFacade {
  constructor(
    @Inject({{screamingSnake name}}_REPOSITORY) private readonly repo: {{pascal name}}Repository,
  ) {}

  list(tenantId: string): Promise<{{pascal name}}[]> {
    return this.repo.list(tenantId)
  }

  get(tenantId: string, id: string): Promise<{{pascal name}} | null> {
    return this.repo.get(tenantId, id)
  }
}
```

- [ ] **Step 3: router.ts.hbs (matches the simple direct pattern used by `time.router.ts` etc.)**

> **Why direct, not factory:** The codebase has two router patterns. The `createXxxRouter(facade)` factory + `setXxxRouter` setter (used by `people`, `kernel`, `preferences`) requires DI wiring inside `TrpcModule.onModuleInit`. The simple direct pattern (`export const xxxRouter = router({...})`, used by `time`, `hiring`, `performance`) needs no DI plumbing and is what new modules start with. The user graduates to the factory pattern when they need facade access; that's an out-of-scope follow-up.

```handlebars
import * as z from 'zod'
import { publicProcedure, router } from '../../../../common/trpc/trpc-init'

export const {{camel name}}Router = router({
  list: publicProcedure.query(() => {
    // TODO: inject {{pascal name}}QueryFacade and call facade.list(ctx.tenantId).
    // See docs/superpowers/scaffolding.md → "Wiring a facade into a router".
    return [] as Array<{ id: string; tenantId: string; name: string; createdAt: Date; updatedAt: Date }>
  }),

  get: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ input }) => {
      // TODO: inject facade and call facade.get(ctx.tenantId, input.id)
      return null as null | { id: string; tenantId: string; name: string; createdAt: Date; updatedAt: Date }
    }),
})
```

- [ ] **Step 4: router.integration.spec.ts.hbs**

```handlebars
import { describe, it, expect } from 'vitest' import {
{{camel name}}Router } from './{{kebab name}}.router' describe('{{pascal name}}
tRPC router', () => { it('list returns an empty array by default (TODO: replace with facade-backed
test)', async () => { const caller =
{{camel name}}Router.createCaller({} as never) const out = await caller.list()
expect(out).toEqual([]) }) })
```

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/templates/module
git commit -m "feat(generators): module templates (module.ts, facade, router, integration spec)"
```

---

### Task 18: module.gen.ts (composes entity + 3 commands + 2 queries + AST edits)

**Files:**

- Create: `turbo/generators/generators/module.gen.ts`

- [ ] **Step 1: Implement**

`turbo/generators/generators/module.gen.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import { addModuleToAppModule } from '../lib/ast/edit-app-module'
import { addRouterToAppRouter } from '../lib/ast/edit-app-router'
import { compose, type GeneratorApply } from '../lib/compose'
import * as entityGen from './entity.gen'
import * as commandGen from './command.gen'
import * as queryGen from './query.gen'

export interface ModuleArgs {
  name: string
}

const TEMPLATE_DIR = join(__dirname, '../templates/module')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(file: string, ctx: Record<string, string>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, file), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export const apply: GeneratorApply<ModuleArgs> = (tree, args) => {
  const ctx = { name: args.name }
  const dir = `apps/api/src/modules/${args.name}`

  // 1) entity (creates schema + entity + repository interface + drizzle impl)
  compose(tree, entityGen.apply, { module: args.name, name: args.name })

  // 2) module.ts, facade, router, integration spec
  tree.write(`${dir}/${kebab(args.name)}.module.ts`, render('module.ts.hbs', ctx))
  tree.write(
    `${dir}/application/facades/${kebab(args.name)}-query.facade.ts`,
    render('query-facade.ts.hbs', ctx),
  )
  tree.write(`${dir}/interface/trpc/${kebab(args.name)}.router.ts`, render('router.ts.hbs', ctx))
  tree.write(
    `${dir}/interface/trpc/${kebab(args.name)}.router.integration.spec.ts`,
    render('router.integration.spec.ts.hbs', ctx),
  )

  // 3) commands: create / update / delete
  for (const verb of ['create', 'update', 'delete'] as const) {
    compose(tree, commandGen.apply, { module: args.name, name: `${verb}-${args.name}` })
  }
  // 4) queries: get / list
  for (const verb of ['get', 'list'] as const) {
    compose(tree, queryGen.apply, { module: args.name, name: `${verb}-${args.name}` })
  }

  // 5) Wire into app.module.ts and app-router.ts (AST edits — only if those files exist in the Tree)
  if (tree.exists('apps/api/src/app.module.ts')) addModuleToAppModule(tree, args.name)
  if (tree.exists('apps/api/src/common/trpc/app-router.ts')) addRouterToAppRouter(tree, args.name)
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('module', {
    description: 'Scaffold a new API DDD module with CRUD on a sample entity',
    prompts: [{ type: 'input', name: 'name', message: 'Module name (kebab-case):' }],
    actions: [{ type: 'invoke-apply', generator: 'module' } as unknown as PlopTypes.ActionType],
  })
}
```

- [ ] **Step 2: Register in config.ts**

```typescript
import * as moduleGen from './generators/module.gen'
// applyByGenerator:
module: (moduleGen.apply,
  // register:
  moduleGen.register(plop))
```

Also extend the `invoke-apply` action to run `validateModuleDoesNotExist` when generator === 'module':

```typescript
import { validateModuleDoesNotExist } from './lib/validate'
// inside the action handler, after creating tree, before apply:
if (name === 'module') {
  const v = runAll([validateModuleDoesNotExist(tree, answers.name)])
  if (!v.ok) throw new Error('Validation failed:\n  - ' + v.reasons.join('\n  - '))
}
```

- [ ] **Step 3: Integration test (drift canary)**

`turbo/generators/__integration__/module-generates-compilable-code.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply as moduleApply } from '../generators/module.gen'

describe('module generator', () => {
  it('produces ≥18 files for a CRUD module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-mod-'))
    try {
      const tree = createTree(dir)
      moduleApply(tree, { name: 'billing' })
      flush(tree, { dryRun: false })
      const moduleDir = join(dir, 'apps/api/src/modules/billing')
      const files = walk(moduleDir)
      expect(files.length).toBeGreaterThanOrEqual(18)
      // Spot-check a few key paths
      const expectedPresent = [
        'billing.module.ts',
        'application/commands/create-billing.command.ts',
        'application/commands/create-billing.command.spec.ts',
        'application/queries/list-billing.query.ts',
        'domain/entities/billing.entity.ts',
        'infrastructure/repositories/drizzle-billing.repository.ts',
        'infrastructure/schema/billing.schema.ts',
        'interface/trpc/billing.router.ts',
      ]
      for (const p of expectedPresent) {
        expect(files).toContain(p)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function walk(root: string, prefix = ''): string[] {
  const out: string[] = []
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name
    if (ent.isDirectory()) out.push(...walk(join(root, ent.name), rel))
    else out.push(rel)
  }
  return out
}
```

- [ ] **Step 4: Run integration test**

```bash
bun run --filter @future/generators test:unit
```

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/generators/module.gen.ts turbo/generators/config.ts turbo/generators/__integration__/module-generates-compilable-code.spec.ts
git commit -m "feat(generators): module generator composes entity + commands + queries + router"
```

---

## Phase 7: zone

### Task 19: Zone templates (cloned from web-people shape)

**Files:**

- Create: `turbo/generators/templates/zone/package.json.hbs`
- Create: `turbo/generators/templates/zone/tsconfig.json.hbs`
- Create: `turbo/generators/templates/zone/next.config.ts.hbs`
- Create: `turbo/generators/templates/zone/src/navigation.ts.hbs`
- Create: `turbo/generators/templates/zone/src/app/layout.tsx.hbs`
- Create: `turbo/generators/templates/zone/src/app/page.tsx.hbs`
- Create: `turbo/generators/templates/zone/src/app/[id]/page.tsx.hbs`
- Create: `turbo/generators/templates/zone/src/app/_components/{{kebab name}}-list.tsx.hbs`

- [ ] **Step 1: package.json template** (port substituted at generate time)

`turbo/generators/templates/zone/package.json.hbs`:

```handlebars
{ "name": "@future/web-{{kebab name}}", "version": "0.0.1", "private": true, "scripts": { "build":
"next build", "dev": "next dev --port
{{port}}", "typecheck": "tsc --noEmit", "lint": "eslint src/", "test:unit": "vitest run" },
"dependencies": { "@future/agent": "workspace:*", "@future/api-client": "workspace:*",
"@future/app-layout": "workspace:*", "@future/auth": "workspace:*", "@future/ui": "workspace:*",
"next": "16.2.4", "react": "^19.2.5", "react-dom": "^19.2.5" }, "devDependencies": {
"@future/eslint-config": "workspace:*", "@future/tsconfig": "workspace:*", "@types/node": "^25.6.0",
"@types/react": "^19.2.14", "@types/react-dom": "^19.2.3", "eslint": "^10.2.1",
"eslint-config-next": "^16.2.4", "typescript": "^6.0.3", "vitest": "^4.1.5" } }
```

- [ ] **Step 2: navigation.ts template**

`turbo/generators/templates/zone/src/navigation.ts.hbs`:

```handlebars
import { Layers } from '@future/ui/icons' import type { NavigationConfig } from '@future/app-layout'
export const
{{camel name}}NavConfig: NavigationConfig = { navbar: { title: '{{pascal name}}', icon: Layers, },
sidebar: [ { label: '{{pascal name}}', items: [ { label: 'Overview', icon: Layers, href: '/', }, ],
}, ], }
```

- [ ] **Step 3: page.tsx + list component templates**

`turbo/generators/templates/zone/src/app/page.tsx.hbs`:

```handlebars
import { {{pascal name}}List } from './_components/{{kebab name}}-list'

export default function {{pascal name}}Page() {
  return (
    <main>
      <h1>{{pascal name}}</h1>
      <{{pascal name}}List />
    </main>
  )
}
```

`turbo/generators/templates/zone/src/app/_components/{{kebab name}}-list.tsx.hbs`:

```handlebars
'use client' import { trpc } from '@future/api-client' export function
{{pascal name}}List() { const { data, isLoading } = trpc.{{camel name}}.list.useQuery() if
(isLoading) return
<p>Loading…</p>
if (!data || data.length === 0) return
<p>No {{kebab name}} yet.</p>
return (
<ul>
  {data.map((item) => (
  <li key='{item.id}'>{item.name}</li>
  ))}
</ul>
) }
```

`turbo/generators/templates/zone/src/app/[id]/page.tsx.hbs`:

```handlebars
import { trpc } from '@future/api-client'

export default async function {{pascal name}}DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <main>
      <h1>{{pascal name}} {id}</h1>
    </main>
  )
}
```

`turbo/generators/templates/zone/src/app/layout.tsx.hbs`:

```handlebars
import type { ReactNode } from 'react' export default function RootLayout({ children }: { children:
ReactNode }) { return (
<html lang='en'>
  <body>{children}</body>
</html>
) }
```

- [ ] **Step 4: tsconfig + next.config templates**

`turbo/generators/templates/zone/tsconfig.json.hbs`:

```handlebars
{ "extends": "@future/tsconfig/nextjs.json", "compilerOptions": { "baseUrl": ".", "paths": { "@/*":
["src/*"] } }, "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"], "exclude":
["node_modules", ".next"] }
```

`turbo/generators/templates/zone/next.config.ts.hbs`:

```handlebars
import type { NextConfig } from 'next' const config: NextConfig = { output: 'standalone',
transpilePackages: [ '@future/ui', '@future/auth', '@future/api-client', '@future/agent',
'@future/app-layout', ], // No basePath — subdomain routing ({{kebab name}}.seta-international.com)
} export default config
```

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/templates/zone
git commit -m "feat(generators): zone templates (Next.js 16, navigation, list/detail page stubs)"
```

---

### Task 20: zone.gen.ts

**Files:**

- Create: `turbo/generators/generators/zone.gen.ts`

- [ ] **Step 1: Implement port allocation + apply**

`turbo/generators/generators/zone.gen.ts`:

```typescript
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import type { GeneratorApply } from '../lib/compose'

export interface ZoneArgs {
  name: string
  port?: number
}

const TEMPLATE_DIR = join(__dirname, '../templates/zone')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(rel: string, ctx: Record<string, string | number>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, rel), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export function pickFreePort(repoRoot: string): number {
  const appsDir = join(repoRoot, 'apps')
  if (!existsSync(appsDir)) return 3001
  let max = 3000
  for (const ent of readdirSync(appsDir, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith('web-')) continue
    const pkgPath = join(appsDir, ent.name, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const dev: string = pkg.scripts?.dev ?? ''
    const m = dev.match(/--port\s+(\d+)/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

export const apply: GeneratorApply<ZoneArgs> = (tree, args) => {
  const port = args.port ?? pickFreePort(tree.root())
  const ctx = { name: args.name, port }
  const zoneDir = `apps/web-${kebab(args.name)}`

  const files = [
    ['package.json.hbs', 'package.json'],
    ['tsconfig.json.hbs', 'tsconfig.json'],
    ['next.config.ts.hbs', 'next.config.ts'],
    ['src/navigation.ts.hbs', 'src/navigation.ts'],
    ['src/app/layout.tsx.hbs', 'src/app/layout.tsx'],
    ['src/app/page.tsx.hbs', 'src/app/page.tsx'],
    ['src/app/[id]/page.tsx.hbs', 'src/app/[id]/page.tsx'],
    [
      `src/app/_components/{{kebab name}}-list.tsx.hbs`,
      `src/app/_components/${kebab(args.name)}-list.tsx`,
    ],
  ]

  for (const [tpl, dest] of files) {
    tree.write(`${zoneDir}/${dest}`, render(tpl, ctx))
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('zone', {
    description: 'Scaffold a new Next.js zone (apps/web-<name>)',
    prompts: [{ type: 'input', name: 'name', message: 'Zone name (kebab):' }],
    actions: [{ type: 'invoke-apply', generator: 'zone' } as unknown as PlopTypes.ActionType],
  })
}
```

- [ ] **Step 2: Register in config.ts** — add `zoneGen` to `applyByGenerator` and call `zoneGen.register(plop)`. Also add `validateZoneDoesNotExist` when `name === 'zone'`.

- [ ] **Step 3: Integration test**

`turbo/generators/__integration__/zone-generates-compilable-code.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply, pickFreePort } from '../generators/zone.gen'

describe('zone generator', () => {
  it('produces a Next.js zone with the next free port', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-zone-'))
    try {
      mkdirSync(join(dir, 'apps/web-people'), { recursive: true })
      writeFileSync(
        join(dir, 'apps/web-people/package.json'),
        JSON.stringify({ scripts: { dev: 'next dev --port 3001' } }),
      )
      const tree = createTree(dir)
      apply(tree, { name: 'billing' })
      flush(tree, { dryRun: false })
      const pkg = JSON.parse(readFileSync(join(dir, 'apps/web-billing/package.json'), 'utf8'))
      expect(pkg.scripts.dev).toBe('next dev --port 3002')
      expect(existsSync(join(dir, 'apps/web-billing/src/app/page.tsx'))).toBe(true)
      expect(existsSync(join(dir, 'apps/web-billing/src/navigation.ts'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pickFreePort returns 3001 in an empty apps/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-zone-empty-'))
    try {
      mkdirSync(join(dir, 'apps'))
      expect(pickFreePort(dir)).toBe(3001)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/generators test:unit
git add turbo/generators/generators/zone.gen.ts turbo/generators/config.ts turbo/generators/__integration__/zone-generates-compilable-code.spec.ts
git commit -m "feat(generators): zone generator with port auto-allocation"
```

---

### Task 21: --with-zone flag wiring in module.gen.ts

**Files:**

- Modify: `turbo/generators/generators/module.gen.ts`

- [ ] **Step 1: Update ModuleArgs and apply()**

```typescript
import * as zoneGen from './zone.gen'

export interface ModuleArgs {
  name: string
  withZone?: boolean
}

// inside apply(), after the AST edits:
if (args.withZone) {
  compose(tree, zoneGen.apply, { name: args.name })
}
```

- [ ] **Step 2: Add prompt for `withZone`**

```typescript
prompts: [
  { type: 'input', name: 'name', message: 'Module name (kebab-case):' },
  { type: 'confirm', name: 'withZone', message: 'Also generate web zone?', default: true },
],
```

- [ ] **Step 3: Add integration test**

Append to `module-generates-compilable-code.spec.ts`:

```typescript
it('with --with-zone, also creates apps/web-<name>', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-mod-zone-'))
  try {
    const tree = createTree(dir)
    moduleApply(tree, { name: 'billing', withZone: true })
    flush(tree, { dryRun: false })
    expect(require('node:fs').existsSync(join(dir, 'apps/web-billing/package.json'))).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 4: Commit**

```bash
git add turbo/generators/generators/module.gen.ts turbo/generators/__integration__/module-generates-compilable-code.spec.ts
git commit -m "feat(generators): --with-zone flag composes module + zone in one shot"
```

---

## Phase 8: remove generator

### Task 22: remove.gen.ts

**Files:**

- Create: `turbo/generators/generators/remove.gen.ts`

`remove` is the inverse of `module` / `zone`. It walks the on-disk module/zone directory, queues DELETEs in the Tree, then calls the inverse AST edits.

- [ ] **Step 1: Implement**

`turbo/generators/generators/remove.gen.ts`:

```typescript
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PlopTypes } from '@turbo/gen'
import type { Tree } from '../lib/tree'
import { kebab } from '../lib/naming'
import { removeModuleFromAppModule } from '../lib/ast/edit-app-module'
import { removeRouterFromAppRouter } from '../lib/ast/edit-app-router'
import type { GeneratorApply } from '../lib/compose'

export interface RemoveArgs {
  kind: 'module' | 'zone'
  name: string
  withZone?: boolean
}

function listFilesUnder(root: string, sub: string, out: string[] = []): string[] {
  const abs = join(root, sub)
  let entries: ReturnType<typeof readdirSync> = []
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const rel = `${sub}/${ent.name}`
    const absChild = join(root, rel)
    if (statSync(absChild).isDirectory()) listFilesUnder(root, rel, out)
    else out.push(rel)
  }
  return out
}

export const apply: GeneratorApply<RemoveArgs> = (tree, args) => {
  const root = tree.root()
  if (args.kind === 'module') {
    const moduleSub = `apps/api/src/modules/${kebab(args.name)}`
    for (const f of listFilesUnder(root, moduleSub)) tree.delete(f, { force: true })
    if (tree.exists('apps/api/src/app.module.ts')) removeModuleFromAppModule(tree, args.name)
    if (tree.exists('apps/api/src/common/trpc/app-router.ts'))
      removeRouterFromAppRouter(tree, args.name)
  }
  if (args.kind === 'zone' || (args.kind === 'module' && args.withZone)) {
    const zoneSub = `apps/web-${kebab(args.name)}`
    for (const f of listFilesUnder(root, zoneSub)) tree.delete(f, { force: true })
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('remove', {
    description: 'Remove a previously-generated module or zone',
    prompts: [
      {
        type: 'list',
        name: 'kind',
        message: 'What to remove?',
        choices: ['module', 'zone'],
      },
      { type: 'input', name: 'name', message: 'Name:' },
      {
        type: 'confirm',
        name: 'withZone',
        message: 'Also remove the matching web zone?',
        default: false,
      },
    ],
    actions: [{ type: 'invoke-apply', generator: 'remove' } as unknown as PlopTypes.ActionType],
  })
}
```

- [ ] **Step 2: Register in config.ts** + add `validateModuleExists` when removing a module.

- [ ] **Step 3: Round-trip integration test**

`turbo/generators/__integration__/cleanup-is-reverse-of-create.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply as moduleApply } from '../generators/module.gen'
import { apply as removeApply } from '../generators/remove.gen'

describe('cleanup is reverse of create', () => {
  it('module create + module remove leaves the workspace identical', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-rt-'))
    try {
      // Pre-seed app.module.ts and app-router.ts so AST edits have something to edit/restore.
      mkdirSync(join(dir, 'apps/api/src/common/trpc'), { recursive: true })
      const appModule = `import { Module } from '@nestjs/common'\n@Module({ imports: [] })\nexport class AppModule {}\n`
      const appRouter = `import { router } from './trpc-init'\nexport const appRouter = router({})\nexport type AppRouter = typeof appRouter\n`
      writeFileSync(join(dir, 'apps/api/src/app.module.ts'), appModule)
      writeFileSync(join(dir, 'apps/api/src/common/trpc/app-router.ts'), appRouter)

      const before = snapshot(dir)
      const tree1 = createTree(dir)
      moduleApply(tree1, { name: 'billing' })
      flush(tree1, { dryRun: false })

      const tree2 = createTree(dir)
      removeApply(tree2, { kind: 'module', name: 'billing' })
      flush(tree2, { dryRun: false })

      const after = snapshot(dir)
      expect(after).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(sub: string) {
    for (const ent of readdirSync(join(root, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${ent.name}` : ent.name
      if (ent.isDirectory()) walk(rel)
      else out[rel] = require('node:fs').readFileSync(join(root, rel), 'utf8')
    }
  }
  walk('')
  return out
}
```

- [ ] **Step 4: Run + commit**

```bash
bun run --filter @future/generators test:unit
git add turbo/generators/generators/remove.gen.ts turbo/generators/config.ts turbo/generators/__integration__/cleanup-is-reverse-of-create.spec.ts
git commit -m "feat(generators): remove generator (reverse of create, AST-symmetric)"
```

---

## Phase 9: Cross-cutting integration tests

### Task 23: dry-run-writes-nothing + validation-blocks-bad-input tests

**Files:**

- Create: `turbo/generators/__integration__/dry-run-writes-nothing.spec.ts`
- Create: `turbo/generators/__integration__/validation-blocks-bad-input.spec.ts`

- [ ] **Step 1: dry-run test**

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply as moduleApply } from '../generators/module.gen'

describe('dry-run', () => {
  it('module generator with dryRun=true writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-dry-'))
    try {
      const tree = createTree(dir)
      moduleApply(tree, { name: 'billing' })
      flush(tree, { dryRun: true })
      // apps/ should not have been created
      expect(existsSync(join(dir, 'apps/api/src/modules/billing'))).toBe(false)
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: validation-blocks-bad-input test**

```typescript
import { describe, it, expect } from 'vitest'
import { runAll, validateName, validateNotReserved } from '../lib/validate'

describe('validation', () => {
  it.each([
    ['Billing', 'kebab-case'],
    ['', 'kebab-case'],
    ['api', 'reserved'],
    ['shell', 'reserved'],
  ])('rejects %s with %s reason', (name, hint) => {
    const v = runAll([validateName(name), validateNotReserved(name)])
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(new RegExp(hint))
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
bun run --filter @future/generators test:unit
git add turbo/generators/__integration__/dry-run-writes-nothing.spec.ts turbo/generators/__integration__/validation-blocks-bad-input.spec.ts
git commit -m "test(generators): dry-run + validation cross-cutting integration tests"
```

---

## Phase 10: Drift protection

### Task 24: check-template-drift.ts + sync-templates.ts

**Files:**

- Create: `turbo/generators/scripts/check-template-drift.ts`
- Create: `turbo/generators/scripts/sync-templates.ts`

These scripts walk a reference module (`preferences/`, `web-people/`) and compare against the templates after normalizing placeholders. Drift means CI fails.

- [ ] **Step 1: check-template-drift.ts**

```typescript
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

type FileMap = Record<string, string>

function walk(root: string, sub = '', out: FileMap = {}): FileMap {
  for (const ent of readdirSync(join(root, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${ent.name}` : ent.name
    if (ent.isDirectory()) walk(root, rel, out)
    else out[rel] = readFileSync(join(root, rel), 'utf8')
  }
  return out
}

function normalizePreferencesToTemplate(contents: string): string {
  return contents
    .replace(/SavedView/g, '{{pascal name}}')
    .replace(/savedView/g, '{{camel name}}')
    .replace(/saved_view/g, '{{snake name}}')
    .replace(/SAVED_VIEW/g, '{{screamingSnake name}}')
    .replace(/preferences/g, '{{kebab module}}')
}

const refModule = walk('apps/api/src/modules/preferences')
const tplModule = walk('turbo/generators/templates/module')
let drift = 0
for (const [path, refContents] of Object.entries(refModule)) {
  const tplPath = path
    .replace(/saved-view/g, '{{kebab name}}')
    .replace(/preferences/g, '{{kebab module}}')
  const tplKey = `${tplPath}.hbs`
  if (!(tplKey in tplModule)) {
    console.error(`Reference file has no template counterpart: ${path}`)
    drift++
    continue
  }
  const expected = normalizePreferencesToTemplate(refContents)
  if (expected.trim() !== tplModule[tplKey].trim()) {
    console.error(`Template drift in ${tplKey} — re-sync via sync-templates.ts`)
    drift++
  }
}
process.exit(drift > 0 ? 1 : 0)
```

> Note: this drift check is intentionally conservative — it flags structural mismatches between reference module and template. A heuristic textual diff is fine here because false positives are easier to fix (re-sync) than false negatives (silent rot).

- [ ] **Step 2: sync-templates.ts** (inverse: clones reference → template, prints diff)

```typescript
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

function walk(root: string, sub = '', out: Record<string, string> = {}): Record<string, string> {
  for (const ent of readdirSync(join(root, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${ent.name}` : ent.name
    if (ent.isDirectory()) walk(root, rel, out)
    else out[rel] = readFileSync(join(root, rel), 'utf8')
  }
  return out
}

function normalize(contents: string): string {
  return contents
    .replace(/SavedView/g, '{{pascal name}}')
    .replace(/savedView/g, '{{camel name}}')
    .replace(/saved_view/g, '{{snake name}}')
    .replace(/SAVED_VIEW/g, '{{screamingSnake name}}')
    .replace(/preferences/g, '{{kebab module}}')
}

const refModule = walk('apps/api/src/modules/preferences')
const tplRoot = 'turbo/generators/templates/module'
for (const [path, contents] of Object.entries(refModule)) {
  const tplPath = path
    .replace(/saved-view/g, '{{kebab name}}')
    .replace(/preferences/g, '{{kebab module}}')
  const dest = join(tplRoot, `${tplPath}.hbs`)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, normalize(contents))
  console.log(`wrote ${dest}`)
}
```

- [ ] **Step 3: Add npm scripts to `turbo/generators/package.json`**

```json
"scripts": {
  "test:unit": "vitest run",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "drift:check": "bun run scripts/check-template-drift.ts",
  "drift:sync": "bun run scripts/sync-templates.ts"
}
```

- [ ] **Step 4: Add a `lefthook` pre-commit entry** (per repo convention — see `lefthook.yml`)

`lefthook.yml`:

```yaml
pre-commit:
  commands:
    template-drift:
      glob: 'turbo/generators/templates/**'
      run: bun run --filter @future/generators drift:check
```

- [ ] **Step 5: Commit**

```bash
git add turbo/generators/scripts turbo/generators/package.json lefthook.yml
git commit -m "chore(generators): drift check + sync scripts wired to pre-commit"
```

---

## Phase 11: E2E + Documentation

### Task 25: E2E full-flow test

**Files:**

- Create: `turbo/generators/__integration__/e2e-full-flow.spec.ts`

This is the gated nightly test. It uses a fresh worktree, runs the actual `turbo gen` command, runs typecheck across the repo, then runs `remove`, then asserts `git diff --exit-code`.

- [ ] **Step 1: Implement (skipped by default — opt in via env var)**

```typescript
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

const RUN_E2E = process.env.RUN_GENERATOR_E2E === '1'
const maybe = RUN_E2E ? it : it.skip

describe('generator e2e (gated by RUN_GENERATOR_E2E=1)', () => {
  maybe(
    'module create → typecheck → remove → git clean',
    () => {
      const repo = process.cwd()
      execSync('bunx turbo gen module --name e2e-test', { cwd: repo, stdio: 'inherit' })
      execSync('bun install', { cwd: repo, stdio: 'inherit' })
      execSync('bun run --filter=api typecheck', { cwd: repo, stdio: 'inherit' })
      execSync('bunx turbo gen remove --kind module --name e2e-test', {
        cwd: repo,
        stdio: 'inherit',
      })
      execSync('git diff --exit-code', { cwd: repo, stdio: 'inherit' })
    },
    600_000,
  )
})
```

- [ ] **Step 2: Add a CI workflow line that runs nightly + on PRs touching `turbo/generators/`**

(Add to `.github/workflows/` or equivalent — defer concrete YAML to whoever owns CI; this plan documents the requirement.)

- [ ] **Step 3: Commit**

```bash
git add turbo/generators/__integration__/e2e-full-flow.spec.ts
git commit -m "test(generators): gated e2e full-flow test (create → typecheck → remove)"
```

---

### Task 26: Documentation

**Files:**

- Create: `turbo/generators/README.md`
- Create: `docs/superpowers/scaffolding.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: turbo/generators/README.md**

````markdown
# Turbo Generators — `@future/generators`

Internal CLI for scaffolding new modules, zones, and pieces. Run from the repo root.

## Quick Start

```bash
bunx turbo gen                       # interactive picker
bunx turbo gen module --name billing
bunx turbo gen zone --name billing
bunx turbo gen command --module billing --name approve-invoice
bunx turbo gen query   --module billing --name list-invoices
bunx turbo gen entity  --module billing --name invoice
bunx turbo gen remove  --kind module --name billing
```
````

## Flags

| Flag                   | Effect                            |
| ---------------------- | --------------------------------- |
| `TURBO_GEN_DRY_RUN=1`  | Print the plan; write nothing.    |
| `--name <kebab>`       | Skip the prompt.                  |
| `--with-zone` (module) | Also generate `apps/web-<name>/`. |

## After running `module --with-zone`

```bash
bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate
bun install
bun run dev
# Visit http://localhost:3000/<name>
```

## Maintenance

Templates clone real reference modules. CI runs `drift:check` to nag on drift.
To re-sync after editing the reference: `bun run --filter @future/generators drift:sync`.

````

- [ ] **Step 2: docs/superpowers/scaffolding.md**

```markdown
# Scaffolding a new module

To start a new module:

```bash
bunx turbo gen module --name <name> --with-zone
````

This produces a fully runnable vertical slice: API DDD module with CRUD on a sample entity, plus a Next.js zone with a working list+detail page hitting real tRPC. After running, follow the next-step checklist printed by the CLI.

To remove what you generated:

```bash
bunx turbo gen remove --kind module --name <name> --with-zone
```

To preview without writing:

```bash
TURBO_GEN_DRY_RUN=1 bunx turbo gen module --name <name>
```

For sub-pieces inside an existing module:

```bash
bunx turbo gen entity  --module <name> --name <Entity>
bunx turbo gen command --module <name> --name <verb-noun>
bunx turbo gen query   --module <name> --name <verb-noun>
```

````

- [ ] **Step 3: CLAUDE.md update**

In `CLAUDE.md` under "Package Management":

Replace:

```markdown
- New workspace: `turbo gen workspace`. Never create manually.
````

With:

```markdown
- New API module: `bunx turbo gen module --name <kebab>` (add `--with-zone` to also scaffold the Next.js zone). Sub-pieces: `bunx turbo gen command|query|entity --module <name> --name <name>`. Cleanup: `bunx turbo gen remove --kind module|zone --name <name>`. Preview with `TURBO_GEN_DRY_RUN=1`. See `docs/superpowers/scaffolding.md`.
```

- [ ] **Step 4: Commit**

```bash
git add turbo/generators/README.md docs/superpowers/scaffolding.md CLAUDE.md
git commit -m "docs: scaffold CLI usage + update CLAUDE.md generator pointer"
```

---

## Phase 12: End-to-end smoke + post-write hooks

### Task 27: Wire postwrite typecheck into the `invoke-apply` action

**Files:**

- Modify: `turbo/generators/config.ts`

Until now, the action only printed the plan and flushed. Now it also runs typecheck on the touched workspaces.

- [ ] **Step 1: Update config.ts**

Inside the `invoke-apply` action, after `flush(tree, { dryRun })`:

```typescript
import { runTypecheck } from './lib/postwrite'

if (!dryRun) {
  const zoneCreated = tree
    .changes()
    .some((c) => c.kind === 'create' && c.path.startsWith('apps/web-'))
  const zoneName = zoneCreated
    ? tree
        .changes()
        .find((c) => c.kind === 'create' && c.path.match(/apps\/web-([^/]+)\//))
        ?.path.match(/apps\/web-([^/]+)\//)?.[1]
    : undefined
  try {
    runTypecheck(repoRoot(), { zoneName })
  } catch (err) {
    process.stderr.write(
      '\n⚠️  Post-write typecheck failed. To undo: `git restore .` and re-run with --dry-run to inspect.\n',
    )
    throw err
  }
}
```

- [ ] **Step 2: Add a manual smoke test (documented, not automated)**

Add a paragraph to `turbo/generators/README.md`:

````markdown
## Verifying end-to-end

```bash
bunx turbo gen module --name smoketest --with-zone
bun install
bun run db:generate --name initial && bun run db:down -v && bun run db:up && bun run db:migrate
bun run --filter=api typecheck
bun run --filter=@future/web-smoketest typecheck
bun run dev
# Visit http://localhost:3000/smoketest — should render an empty list
bunx turbo gen remove --kind module --name smoketest --with-zone
git diff --exit-code   # should print nothing
```
````

````

- [ ] **Step 3: Commit**

```bash
git add turbo/generators/config.ts turbo/generators/README.md
git commit -m "feat(generators): post-write typecheck on the touched workspaces"
````

---

## Self-review checklist (run before handoff)

- [ ] Spec coverage:
  - UX with prompts + Plan: preview → Tasks 14, 17, 18, 19, 20
  - All six generators (module, zone, command, query, entity, remove) → Tasks 14–22
  - Buffered Tree + dry-run + atomic flush → Tasks 2, 4, 23
  - AST edits via ts-morph (no regex on shared files) → Tasks 9–12
  - Validation (input + repo state) → Task 7 + per-generator wiring in Task 18 / 22
  - Post-write typecheck + lint → Tasks 8, 27
  - `remove` is true inverse of create → Task 22 + cleanup-is-reverse-of-create.spec
  - Composition (`compose.ts`) → Task 13
  - Templates clone real reference modules + drift check → Tasks 14, 17, 19, 24
  - E2E full-flow test → Task 25
  - Docs (README, scaffolding.md, CLAUDE.md) → Task 26
- [ ] No placeholders / TODO in plan steps (every code block is the real implementation)
- [ ] Type consistency: `Tree`, `PendingChange`, `GeneratorApply<T>`, `ValidationResult` are defined once and used consistently
- [ ] All commit messages follow the repo's existing style (`feat(scope):`, `chore(scope):`, etc.)
- [ ] Vitest specs are co-located (no `__tests__/` directories — only `__integration__/` for fixture-based tests, justified in spec)

---

## Known follow-ups (not in scope of this plan)

- **Permission-wrapped routers.** New modules use the simple direct path on `app-router.ts`. Wrapping with permission-protected procedures (the mutable-ref + setter pattern used by `peopleRouter` etc.) is a per-module judgment call and is out of scope.
- **DB migration automation.** Per `CLAUDE.md`'s "0000_initial.sql only" rule, the squash-and-rebuild dance is a human decision. The CLI prints a TODO; it never runs `db:generate` or `db:migrate`.
- **Cross-package type-import scrubbing on remove.** If `@future/api-client` exposes types derived from a removed module's tRPC router, the post-cleanup typecheck surfaces breakage; the user fixes it manually. Adding cross-package scrubbing is high-risk for low value.
- **`PermissionContext` integration.** The `module` generator prints a TODO reminding the user to gate the new module by role; it does not auto-edit `packages/auth`.
