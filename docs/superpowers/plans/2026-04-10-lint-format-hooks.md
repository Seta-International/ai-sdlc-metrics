# Lint, Format, and Git Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire ESLint 9 flat config across all workspaces, add Prettier for formatting, and configure Lefthook for pre-commit (lint + format check on staged files) and pre-push (typecheck + test) git hooks.

**Architecture:** `packages/eslint-config` exports three configs: `base` (TS + prettier), `nestjs` (base + hexagonal boundaries), and `nextjs` (Next.js plugin + TS + prettier). Each app and package gets an `eslint.config.js` that imports the right export. Lefthook manages git hooks via a single `lefthook.yml` at the repo root.

**Tech Stack:** ESLint 9, typescript-eslint 8, eslint-plugin-boundaries 4, eslint-config-prettier, Prettier 3, Lefthook, `@eslint/eslintrc` (FlatCompat for Next.js plugin bridging)

**Status:** implemented

---

## File Map

| File                                        | Action | Purpose                                                                             |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `.prettierrc`                               | Create | Shared Prettier config                                                              |
| `.prettierignore`                           | Create | Exclude build artifacts from formatting                                             |
| `lefthook.yml`                              | Create | Pre-commit and pre-push hook definitions                                            |
| `package.json`                              | Modify | Add `format`, `format:check`, `prepare` scripts; add `prettier`, `lefthook` devDeps |
| `turbo.json`                                | Modify | Add `format` task                                                                   |
| `packages/eslint-config/package.json`       | Modify | Add `nestjs` export; add `eslint-config-prettier` dep                               |
| `packages/eslint-config/base.js`            | Modify | Remove boundaries (moved to nestjs.js); add prettier at end                         |
| `packages/eslint-config/nestjs.js`          | Create | base + boundaries for hexagonal NestJS layers + prettier                            |
| `packages/eslint-config/nextjs.js`          | Modify | Add prettier; add Next.js-specific rule suppressions                                |
| `apps/api/eslint.config.js`                 | Create | Uses `@future/eslint-config/nestjs`                                                 |
| `apps/web-shell/eslint.config.js`           | Create | Uses FlatCompat + `@future/eslint-config/nextjs`                                    |
| `apps/web-people/eslint.config.js`          | Create | Same as web-shell                                                                   |
| `apps/web-time/eslint.config.js`            | Create | Same as web-shell                                                                   |
| `apps/web-hiring/eslint.config.js`          | Create | Same as web-shell                                                                   |
| `apps/web-performance/eslint.config.js`     | Create | Same as web-shell                                                                   |
| `apps/web-projects/eslint.config.js`        | Create | Same as web-shell                                                                   |
| `apps/web-finance/eslint.config.js`         | Create | Same as web-shell                                                                   |
| `apps/web-goals/eslint.config.js`           | Create | Same as web-shell                                                                   |
| `apps/web-insights/eslint.config.js`        | Create | Same as web-shell                                                                   |
| `apps/web-agents/eslint.config.js`          | Create | Same as web-shell                                                                   |
| `apps/web-planner/eslint.config.js`         | Create | Same as web-shell                                                                   |
| `apps/web-admin/eslint.config.js`           | Create | Same as web-shell                                                                   |
| `apps/e2e/eslint.config.js`                 | Create | Uses `@future/eslint-config/base`                                                   |
| `packages/auth/eslint.config.js`            | Create | Uses `@future/eslint-config/base`                                                   |
| `packages/db/eslint.config.js`              | Create | Uses `@future/eslint-config/base`                                                   |
| `packages/ui/eslint.config.js`              | Create | Uses `@future/eslint-config/base`                                                   |
| `packages/api-client/eslint.config.js`      | Create | Uses `@future/eslint-config/base`                                                   |
| `packages/event-contracts/eslint.config.js` | Create | Uses `@future/eslint-config/base`                                                   |

---

## Task 1: Add Prettier

**Files:**

- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (root)

- [ ] **Step 1: Install prettier at root**

