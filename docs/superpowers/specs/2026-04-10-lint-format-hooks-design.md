# Lint, Format, and Git Hooks Design

**Date:** 2026-04-10
**Status:** Approved
**Author:** Canh Ta

---

## Problem

`packages/eslint-config` exists with `base.js` and `nextjs.js` stubs but is not consumed by any workspace. No app has an `eslint.config.js`. No formatter is configured. No git hooks enforce quality gates before commit or push.

---

## Decision

**ESLint 9 (flat config) + Prettier + Lefthook**

- ESLint handles code quality and architectural boundary enforcement
- Prettier handles formatting (separate from ESLint, not through ESLint rules)
- Lefthook manages git hooks (pre-commit + pre-push) via a single root `lefthook.yml`

Biome was eliminated: it does not support `eslint-plugin-boundaries`, which is required for hexagonal layer enforcement in `apps/api`. Husky + lint-staged was eliminated in favor of Lefthook for faster hook execution and simpler monorepo configuration.

---

## 1. Formatter — Prettier

### Installation

Add to root `devDependencies`:
```
prettier
```

Add to `packages/eslint-config` `devDependencies` and `peerDependencies`:
```
eslint-config-prettier
```

### Config

Single `.prettierrc` at repo root:
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

Single `.prettierignore` at repo root:
```
node_modules
.next
dist
.turbo
coverage
```

### Scripts

Add to root `package.json`:
```json
"format":       "prettier --write .",
"format:check": "prettier --check ."
```

---

## 2. ESLint Configuration

### packages/eslint-config exports

Three named exports:

| Export | File | Used by |
|---|---|---|
| `@future/eslint-config/base` | `base.js` | `packages/*`, `apps/e2e` |
| `@future/eslint-config/nestjs` | `nestjs.js` | `apps/api` |
| `@future/eslint-config/nextjs` | `nextjs.js` | `apps/web-*` |

`nestjs.js` is a new file. It extends `base.js` and configures `eslint-plugin-boundaries` with the hexagonal layer rules matching `apps/api`'s folder structure. The existing `base.js` already defines boundary elements — `nestjs.js` will tighten the pattern globs to match NestJS module paths specifically.

`eslint-config-prettier` is added as the last spread in every config array to disable any ESLint formatting rules that conflict with Prettier.

### packages/eslint-config/package.json updates

Add `./nestjs` to `exports`. Add `eslint-config-prettier` to `peerDependencies` and `devDependencies`.

### Per-app eslint.config.js

Each app gets an `eslint.config.js` at its root. All use the flat config format (ESLint 9). Each app adds `@future/eslint-config` and `eslint` as `devDependencies`.

**apps/api** — uses `nestjs` config:
```js
import nestjs from '@future/eslint-config/nestjs'
export default [...nestjs]
```

**apps/web-\*** (12 Next.js zones) — uses `nextjs` config:
```js
import nextjs from '@future/eslint-config/nextjs'
export default [...nextjs]
```

**packages/\*** and **apps/e2e** — uses `base` config:
```js
import base from '@future/eslint-config/base'
export default [...base]
```

### Hexagonal boundary rules (nestjs.js)

```
domain        → (nothing — pure TS, no imports from other layers)
application   → domain
infrastructure → domain
interface     → application
```

Violation is `error`. Default is `disallow`. This prevents infrastructure bleeding into application logic and interface layers bypassing the application layer.

### lint script

Every app already has `"lint": "eslint src/"` (api) or `"lint": "next lint"` (web zones). No changes needed — Turborepo's `turbo lint` calls each app's own script.

`next lint` in Next.js zones respects `eslint.config.js` when present (Next.js 15+).

---

## 3. Git Hooks — Lefthook

### Installation

Add to root `devDependencies`:
```
lefthook
```

Run `lefthook install` after install to register hooks in `.git/hooks`.

Add to root `package.json` scripts:
```json
"prepare": "lefthook install"
```

### lefthook.yml (repo root)

```yaml
pre-commit:
  parallel: true
  commands:
    format-check:
      glob: "*.{ts,tsx,js,json,md}"
      run: prettier --check {staged_files}
    lint:
      glob: "*.{ts,tsx}"
      run: eslint {staged_files}

pre-push:
  commands:
    typecheck:
      run: bun turbo typecheck
    test:
      run: bun turbo test
```

**pre-commit behavior:**
- Runs only on staged files matching the glob — fast even in large monorepos
- `format-check` and `lint` run in parallel
- Fails fast: if Prettier finds unformatted files, the commit is blocked
- Developer runs `bun format` to fix, re-stages, recommits

**pre-push behavior:**
- Runs `turbo typecheck` and `turbo test` sequentially
- Turborepo remote cache means unchanged packages cost ~0ms
- Pushes to shared branches only pass if types and unit tests are green

---

## 4. Turborepo Pipeline Update

Add `format` task to `turbo.json` for CI:
```json
"format": { "cache": false }
```

CI runs `turbo lint` and `bun run format:check` independently. Lint is cacheable per package; format check is repo-wide so cache is off.

---

## 5. Files Created / Modified

| File | Action |
|---|---|
| `.prettierrc` | Create |
| `.prettierignore` | Create |
| `lefthook.yml` | Create |
| `packages/eslint-config/nestjs.js` | Create |
| `packages/eslint-config/base.js` | Update (add `eslint-config-prettier`) |
| `packages/eslint-config/nextjs.js` | Update (add `eslint-config-prettier`) |
| `packages/eslint-config/package.json` | Update (add `nestjs` export, add `eslint-config-prettier` dep) |
| `apps/api/eslint.config.js` | Create |
| `apps/web-*/eslint.config.js` | Create (12 files) |
| `apps/e2e/eslint.config.js` | Create |
| `packages/*/eslint.config.js` | Create (7 files) |
| `root package.json` | Update (add `format`, `format:check`, `prepare` scripts; add `prettier`, `lefthook` devDeps) |
| `turbo.json` | Update (add `format` task) |

Dependencies installed via `bun add`:
- Root: `prettier`, `lefthook` (devDeps)
- `packages/eslint-config`: `eslint-config-prettier` (dev + peer)
- Each app/package: `@future/eslint-config`, `eslint` (devDeps, where missing)