```bash
bun add -d prettier
```

Expected: `prettier` appears in root `package.json` devDependencies.

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
node_modules
.next
dist
.turbo
coverage
*.tsbuildinfo
```

- [ ] **Step 4: Add format scripts to root `package.json`**

Current `scripts` block:

```json
"scripts": {
  "build":       "turbo build",
  "dev":         "turbo dev",
  "lint":        "turbo lint",
  "typecheck":   "turbo typecheck",
  "test":        "turbo test",
  "test:e2e":    "turbo test:e2e",
  "db:generate": "bun run --cwd packages/db generate",
  "db:migrate":  "bun run --cwd packages/db migrate"
}
```

Add `format` and `format:check`:

```json
"scripts": {
  "build":         "turbo build",
  "dev":           "turbo dev",
  "lint":          "turbo lint",
  "typecheck":     "turbo typecheck",
  "test":          "turbo test",
  "test:e2e":      "turbo test:e2e",
  "format":        "prettier --write .",
  "format:check":  "prettier --check .",
  "db:generate":   "bun run --cwd packages/db generate",
  "db:migrate":    "bun run --cwd packages/db migrate"
}
```

- [ ] **Step 5: Verify Prettier works**

```bash
bun run format:check
```

Expected output: Prettier reports which files need formatting (or all pass). This should not error — just report. If it errors, check that `node_modules/.bin/prettier` exists.

- [ ] **Step 6: Auto-fix all existing files**

```bash
bun run format
```

Expected: Prettier rewrites any files that don't match the config. Many `.ts`, `.json`, `.md` files will change.

- [ ] **Step 7: Commit**

```bash
git add .prettierrc .prettierignore package.json
git add -u   # stage all modified (formatted) files
git commit -m "chore: add prettier with format and format:check scripts"
```

---

## Task 2: Restructure `packages/eslint-config`

**Files:**

- Modify: `packages/eslint-config/base.js`
- Create: `packages/eslint-config/nestjs.js`
- Modify: `packages/eslint-config/nextjs.js`
- Modify: `packages/eslint-config/package.json`

- [ ] **Step 1: Install `eslint-config-prettier` into the config package**

```bash
bun add -d eslint-config-prettier --filter @future/eslint-config
```

Expected: `eslint-config-prettier` appears in `packages/eslint-config/package.json` devDependencies.

- [ ] **Step 2: Add it to peerDependencies too**

Edit `packages/eslint-config/package.json` — add `eslint-config-prettier` to `peerDependencies` and add the `nestjs` export:

```json
{
  "name": "@future/eslint-config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./base": "./base.js",
    "./nestjs": "./nestjs.js",
    "./nextjs": "./nextjs.js"
  },
  "peerDependencies": {
    "eslint": "^9",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "eslint-plugin-boundaries": "^4",
    "eslint-config-prettier": "^10",
    "typescript-eslint": "^8"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "eslint": "^9",
    "eslint-plugin-boundaries": "^4",
    "eslint-config-prettier": "^10",
    "typescript-eslint": "^8"
  }
}
```

- [ ] **Step 3: Rewrite `packages/eslint-config/base.js`**

Remove boundaries (moving to nestjs.js). Add prettier at the end:

```js
import tseslint from 'typescript-eslint'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  prettier,
]
```

- [ ] **Step 4: Create `packages/eslint-config/nestjs.js`**

```js
import boundaries from 'eslint-plugin-boundaries'
import prettier from 'eslint-config-prettier'
import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: '**/modules/*/domain/**' },
        { type: 'application', pattern: '**/modules/*/application/**' },
        { type: 'infrastructure', pattern: '**/modules/*/infrastructure/**' },
        { type: 'interface', pattern: '**/modules/*/interface/**' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'application', allow: ['domain'] },
            { from: 'infrastructure', allow: ['domain'] },
            { from: 'interface', allow: ['application'] },
          ],
        },
      ],
    },
  },
  prettier,
]
```

- [ ] **Step 5: Rewrite `packages/eslint-config/nextjs.js`**

```js
import prettier from 'eslint-config-prettier'
import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      // Next.js zones use <a> for cross-zone navigation — hard reloads are intentional.
      // This rule would fire on every <a href> pointing to another zone.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  prettier,
]
```

- [ ] **Step 6: Commit**

```bash
git add packages/eslint-config/
git commit -m "feat(eslint-config): add nestjs export, integrate eslint-config-prettier"
```

---

## Task 3: Wire `apps/api`

**Files:**

- Create: `apps/api/eslint.config.js`
- Modify: `apps/api/package.json` (add devDeps)

- [ ] **Step 1: Install eslint and config into api**

```bash
bun add -d eslint @future/eslint-config --filter @future/api
```

Expected: `eslint` and `@future/eslint-config` appear in `apps/api/package.json` devDependencies.

- [ ] **Step 2: Create `apps/api/eslint.config.js`**

```js
import nestjs from '@future/eslint-config/nestjs'

export default [...nestjs]
```

- [ ] **Step 3: Verify lint runs**

```bash
cd apps/api && bunx eslint src/ --max-warnings=0
```

Expected: No errors. Warnings (if any) will be listed. If `eslint-plugin-boundaries` reports errors for existing stubs, those stubs may need adjustment — but since `src/modules/` is scaffolded with the correct layer folders, there should be no violations.

- [ ] **Step 4: Commit**

```bash
git add apps/api/eslint.config.js apps/api/package.json
git commit -m "feat(api): wire eslint with nestjs hexagonal boundary config"
```

---

## Task 4: Wire all 12 Next.js zones

**Files:**

- Create: `apps/web-{shell,people,time,hiring,performance,projects,finance,goals,insights,agents,planner,admin}/eslint.config.js`
- Modify: same 12 `package.json` files (add devDeps)

- [ ] **Step 1: Install deps for all 12 zones**

Run one command per zone (replace `web-shell` with each zone name in turn):

```bash
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-shell
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-people
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-time
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-hiring
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-performance
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-projects
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-finance
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-goals
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-insights
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-agents
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-planner
bun add -d eslint @future/eslint-config @eslint/eslintrc eslint-config-next --filter @future/web-admin
```

- [ ] **Step 2: Create `eslint.config.js` in each zone**

All 12 files are identical. Create this file in each zone (e.g. `apps/web-shell/eslint.config.js`, `apps/web-people/eslint.config.js`, etc.):

```js
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import nextjs from '@future/eslint-config/nextjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

export default [...compat.extends('next/core-web-vitals'), ...nextjs]
```

**Why FlatCompat:** `eslint-config-next` uses the legacy config format internally. `FlatCompat` bridges it into ESLint 9's flat config. The `@future/eslint-config/nextjs` TypeScript rules then overlay on top. Prettier (from `nextjs`) is always last, so no formatting conflicts.

- [ ] **Step 3: Verify one zone lints cleanly**

```bash
cd apps/web-shell && bunx next lint --no-cache
```

Expected: `✔ No ESLint warnings or errors` (or a list of actual issues if any exist in the source files).

- [ ] **Step 4: Commit**

```bash
git add apps/web-shell/eslint.config.js apps/web-shell/package.json
git add apps/web-people/eslint.config.js apps/web-people/package.json
git add apps/web-time/eslint.config.js apps/web-time/package.json
git add apps/web-hiring/eslint.config.js apps/web-hiring/package.json
git add apps/web-performance/eslint.config.js apps/web-performance/package.json
git add apps/web-projects/eslint.config.js apps/web-projects/package.json
git add apps/web-finance/eslint.config.js apps/web-finance/package.json
git add apps/web-goals/eslint.config.js apps/web-goals/package.json
git add apps/web-insights/eslint.config.js apps/web-insights/package.json
git add apps/web-agents/eslint.config.js apps/web-agents/package.json
git add apps/web-planner/eslint.config.js apps/web-planner/package.json
git add apps/web-admin/eslint.config.js apps/web-admin/package.json
git commit -m "feat(web-zones): wire eslint flat config across all 12 Next.js zones"
```

---

## Task 5: Wire `packages/*` and `apps/e2e`

**Files:**

- Create: `packages/auth/eslint.config.js`
- Create: `packages/db/eslint.config.js`
- Create: `packages/ui/eslint.config.js`
- Create: `packages/api-client/eslint.config.js`
- Create: `packages/event-contracts/eslint.config.js`
- Create: `apps/e2e/eslint.config.js`
- Modify: `packages/db/package.json` (add `lint` script — it's the only package missing one)
- Modify: `apps/e2e/package.json` (add `lint` script)

- [ ] **Step 1: Install eslint and config into each package and e2e**

```bash
bun add -d eslint @future/eslint-config --filter @future/auth
bun add -d eslint @future/eslint-config --filter @future/db
bun add -d eslint @future/eslint-config --filter @future/ui
bun add -d eslint @future/eslint-config --filter @future/api-client
bun add -d eslint @future/eslint-config --filter @future/event-contracts
bun add -d eslint @future/eslint-config --filter @future/e2e
```

- [ ] **Step 2: Create `eslint.config.js` — identical for all 5 packages and e2e**

Create this file at each of these paths:

- `packages/auth/eslint.config.js`
- `packages/db/eslint.config.js`
- `packages/ui/eslint.config.js`
- `packages/api-client/eslint.config.js`
- `packages/event-contracts/eslint.config.js`
- `apps/e2e/eslint.config.js`

```js
import base from '@future/eslint-config/base'

export default [...base]
```

- [ ] **Step 3: Add `lint` script to `packages/db/package.json`**

Current scripts:

```json
"scripts": {
  "build":     "tsc",
  "typecheck": "tsc --noEmit",
  "generate":  "drizzle-kit generate",
  "migrate":   "bun run src/migrate.ts"
}
```

Add lint:

```json
"scripts": {
  "build":     "tsc",
  "typecheck": "tsc --noEmit",
  "lint":      "eslint src/",
  "generate":  "drizzle-kit generate",
  "migrate":   "bun run src/migrate.ts"
}
```

- [ ] **Step 4: Add `lint` script to `apps/e2e/package.json`**

Current scripts:

```json
"scripts": {
  "test:e2e": "playwright test"
}
```

Add lint:

```json
"scripts": {
  "lint":     "eslint src/",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 5: Verify all packages lint**

```bash
cd packages/auth && bunx eslint src/ --max-warnings=0
cd ../../packages/event-contracts && bunx eslint src/ --max-warnings=0
```

Expected: No errors for either.

- [ ] **Step 6: Commit**

```bash
git add packages/auth/eslint.config.js packages/auth/package.json
git add packages/db/eslint.config.js packages/db/package.json
git add packages/ui/eslint.config.js packages/ui/package.json
git add packages/api-client/eslint.config.js packages/api-client/package.json
git add packages/event-contracts/eslint.config.js packages/event-contracts/package.json
git add apps/e2e/eslint.config.js apps/e2e/package.json
git commit -m "feat(packages): wire eslint base config across all packages and e2e"
```

---

## Task 6: Install and configure Lefthook

**Files:**

- Create: `lefthook.yml`
- Modify: `package.json` (root — add `prepare` script and `lefthook` devDep)

- [ ] **Step 1: Install lefthook at root**

```bash
bun add -d lefthook
```

Expected: `lefthook` appears in root `package.json` devDependencies.

- [ ] **Step 2: Add `prepare` script to root `package.json`**

Add to the `scripts` block (alongside the existing scripts):

```json
"prepare": "lefthook install"
```

Full scripts block after edit:

```json
"scripts": {
  "build":        "turbo build",
  "dev":          "turbo dev",
  "lint":         "turbo lint",
  "typecheck":    "turbo typecheck",
  "test":         "turbo test",
  "test:e2e":     "turbo test:e2e",
  "format":       "prettier --write .",
  "format:check": "prettier --check .",
  "prepare":      "lefthook install",
  "db:generate":  "bun run --cwd packages/db generate",
  "db:migrate":   "bun run --cwd packages/db migrate"
}
```

- [ ] **Step 3: Create `lefthook.yml` at repo root**

```yaml
pre-commit:
  parallel: true
  commands:
    format-check:
      glob: '*.{ts,tsx,js,mjs,json,md}'
      run: prettier --check {staged_files}
    lint:
      glob: '*.{ts,tsx}'
      run: eslint {staged_files}

pre-push:
  commands:
    typecheck:
      run: bun turbo typecheck
    test:
      run: bun turbo test
```

**What each section does:**

- `pre-commit` runs only on staged files — fast even in a large monorepo. `parallel: true` runs format-check and lint simultaneously.
- `pre-push` runs the full Turborepo typecheck and test pipelines. Turborepo's remote cache means unchanged packages cost ~0ms.
- `{staged_files}` is Lefthook's built-in template that expands to the list of staged files matching the glob.

- [ ] **Step 4: Register hooks with git**

```bash
bunx lefthook install
```

Expected output:

```
  SYNCING
  SUCCESSFUL
```

This writes hook scripts to `.git/hooks/pre-commit` and `.git/hooks/pre-push`.

- [ ] **Step 5: Smoke-test pre-commit**

Create a temporarily bad file, stage it, and verify lefthook blocks it:

```bash
echo "const x:any = 1" > /tmp/bad.ts
cp /tmp/bad.ts packages/event-contracts/src/bad.ts
git add packages/event-contracts/src/bad.ts
bunx lefthook run pre-commit
```

Expected: Lefthook runs. ESLint should report `@typescript-eslint/no-explicit-any` error on `bad.ts`. The hook exits non-zero (blocked).

Clean up:

```bash
git restore --staged packages/event-contracts/src/bad.ts
rm packages/event-contracts/src/bad.ts
```

- [ ] **Step 6: Commit**

```bash
git add lefthook.yml package.json
git commit -m "chore: add lefthook with pre-commit (lint+format) and pre-push (typecheck+test) hooks"
```

---

## Task 7: Update `turbo.json` and run full monorepo lint

**Files:**

- Modify: `turbo.json`

- [ ] **Step 1: Add `format` task to `turbo.json`**

Current `turbo.json`:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "test:e2e": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Add `format` task:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "test:e2e": { "dependsOn": ["^build"] },
    "format": { "cache": false },
    "dev": { "cache": false, "persistent": true }
  }
}
```

`"cache": false` on `format` because Prettier operates repo-wide — per-package caching doesn't make sense here.

- [ ] **Step 2: Run the full monorepo lint via Turborepo**

```bash
bun run lint
```

Expected: Turborepo fans out `lint` to every workspace that defines a `lint` script. All packages pass. Any real ESLint errors (not config errors) must be fixed before proceeding.

- [ ] **Step 3: Run format check**

```bash
bun run format:check
```

Expected: `All matched files use Prettier code style!`

If files are reported as unformatted, run `bun run format` to fix them, then re-run `format:check`.

- [ ] **Step 4: Commit**

```bash
git add turbo.json
git commit -m "chore: add format task to turbo pipeline"
```

---

## Verification Checklist

After all tasks complete, verify end-to-end:

- [ ] `bun run lint` — all workspaces pass ESLint
- [ ] `bun run format:check` — all files match Prettier style
- [ ] `bun run typecheck` — all workspaces pass TypeScript check
- [ ] Make an intentional boundary violation in `apps/api/src/modules/people/interface/trpc/people.router.ts` — import directly from `infrastructure/` — run `eslint apps/api/src/` — confirm error `boundaries/element-types`
- [ ] Revert the violation, stage a file with `any` in it, run `bunx lefthook run pre-commit` — confirm it blocks
- [ ] Run `git push --dry-run` on the current branch — confirm pre-push runs typecheck and test
