# Future Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete Future monorepo skeleton so the build team can write the first line of business logic immediately — everything compiles, lints, and passes CI.

**Architecture:** Turborepo monorepo with four workspace roots (`apps/*`, `agents/*`, `data-platform/*`, `packages/*`). Shared packages are built first since apps depend on them. Each app is a stub that compiles clean and exports the right surface area. No business logic.

**Tech Stack:** Bun 1.3, Turborepo 2.9, TypeScript 6, NestJS 11, Next.js 16, Drizzle 0.45, tRPC 11, Vitest 4, Playwright 1.59

**Status:** implemented

---

## File Map

```
/                          → Task 1
packages/tsconfig/         → Task 2
packages/eslint-config/    → Task 2
packages/event-contracts/  → Task 3
packages/auth/             → Task 4
packages/db/               → Task 5
packages/ui/               → Task 6
packages/api-client/       → Task 7
apps/api/                  → Tasks 8–10
apps/web-shell/            → Task 11
apps/web-{zone}/           → Task 12
apps/e2e/                  → Task 13
agents/                    → Task 14
data-platform/             → Task 15
.github/workflows/         → Task 16
infra/                     → Task 17
```

---

## Task 1: Workspace Root

**Files:**

- Create: `package.json`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "future",
  "private": true,
  "workspaces": ["apps/*", "agents/*", "data-platform/*", "packages/*"],
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:e2e": "turbo test:e2e",
    "db:generate": "bun run --cwd packages/db generate",
    "db:migrate": "bun run --cwd packages/db migrate"
  },
  "devDependencies": {
    "turbo": "^2.9.4",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "test:e2e": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.next/
dist/
.turbo/
*.env.local
.env
coverage/
*.tsbuildinfo
.DS_Store
```

Note: `bun.lockb` is committed — do NOT add it to `.gitignore`.

- [ ] **Step 4: Create `.env.example`**

```
# Database
DATABASE_URL=postgresql://future:future@localhost:5432/future
TEST_DATABASE_URL=postgresql://future:future@localhost:5432/future_test

# API
PORT=4000

# Auth (Microsoft Entra)
ENTRA_TENANT_ID=your-entra-tenant-id
ENTRA_CLIENT_ID=your-entra-client-id

# Web zones
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXTAUTH_URL=http://localhost:3000
```

- [ ] **Step 5: Create `README.md`**

````markdown
# Future

Agent-native enterprise OS by SETA.

## Dev Setup

```bash
bun install

# API + one zone (most common)
bun turbo dev --filter=api --filter=web-people

# Type-check everything
bun turbo typecheck

# DB migrations
bun db:generate
bun db:migrate

# Unit tests
bun vitest run --project unit

# Integration tests (requires TEST_DATABASE_URL)
bun vitest run --project integration

# E2E (requires staging)
bun playwright test
```
````

See `docs/` for full architecture and tech stack docs.

````

- [ ] **Step 6: Install Turborepo and verify workspace**

```bash
bun add -d turbo@^2.9.4 typescript@^6.0.2
bun install
````

Expected: `bun.lockb` created, `node_modules/.bin/turbo` exists.

- [ ] **Step 7: Commit**

```bash
git add package.json turbo.json .gitignore .env.example README.md bun.lockb
git commit -m "chore: init turborepo workspace root"
```

---

## Task 2: Shared Config Packages

**Files:**

- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/nextjs.json`
- Create: `packages/eslint-config/package.json`
- Create: `packages/eslint-config/base.js`
- Create: `packages/eslint-config/nextjs.js`

- [ ] **Step 1: Create `packages/tsconfig/package.json`**

```json
{
  "name": "@future/tsconfig",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./base.json": "./base.json",
    "./nextjs.json": "./nextjs.json"
  }
}
```

- [ ] **Step 2: Create `packages/tsconfig/base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2025",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create `packages/tsconfig/nextjs.json`**

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "plugins": [{ "name": "next" }]
  }
}
```

- [ ] **Step 4: Install eslint-plugin-boundaries**

```bash
bun add -d eslint@^9 @typescript-eslint/eslint-plugin@^8 eslint-plugin-boundaries@^4 --cwd packages/eslint-config
```

- [ ] **Step 5: Create `packages/eslint-config/package.json`**

```json
{
  "name": "@future/eslint-config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./base": "./base.js",
    "./nextjs": "./nextjs.js"
  },
  "devDependencies": {
    "eslint": "^9",
    "@typescript-eslint/eslint-plugin": "^8",
    "eslint-plugin-boundaries": "^4"
  }
}
```

- [ ] **Step 6: Create `packages/eslint-config/base.js`**

```js
import boundaries from 'eslint-plugin-boundaries'
import tsPlugin from '@typescript-eslint/eslint-plugin'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    plugins: {
      '@typescript-eslint': tsPlugin,
      boundaries,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'infrastructure', allow: ['domain'] },
            { from: 'application', allow: ['domain'] },
            { from: 'interface', allow: ['application'] },
          ],
        },
      ],
    },
  },
]
```

- [ ] **Step 7: Create `packages/eslint-config/nextjs.js`**

```js
import base from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      // Next.js zones use <a> tags for cross-zone navigation — not <Link>
      // (intentional — subdomain routing requires hard reload between zones)
    },
  },
]
```

- [ ] **Step 8: Commit**

```bash
git add packages/tsconfig packages/eslint-config
git commit -m "chore: add tsconfig and eslint-config packages"
```

---

## Task 3: `packages/event-contracts`

Zero deps. Plain TypeScript event classes. Every event has a static `eventName` and typed constructor args.

**Files:**

- Create: `packages/event-contracts/package.json`
- Create: `packages/event-contracts/tsconfig.json`
- Create: `packages/event-contracts/src/` (9 namespace directories + index)

- [ ] **Step 1: Create `packages/event-contracts/package.json`**

```json
{
  "name": "@future/event-contracts",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@future/eslint-config": "*",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `packages/event-contracts/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create all event classes**

Create each file exactly as shown. No external imports.

`src/kernel/decision-case-resolved.event.ts`:

```ts
export class DecisionCaseResolvedEvent {
  static readonly eventName = 'kernel.decision-case-resolved'
  constructor(
    public readonly tenantId: string,
    public readonly caseId: string,
    public readonly finalAction: 'approved' | 'rejected',
    public readonly decidedBy: string,
  ) {}
}
```

`src/people/person-hired.event.ts`:

```ts
export class PersonHiredEvent {
  static readonly eventName = 'people.person-hired'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly employmentId: string,
    public readonly effectiveDate: string,
  ) {}
}
```

`src/people/person-offboarded.event.ts`:

```ts
export class PersonOffboardedEvent {
  static readonly eventName = 'people.person-offboarded'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly effectiveDate: string,
  ) {}
}
```

`src/people/org-placement-changed.event.ts`:

```ts
export class OrgPlacementChangedEvent {
  static readonly eventName = 'people.org-placement-changed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly newManagerId: string,
    public readonly newDepartmentId: string,
  ) {}
}
```

`src/time/leave-approved.event.ts`:

```ts
export class LeaveApprovedEvent {
  static readonly eventName = 'time.leave-approved'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly leaveRequestId: string,
    public readonly from: string,
    public readonly to: string,
  ) {}
}
```

`src/time/leave-rejected.event.ts`:

```ts
export class LeaveRejectedEvent {
  static readonly eventName = 'time.leave-rejected'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly leaveRequestId: string,
    public readonly reason: string,
  ) {}
}
```

`src/hiring/candidate-hired.event.ts`:

```ts
export class CandidateHiredEvent {
  static readonly eventName = 'hiring.candidate-hired'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly candidateId: string,
    public readonly startDate: string,
  ) {}
}
```

`src/projects/assignment-changed.event.ts`:

```ts
export class AssignmentChangedEvent {
  static readonly eventName = 'projects.assignment-changed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly projectId: string,
    public readonly role: string,
    public readonly effectiveDate: string,
  ) {}
}
```

`src/performance/review-cycle-completed.event.ts`:

```ts
export class ReviewCycleCompletedEvent {
  static readonly eventName = 'performance.review-cycle-completed'
  constructor(
    public readonly tenantId: string,
    public readonly cycleId: string,
    public readonly completedAt: string,
  ) {}
}
```

`src/goals/kpi-score-submitted.event.ts`:

```ts
export class KpiScoreSubmittedEvent {
  static readonly eventName = 'goals.kpi-score-submitted'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly kpiId: string,
    public readonly score: number,
    public readonly period: string,
  ) {}
}
```

`src/finance/invoice-approved.event.ts`:

```ts
export class InvoiceApprovedEvent {
  static readonly eventName = 'finance.invoice-approved'
  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly approvedBy: string,
    public readonly amount: number,
  ) {}
}
```

`src/planner/task-created.event.ts`:

```ts
export class TaskCreatedEvent {
  static readonly eventName = 'planner.task-created'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly title: string,
    public readonly kpiId: string | null,
    public readonly dueDate: string | null,
  ) {}
}
```

`src/planner/task-completed.event.ts`:

```ts
export class TaskCompletedEvent {
  static readonly eventName = 'planner.task-completed'
  constructor(
    public readonly tenantId: string,
    public readonly actorId: string,
    public readonly taskId: string,
    public readonly completedAt: string,
  ) {}
}
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
export { DecisionCaseResolvedEvent } from './kernel/decision-case-resolved.event.js'
export { PersonHiredEvent } from './people/person-hired.event.js'
export { PersonOffboardedEvent } from './people/person-offboarded.event.js'
export { OrgPlacementChangedEvent } from './people/org-placement-changed.event.js'
export { LeaveApprovedEvent } from './time/leave-approved.event.js'
export { LeaveRejectedEvent } from './time/leave-rejected.event.js'
export { CandidateHiredEvent } from './hiring/candidate-hired.event.js'
export { AssignmentChangedEvent } from './projects/assignment-changed.event.js'
export { ReviewCycleCompletedEvent } from './performance/review-cycle-completed.event.js'
export { KpiScoreSubmittedEvent } from './goals/kpi-score-submitted.event.js'
export { InvoiceApprovedEvent } from './finance/invoice-approved.event.js'
export { TaskCreatedEvent } from './planner/task-created.event.js'
export { TaskCompletedEvent } from './planner/task-completed.event.js'
```

- [ ] **Step 5: Typecheck**

```bash
bun turbo typecheck --filter=@future/event-contracts
```

Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/event-contracts
git commit -m "chore: add event-contracts package with all domain event classes"
```

---

## Task 4: `packages/auth`

MSAL helpers — no React dep, no NestJS dep.

**Files:**

- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts`
- Create: `packages/auth/src/use-session.ts`
- Create: `packages/auth/src/parse-token.ts`

- [ ] **Step 1: Create `packages/auth/package.json`**

```json
{
  "name": "@future/auth",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@azure/msal-browser": "^3.0.0"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 2: Install deps**

```bash
bun add @azure/msal-browser@^3.0.0 --cwd packages/auth
```

- [ ] **Step 3: Create `packages/auth/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["dom", "esnext"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `src/parse-token.ts`**

```ts
export interface FutureTokenClaims {
  oid: string // Entra Object ID → maps to actor.sso_subject
  tid: string // Entra Tenant ID
  preferred_username: string
  name: string
  roles: string[]
}

export function parseToken(idToken: string): FutureTokenClaims {
  // TODO: decode the Entra OIDC JWT and extract claims
  // For now, return a stub — real implementation uses MSAL token claims
  throw new Error('parseToken: not yet implemented')
}
```

- [ ] **Step 5: Create `src/use-session.ts`**

```ts
export interface Session {
  actorId: string
  tenantId: string
  roles: string[]
  displayName: string
}

export function useSession(): Session | null {
  // TODO: read the httpOnly session cookie via /api/auth/me
  // This hook is a stub — implement when MSAL is wired in web-shell
  return null
}
```

- [ ] **Step 6: Create `src/index.ts`**

```ts
export type { FutureTokenClaims } from './parse-token.js'
export { parseToken } from './parse-token.js'
export type { Session } from './use-session.js'
export { useSession } from './use-session.js'
```

- [ ] **Step 7: Typecheck**

```bash
bun turbo typecheck --filter=@future/auth
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/auth
git commit -m "chore: add auth package with MSAL session stubs"
```

---

## Task 5: `packages/db`

Drizzle ORM setup, migration runner stub, test helpers.

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/src/test-helpers/index.ts`
- Create: `packages/db/drizzle/migrations/.gitkeep`

- [ ] **Step 1: Install deps**

```bash
bun add drizzle-orm@^0.45 pg uuidv7 --cwd packages/db
bun add -d drizzle-kit @types/pg typescript --cwd packages/db
```

- [ ] **Step 2: Create `packages/db/package.json`**

```json
{
  "name": "@future/db",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "generate": "drizzle-kit generate",
    "migrate": "bun run src/migrate.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.45",
    "pg": "^8",
    "uuidv7": "^1"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@types/pg": "^8",
    "drizzle-kit": "^0.28",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "moduleResolution": "nodenext",
    "module": "nodenext"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/*.schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
```

- [ ] **Step 5: Create `packages/db/src/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
  })
  return drizzle(pool)
}

export type Db = ReturnType<typeof createDb>
```

- [ ] **Step 6: Create `packages/db/src/migrate.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

async function runMigrations() {
  const connectionString = process.env['DATABASE_URL']
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString })
  const db = drizzle(pool)

  await migrate(db, { migrationsFolder: './drizzle/migrations' })
  await pool.end()
  console.log('Migrations complete')
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 7: Create `packages/db/src/test-helpers/index.ts`**

```ts
import { createDb, type Db } from '../index.js'

export function createTestDb(): Db {
  const url = process.env['TEST_DATABASE_URL']
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests')
  return createDb(url)
}

export async function seedActor(
  db: Db,
  overrides?: Partial<{
    id: string
    tenantId: string
    type: 'person' | 'organization' | 'system'
    displayName: string
  }>,
) {
  // TODO: implement once kernel schema is defined in apps/api
  throw new Error('seedActor: not yet implemented — add after kernel schema Task 9')
}
```

- [ ] **Step 8: Create `packages/db/drizzle/migrations/.gitkeep`**

```bash
touch packages/db/drizzle/migrations/.gitkeep
```

- [ ] **Step 9: Typecheck**

```bash
bun turbo typecheck --filter=@future/db
```

Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/db
git commit -m "chore: add db package with Drizzle setup and migration runner"
```

---

## Task 6: `packages/ui`

Purely presentational React components. No API calls, no auth.

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/components/global-nav.tsx`

- [ ] **Step 1: Install deps**

```bash
bun add react@^19 react-dom@^19 --cwd packages/ui
bun add -d @types/react @types/react-dom typescript tailwindcss@^4 --cwd packages/ui
```

- [ ] **Step 2: Create `packages/ui/package.json`**

```json
{
  "name": "@future/ui",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/nextjs.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `src/components/global-nav.tsx`**

```tsx
interface NavItem {
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'People', href: 'https://people.seta-international.com' },
  { label: 'Time', href: 'https://time.seta-international.com' },
  { label: 'Hiring', href: 'https://hiring.seta-international.com' },
  { label: 'Performance', href: 'https://performance.seta-international.com' },
  { label: 'Projects', href: 'https://projects.seta-international.com' },
  { label: 'Finance', href: 'https://finance.seta-international.com' },
  { label: 'Goals', href: 'https://goals.seta-international.com' },
  { label: 'Insights', href: 'https://insights.seta-international.com' },
  { label: 'Agents', href: 'https://agents.seta-international.com' },
  { label: 'Planner', href: 'https://planner.seta-international.com' },
  { label: 'Admin', href: 'https://admin.seta-international.com' },
]

export function GlobalNav() {
  return (
    <nav className="flex items-center gap-4 px-4 py-2 border-b">
      <a href="https://seta-international.com" className="font-bold">
        Future
      </a>
      {NAV_ITEMS.map((item) => (
        // Use <a> tags — not Next.js <Link> — cross-zone nav requires hard reload
        <a key={item.href} href={item.href} className="text-sm hover:underline">
          {item.label}
        </a>
      ))}
    </nav>
  )
}
```

- [ ] **Step 5: Create `src/index.ts`**

```ts
export { GlobalNav } from './components/global-nav.js'
```

- [ ] **Step 6: Typecheck**

```bash
bun turbo typecheck --filter=@future/ui
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "chore: add ui package with GlobalNav stub"
```

---

## Task 7: `packages/api-client`

Type-only tRPC export. Zero runtime server code ships to the browser.

**Files:**

- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/api-client/src/client.ts`

- [ ] **Step 1: Install deps**

```bash
bun add @trpc/client@^11 --cwd packages/api-client
bun add -d @trpc/server@^11 typescript --cwd packages/api-client
```

- [ ] **Step 2: Create `packages/api-client/package.json`**

```json
{
  "name": "@future/api-client",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@trpc/client": "^11"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@trpc/server": "^11",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create `packages/api-client/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `src/client.ts`**

```ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from './index.js'

export function createTRPCClient(apiUrl: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url: `${apiUrl}/trpc` })],
  })
}

export type TRPCClient = ReturnType<typeof createTRPCClient>
```

- [ ] **Step 5: Create `src/index.ts`**

```ts
// TYPE ONLY — no runtime server code imported here.
// AppRouter is defined in apps/api and re-exported as a type.
// Import like: import type { AppRouter } from '@future/api-client'
export type { AppRouter } from 'apps/api/src/common/trpc/app-router.js'

export { createTRPCClient } from './client.js'
export type { TRPCClient } from './client.js'
```

Note: The `export type { AppRouter }` path resolves at build time via the monorepo workspace. The `import type` keyword ensures zero runtime code is included.

- [ ] **Step 6: Typecheck**

```bash
bun turbo typecheck --filter=@future/api-client
```

Expected: exit 0. (This will succeed once apps/api exists from Task 8.)

- [ ] **Step 7: Commit**

```bash
git add packages/api-client
git commit -m "chore: add api-client package with type-only AppRouter export"
```

---

## Task 8: `apps/api` — Foundation

NestJS bootstrap, health endpoint, tRPC module, nestjs-cls setup.

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.env.example`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/common/health/health.controller.ts`
- Create: `apps/api/src/common/cls/cls.module.ts`
- Create: `apps/api/src/common/trpc/app-router.ts`
- Create: `apps/api/src/common/trpc/trpc.module.ts`

- [ ] **Step 1: Install deps**

```bash
bun add @nestjs/core@^11 @nestjs/common@^11 @nestjs/platform-fastify@^11 @nestjs/config@^4 nestjs-cls@^5 @trpc/server@^11 zod reflect-metadata rxjs --cwd apps/api
bun add -d typescript vitest @vitest/coverage-v8 --cwd apps/api
```

- [ ] **Step 2: Create `apps/api/package.json`**

```json
{
  "name": "@future/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "bun run --watch src/main.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration"
  },
  "dependencies": {
    "@nestjs/common": "^11",
    "@nestjs/config": "^4",
    "@nestjs/core": "^11",
    "@nestjs/platform-fastify": "^11",
    "@trpc/server": "^11",
    "nestjs-cls": "^5",
    "reflect-metadata": "^0.2",
    "rxjs": "^7",
    "zod": "^3"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@vitest/coverage-v8": "^4",
    "typescript": "^6.0.2",
    "vitest": "^4"
  }
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": {
    "moduleResolution": "nodenext",
    "module": "nodenext",
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        include: ['src/**/*.spec.ts'],
        exclude: ['src/**/*.integration.spec.ts'],
      },
      {
        name: 'integration',
        include: ['src/**/*.integration.spec.ts'],
        setupFiles: ['src/test-setup.integration.ts'],
      },
    ],
  },
})
```

- [ ] **Step 5: Create `apps/api/src/common/cls/cls.module.ts`**

```ts
import { Module, Global } from '@nestjs/common'
import { ClsModule } from 'nestjs-cls'

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          // TODO: extract tenantId + actorId from session cookie
          // and call cls.set('tenantId', tenantId) here
        },
      },
    }),
  ],
})
export class AppClsModule {}
```

- [ ] **Step 6: Create `apps/api/src/common/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common'

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' }
  }
}
```

- [ ] **Step 7: Create `apps/api/src/common/trpc/app-router.ts`**

```ts
import { initTRPC } from '@trpc/server'

// TODO: add auth context (tenantId, actorId) from nestjs-cls
const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

// AppRouter is assembled here by merging all module routers.
// Each module contributes its router in Task 10.
export const appRouter = router({
  // Module routers are merged here as each module is scaffolded.
  // Example (added in Task 10):
  // people: peopleRouter,
})

export type AppRouter = typeof appRouter
```

- [ ] **Step 8: Create `apps/api/src/common/trpc/trpc.module.ts`**

```ts
import { Module } from '@nestjs/common'

@Module({})
export class TrpcModule {}
```

- [ ] **Step 9: Create `apps/api/src/app.module.ts`**

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppClsModule } from './common/cls/cls.module.js'
import { TrpcModule } from './common/trpc/trpc.module.js'
import { HealthController } from './common/health/health.controller.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppClsModule,
    TrpcModule,
    // Domain modules are added in Task 10
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 10: Create `apps/api/src/main.ts`**

```ts
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  const port = parseInt(process.env['PORT'] ?? '4000', 10)
  await app.listen(port, '0.0.0.0')
  console.log(`API listening on :${port}`)
}

bootstrap()
```

- [ ] **Step 11: Create `apps/api/Dockerfile`**

```dockerfile
FROM oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb turbo.json ./
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/api ./apps/api
RUN cd apps/api && bun run build

FROM oven/bun:1.3-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 4000
CMD ["bun", "run", "dist/main.js"]
```

- [ ] **Step 12: Create `apps/api/.env.example`**

```
DATABASE_URL=postgresql://future:future@localhost:5432/future
PORT=4000
```

- [ ] **Step 13: Typecheck**

```bash
bun turbo typecheck --filter=@future/api
```

Expected: exit 0.

- [ ] **Step 14: Smoke-test startup**

```bash
cd apps/api && bun run dev
```

Expected: `API listening on :4000` in logs. Ctrl-C to stop.

- [ ] **Step 15: Verify health endpoint**

```bash
curl http://localhost:4000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 16: Commit**

```bash
git add apps/api
git commit -m "chore: scaffold NestJS API with health endpoint and tRPC foundation"
```

---

## Task 9: `apps/api` — Kernel Module

The kernel module is the foundation everything else builds on. It gets pre-stubbed schema files for all 15 kernel tables per `docs/architecture/kernel.md`.

**Files:**

- Create: `apps/api/src/modules/kernel/` (full hexagonal layout)
- Create: `apps/api/src/modules/kernel/infrastructure/schema/` (15 table stubs)

- [ ] **Step 1: Create kernel module hexagonal structure**

Create these files exactly:

`src/modules/kernel/domain/repositories/.gitkeep` — empty

`src/modules/kernel/domain/entities/.gitkeep` — empty

`src/modules/kernel/domain/value-objects/.gitkeep` — empty

`src/modules/kernel/application/commands/.gitkeep` — empty

`src/modules/kernel/application/queries/.gitkeep` — empty

`src/modules/kernel/application/event-handlers/.gitkeep` — empty

`src/modules/kernel/application/facades/kernel-query.facade.ts`:

```ts
import { Injectable } from '@nestjs/common'

/**
 * KernelQueryFacade is the only cross-module import allowed from the kernel.
 * No module imports kernel repositories or entities directly.
 */
@Injectable()
export class KernelQueryFacade {
  // TODO: implement actor lookup, role checks, delegation resolution
  async getActor(tenantId: string, actorId: string): Promise<null> {
    return null
  }

  async hasRole(tenantId: string, actorId: string, role: string): Promise<boolean> {
    return false
  }
}
```

`src/modules/kernel/infrastructure/repositories/.gitkeep` — empty

`src/modules/kernel/infrastructure/listeners/.gitkeep` — empty

`src/modules/kernel/interface/trpc/kernel.router.ts`:

```ts
import { router, publicProcedure } from '../../../../common/trpc/app-router.js'

export const kernelRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' })),
})
```

`src/modules/kernel/kernel.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { KernelQueryFacade } from './application/facades/kernel-query.facade.js'

@Module({
  providers: [KernelQueryFacade],
  exports: [KernelQueryFacade],
})
export class KernelModule {}
```

- [ ] **Step 2: Create kernel schema stubs (15 tables)**

`src/modules/kernel/infrastructure/schema/actor.schema.ts`:

```ts
import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const coreSchema = pgSchema('core')

export const actor = coreSchema.table('actor', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  type: text('type', { enum: ['person', 'organization', 'system'] }).notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/user-identity.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const userIdentity = coreSchema.table('user_identity', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(), // soft ref to actor.id
  ssoSubject: text('sso_subject').notNull(), // Entra OID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/external-identity-map.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const externalIdentityMap = coreSchema.table('external_identity_map', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  systemName: text('system_name').notNull(), // 'ems' | 'timesheet' | 'slack' | 'teams'
  externalId: text('external_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/department.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const department = coreSchema.table('department', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'), // soft ref to department.id
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/role-grant.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const roleGrant = coreSchema.table('role_grant', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  role: text('role').notNull(),
  scope: text('scope', { enum: ['global', 'department', 'project', 'account'] }).notNull(),
  scopeId: uuid('scope_id'),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/delegation.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const delegation = coreSchema.table('delegation', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  delegatorId: uuid('delegator_id').notNull(),
  delegateeId: uuid('delegatee_id').notNull(),
  role: text('role').notNull(),
  validFrom: timestamp('valid_from').notNull(),
  validUntil: timestamp('valid_until').notNull(),
})
```

`src/modules/kernel/infrastructure/schema/org-placement.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const orgPlacement = coreSchema.table('org_placement', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  departmentId: uuid('department_id').notNull(),
  managerId: uuid('manager_id'),
  effectiveFrom: timestamp('effective_from').notNull(),
  effectiveUntil: timestamp('effective_until'), // NULL = current placement
})
```

`src/modules/kernel/infrastructure/schema/decision-case.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const decisionCase = coreSchema.table('decision_case', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  module: text('module').notNull(),
  subjectId: uuid('subject_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    .notNull()
    .default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/decision-step.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const decisionStep = coreSchema.table('decision_step', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  stepOrder: integer('step_order').notNull(),
  approverId: uuid('approver_id').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  decidedAt: timestamp('decided_at'),
})
```

`src/modules/kernel/infrastructure/schema/decision-outcome.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const decisionOutcome = coreSchema.table('decision_outcome', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  caseId: uuid('case_id').notNull(),
  finalAction: text('final_action', { enum: ['approved', 'rejected'] }).notNull(),
  decidedBy: uuid('decided_by').notNull(),
  decidedAt: timestamp('decided_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/audit-event.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

// INSERT-ONLY. No UPDATE or DELETE ever.
export const auditEvent = coreSchema.table('audit_event', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  eventType: text('event_type').notNull(),
  module: text('module').notNull(),
  subjectId: uuid('subject_id').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/outbox-event.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const outboxEvent = coreSchema.table('outbox_event', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb('payload').notNull(),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'),
})
```

`src/modules/kernel/infrastructure/schema/visibility-scope.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const visibilityScope = coreSchema.table('visibility_scope', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/exposure-contract.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const exposureContract = coreSchema.table('exposure_contract', {
  id: uuid('id')
    .$defaultFn(() => uuidv7())
    .primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  toolName: text('tool_name').notNull(), // e.g. 'people_get_employment_profile'
  scopeId: uuid('scope_id').notNull(),
  allowedRoles: text('allowed_roles').array().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

`src/modules/kernel/infrastructure/schema/processed-events.schema.ts`:

```ts
import { coreSchema } from './actor.schema.js'
import { uuid, text, timestamp } from 'drizzle-orm/pg-core'

// Idempotency log for outbox event relay
export const processedEvents = coreSchema.table('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
})
```

- [ ] **Step 3: Add KernelModule to AppModule**

Modify `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppClsModule } from './common/cls/cls.module.js'
import { TrpcModule } from './common/trpc/trpc.module.js'
import { HealthController } from './common/health/health.controller.js'
import { KernelModule } from './modules/kernel/kernel.module.js'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AppClsModule, TrpcModule, KernelModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Typecheck**

```bash
bun turbo typecheck --filter=@future/api
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kernel
git commit -m "chore: scaffold kernel module with 15 table schema stubs"
```

---

## Task 10: `apps/api` — Remaining 11 Domain Modules

People, time, hiring, performance, projects, finance, goals, insights, agents, planner, admin. All follow the exact same hexagonal layout as kernel.

**Files:** For each module `{name}`:

- `src/modules/{name}/domain/entities/.gitkeep`
- `src/modules/{name}/domain/value-objects/.gitkeep`
- `src/modules/{name}/domain/repositories/.gitkeep`
- `src/modules/{name}/application/commands/.gitkeep`
- `src/modules/{name}/application/queries/.gitkeep`
- `src/modules/{name}/application/event-handlers/.gitkeep`
- `src/modules/{name}/application/facades/{name}-query.facade.ts`
- `src/modules/{name}/infrastructure/repositories/.gitkeep`
- `src/modules/{name}/infrastructure/schema/{name}.schema.ts`
- `src/modules/{name}/infrastructure/listeners/.gitkeep`
- `src/modules/{name}/interface/trpc/{name}.router.ts`
- `src/modules/{name}/{name}.module.ts`

- [ ] **Step 1: Create each module using this template**

For each of the 11 modules, substitute `{Name}` (PascalCase) and `{name}` (camelCase):

`src/modules/{name}/application/facades/{name}-query.facade.ts`:

```ts
import { Injectable } from '@nestjs/common'

@Injectable()
export class {Name}QueryFacade {
  // TODO: implement queries for {name} module
}
```

`src/modules/{name}/infrastructure/schema/{name}.schema.ts`:

```ts
import { pgSchema } from 'drizzle-orm/pg-core'

export const {name}Schema = pgSchema('{name}')

// TODO: define tables for {name} module
// All tables must have: id (uuid v7), tenant_id (uuid, notNull)
```

`src/modules/{name}/interface/trpc/{name}.router.ts`:

```ts
import { router, publicProcedure } from '../../../../common/trpc/app-router.js'

export const {name}Router = router({
  // TODO: add procedures for {name} module
})
```

`src/modules/{name}/{name}.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { {Name}QueryFacade } from './application/facades/{name}-query.facade.js'

@Module({
  providers: [{Name}QueryFacade],
  exports: [{Name}QueryFacade],
})
export class {Name}Module {}
```

Apply this template for all 11 modules:

| Module name   | PascalCase    |
| ------------- | ------------- |
| `people`      | `People`      |
| `time`        | `Time`        |
| `hiring`      | `Hiring`      |
| `performance` | `Performance` |
| `projects`    | `Projects`    |
| `finance`     | `Finance`     |
| `goals`       | `Goals`       |
| `insights`    | `Insights`    |
| `agents`      | `Agents`      |
| `planner`     | `Planner`     |
| `admin`       | `Admin`       |

- [ ] **Step 2: Add all modules to AppModule**

Replace `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppClsModule } from './common/cls/cls.module.js'
import { TrpcModule } from './common/trpc/trpc.module.js'
import { HealthController } from './common/health/health.controller.js'
import { KernelModule } from './modules/kernel/kernel.module.js'
import { PeopleModule } from './modules/people/people.module.js'
import { TimeModule } from './modules/time/time.module.js'
import { HiringModule } from './modules/hiring/hiring.module.js'
import { PerformanceModule } from './modules/performance/performance.module.js'
import { ProjectsModule } from './modules/projects/projects.module.js'
import { FinanceModule } from './modules/finance/finance.module.js'
import { GoalsModule } from './modules/goals/goals.module.js'
import { InsightsModule } from './modules/insights/insights.module.js'
import { AgentsModule } from './modules/agents/agents.module.js'
import { PlannerModule } from './modules/planner/planner.module.js'
import { AdminModule } from './modules/admin/admin.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppClsModule,
    TrpcModule,
    KernelModule,
    PeopleModule,
    TimeModule,
    HiringModule,
    PerformanceModule,
    ProjectsModule,
    FinanceModule,
    GoalsModule,
    InsightsModule,
    AgentsModule,
    PlannerModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 3: Merge all module routers into AppRouter**

Update `src/common/trpc/app-router.ts`:

```ts
import { initTRPC } from '@trpc/server'
import { kernelRouter } from '../../modules/kernel/interface/trpc/kernel.router.js'
import { peopleRouter } from '../../modules/people/interface/trpc/people.router.js'
import { timeRouter } from '../../modules/time/interface/trpc/time.router.js'
import { hiringRouter } from '../../modules/hiring/interface/trpc/hiring.router.js'
import { performanceRouter } from '../../modules/performance/interface/trpc/performance.router.js'
import { projectsRouter } from '../../modules/projects/interface/trpc/projects.router.js'
import { financeRouter } from '../../modules/finance/interface/trpc/finance.router.js'
import { goalsRouter } from '../../modules/goals/interface/trpc/goals.router.js'
import { insightsRouter } from '../../modules/insights/interface/trpc/insights.router.js'
import { agentsRouter } from '../../modules/agents/interface/trpc/agents.router.js'
import { plannerRouter } from '../../modules/planner/interface/trpc/planner.router.js'
import { adminRouter } from '../../modules/admin/interface/trpc/admin.router.js'

const t = initTRPC.create()
export const router = t.router
export const publicProcedure = t.procedure

export const appRouter = router({
  kernel: kernelRouter,
  people: peopleRouter,
  time: timeRouter,
  hiring: hiringRouter,
  performance: performanceRouter,
  projects: projectsRouter,
  finance: financeRouter,
  goals: goalsRouter,
  insights: insightsRouter,
  agents: agentsRouter,
  planner: plannerRouter,
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
```

- [ ] **Step 4: Typecheck**

```bash
bun turbo typecheck --filter=@future/api
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules apps/api/src/common/trpc/app-router.ts apps/api/src/app.module.ts
git commit -m "chore: scaffold all 12 domain modules with hexagonal layout and tRPC router stubs"
```

---

## Task 11: `apps/web-shell`

Microsoft Entra auth hub. Thin by design. All other zones read session from httpOnly cookie.

**Files:**

- Create: `apps/web-shell/package.json`
- Create: `apps/web-shell/tsconfig.json`
- Create: `apps/web-shell/next.config.ts`
- Create: `apps/web-shell/Dockerfile`
- Create: `apps/web-shell/src/app/layout.tsx`
- Create: `apps/web-shell/src/app/page.tsx`
- Create: `apps/web-shell/src/app/globals.css`
- Create: `apps/web-shell/src/app/api/auth/me/route.ts`

- [ ] **Step 1: Install deps**

```bash
bun add next@^16 react@^19 react-dom@^19 @future/ui @future/auth --cwd apps/web-shell
bun add -d typescript @types/react @types/react-dom --cwd apps/web-shell
```

- [ ] **Step 2: Create `apps/web-shell/package.json`**

```json
{
  "name": "@future/web-shell",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev --port 3000",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "@future/auth": "*",
    "@future/ui": "*",
    "next": "^16",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create `apps/web-shell/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "next.config.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/web-shell/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // No basePath — web-shell runs at root of shell.seta-international.com
}

export default config
```

- [ ] **Step 5: Create `src/app/globals.css`**

```css
@import 'tailwindcss';
```

- [ ] **Step 6: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Future',
  description: 'Agent-native enterprise OS by SETA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Create `src/app/page.tsx`**

```tsx
import { GlobalNav } from '@future/ui'

export default function HomePage() {
  return (
    <div>
      <GlobalNav />
      <main className="p-8">
        <h1 className="text-2xl font-bold">Future</h1>
        <p className="mt-2 text-gray-600">Select a module from the navigation.</p>
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Create `src/app/api/auth/me/route.ts`**

```ts
import { NextResponse } from 'next/server'

// TODO: validate MSAL session cookie and return actor context
export async function GET() {
  return NextResponse.json(
    { error: 'Not implemented — MSAL session not yet wired' },
    { status: 501 },
  )
}
```

- [ ] **Step 9: Create `apps/web-shell/Dockerfile`**

```dockerfile
FROM oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb turbo.json ./
COPY packages/ ./packages/
COPY apps/web-shell/package.json ./apps/web-shell/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-shell ./apps/web-shell
RUN cd apps/web-shell && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-shell/.next/standalone ./
COPY --from=builder /app/apps/web-shell/.next/static ./apps/web-shell/.next/static
COPY --from=builder /app/apps/web-shell/public ./apps/web-shell/public
EXPOSE 3000
CMD ["bun", "apps/web-shell/server.js"]
```

- [ ] **Step 10: Typecheck**

```bash
bun turbo typecheck --filter=@future/web-shell
```

Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add apps/web-shell
git commit -m "chore: scaffold web-shell with Next.js 16, GlobalNav, and auth/me stub"
```

---

## Task 12: All 11 Domain Web Zones

All zones are identical in structure. The template below uses `web-people` (port 3001) as the reference. Apply to all 11.

| Zone              | Port | Subdomain                          |
| ----------------- | ---- | ---------------------------------- |
| `web-people`      | 3001 | people.seta-international.com      |
| `web-time`        | 3002 | time.seta-international.com        |
| `web-hiring`      | 3003 | hiring.seta-international.com      |
| `web-performance` | 3004 | performance.seta-international.com |
| `web-projects`    | 3005 | projects.seta-international.com    |
| `web-finance`     | 3006 | finance.seta-international.com     |
| `web-goals`       | 3007 | goals.seta-international.com       |
| `web-insights`    | 3008 | insights.seta-international.com    |
| `web-agents`      | 3009 | agents.seta-international.com      |
| `web-admin`       | 3010 | admin.seta-international.com       |
| `web-planner`     | 3011 | planner.seta-international.com     |

- [ ] **Step 1: Create `apps/web-people/package.json`** (template — repeat for all 11 with name/port substituted)

```json
{
  "name": "@future/web-people",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "next build",
    "dev": "next dev --port 3001",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  },
  "dependencies": {
    "@future/api-client": "*",
    "@future/auth": "*",
    "@future/ui": "*",
    "next": "^16",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `apps/web-people/tsconfig.json`** (identical for all zones)

```json
{
  "extends": "@future/tsconfig/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "next.config.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web-people/next.config.ts`** (identical for all zones)

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // No basePath — subdomain routing (people.seta-international.com)
}

export default config
```

- [ ] **Step 4: Create `apps/web-people/src/app/globals.css`**

```css
@import 'tailwindcss';
```

- [ ] **Step 5: Create `apps/web-people/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { GlobalNav } from '@future/ui'
import './globals.css'

export const metadata: Metadata = { title: 'People — Future' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GlobalNav />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Create `apps/web-people/src/app/page.tsx`**

```tsx
export default function PeoplePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">People</h1>
      <p className="mt-2 text-gray-500">Coming soon.</p>
    </main>
  )
}
```

- [ ] **Step 7: Create Dockerfile** (same pattern as web-shell — substitute zone name and port)

```dockerfile
FROM oven/bun:1.3-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb turbo.json ./
COPY packages/ ./packages/
COPY apps/web-people/package.json ./apps/web-people/
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/web-people ./apps/web-people
RUN cd apps/web-people && bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web-people/.next/standalone ./
COPY --from=builder /app/apps/web-people/.next/static ./apps/web-people/.next/static
EXPOSE 3001
CMD ["bun", "apps/web-people/server.js"]
```

- [ ] **Step 8: Repeat Steps 1–7 for all remaining zones**

Apply with exact substitutions:

| Zone dir          | `name` field              | `--port` | `EXPOSE` | Title                |
| ----------------- | ------------------------- | -------- | -------- | -------------------- |
| `web-time`        | `@future/web-time`        | 3002     | 3002     | Time — Future        |
| `web-hiring`      | `@future/web-hiring`      | 3003     | 3003     | Hiring — Future      |
| `web-performance` | `@future/web-performance` | 3004     | 3004     | Performance — Future |
| `web-projects`    | `@future/web-projects`    | 3005     | 3005     | Projects — Future    |
| `web-finance`     | `@future/web-finance`     | 3006     | 3006     | Finance — Future     |
| `web-goals`       | `@future/web-goals`       | 3007     | 3007     | Goals — Future       |
| `web-insights`    | `@future/web-insights`    | 3008     | 3008     | Insights — Future    |
| `web-agents`      | `@future/web-agents`      | 3009     | 3009     | Agents — Future      |
| `web-admin`       | `@future/web-admin`       | 3010     | 3010     | Admin — Future       |
| `web-planner`     | `@future/web-planner`     | 3011     | 3011     | Planner — Future     |

- [ ] **Step 9: Typecheck all zones**

```bash
bun turbo typecheck --filter="@future/web-*"
```

Expected: exit 0 for all 11 zones.

- [ ] **Step 10: Commit**

```bash
git add apps/web-people apps/web-time apps/web-hiring apps/web-performance apps/web-projects apps/web-finance apps/web-goals apps/web-insights apps/web-agents apps/web-admin apps/web-planner
git commit -m "chore: scaffold all 11 domain web zones (Next.js 16, standalone, GlobalNav)"
```

---

## Task 13: `apps/e2e`

Playwright test runner. Runs against staging only.

**Files:**

- Create: `apps/e2e/package.json`
- Create: `apps/e2e/tsconfig.json`
- Create: `apps/e2e/playwright.config.ts`
- Create: `apps/e2e/fixtures/tenant.ts`
- Create: `apps/e2e/tests/auth.spec.ts`
- Create: `apps/e2e/tests/leave-approval.spec.ts`

- [ ] **Step 1: Install deps**

```bash
bun add -d @playwright/test@^1.59 --cwd apps/e2e
```

- [ ] **Step 2: Create `apps/e2e/package.json`**

```json
{
  "name": "@future/e2e",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@future/tsconfig": "*",
    "@playwright/test": "^1.59",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create `apps/e2e/tsconfig.json`**

```json
{
  "extends": "@future/tsconfig/base.json",
  "compilerOptions": { "moduleResolution": "bundler" },
  "include": ["."]
}
```

- [ ] **Step 4: Create `apps/e2e/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://shell.seta-international.com',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
```

- [ ] **Step 5: Create `apps/e2e/fixtures/tenant.ts`**

```ts
import type { Page } from '@playwright/test'

export async function seedTestTenant(_page: Page): Promise<{ tenantId: string }> {
  // TODO: call staging API to create a test tenant and return tenantId
  throw new Error('seedTestTenant: not yet implemented')
}

export async function teardownTestTenant(_tenantId: string): Promise<void> {
  // TODO: call staging API to delete the test tenant
  throw new Error('teardownTestTenant: not yet implemented')
}
```

- [ ] **Step 6: Create `apps/e2e/tests/auth.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Future/)
})

test('unauthenticated user is redirected to login', async ({ page }) => {
  // TODO: implement once MSAL is wired
  test.skip()
})
```

- [ ] **Step 7: Create `apps/e2e/tests/leave-approval.spec.ts`**

```ts
import { test } from '@playwright/test'

test.describe('Leave approval flow', () => {
  test('employee submits leave request and manager approves', async () => {
    // TODO: implement once time module is built
    test.skip()
  })
})
```

- [ ] **Step 8: Commit**

```bash
git add apps/e2e
git commit -m "chore: scaffold Playwright e2e with auth and leave approval test stubs"
```

---

## Task 14: `agents/` Top-Level Folder

Langfuse ECS service + MCP tool contracts, prompts, evals, channel adapters.

**Files:**

- Create: `agents/langfuse/Dockerfile`
- Create: `agents/langfuse/.env.example`
- Create: `agents/mcp-tools/README.md` + per-module `.gitkeep` files
- Create: `agents/prompts/README.md` + stub directories
- Create: `agents/evals/README.md` + `run-evals.sh`
- Create: `agents/channels/README.md` + adapter stubs

- [ ] **Step 1: Create `agents/langfuse/Dockerfile`**

```dockerfile
# Langfuse self-hosted LLM observability
# No custom code — we carry this Dockerfile so ECR push can tag and push
# the upstream image to our ECR repo for air-gap compliance.
FROM langfuse/langfuse:latest
```

- [ ] **Step 2: Create `agents/langfuse/.env.example`**

```
NEXTAUTH_SECRET=your-nextauth-secret
DATABASE_URL=postgresql://langfuse:langfuse@localhost:5432/langfuse
NEXTAUTH_URL=http://localhost:3030
LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=false
```

- [ ] **Step 3: Create `agents/mcp-tools/README.md`**

```markdown
# MCP Tool Contracts

Per-module MCP tool definitions. Each subdirectory contains the tool schemas
for that module's exposed capabilities.

Tool naming convention: `{module}_{action}`
Examples: `people_get_employment_profile`, `time_submit_leave_request`

Every tool call must:

1. Check `exposure_contract` (deny-by-default access control)
2. Check `role_grant` (actor permissions)
3. Write an `audit_event` after execution

See: docs/architecture/agent-runtime.md
```

Then create `.gitkeep` files:

```bash
for dir in people time hiring performance projects finance goals planner admin; do
  mkdir -p agents/mcp-tools/$dir
  touch agents/mcp-tools/$dir/.gitkeep
done
```

- [ ] **Step 4: Create `agents/prompts/README.md`**

```markdown
# Versioned Prompts

System prompts, topic routing configs, and guardrail rule definitions.
All files here are versioned — model upgrades require eval validation before
swapping prompt versions.

topics/ → YAML configs mapping user intent to agent topics
guardrails/ → Rule definitions for agent safety enforcement
```

```bash
mkdir -p agents/prompts/topics agents/prompts/guardrails
touch agents/prompts/topics/.gitkeep agents/prompts/guardrails/.gitkeep
```

- [ ] **Step 5: Create `agents/evals/README.md`**

```markdown
# LLM Eval Harness

Test prompt → expected tool call pairs for regression testing model behavior.
Run before any model version upgrade.

See: docs/architecture/agent-runtime.md for eval strategy.
```

- [ ] **Step 6: Create `agents/evals/run-evals.sh`**

```bash
#!/usr/bin/env bash
# TODO: wire to CI on model version change
# Runs eval fixtures against the configured model and reports pass/fail rate
echo "Eval harness not yet implemented. See docs/architecture/agent-runtime.md."
exit 1
```

```bash
chmod +x agents/evals/run-evals.sh
mkdir -p agents/evals/fixtures
touch agents/evals/fixtures/.gitkeep
```

- [ ] **Step 7: Create channel adapter stubs**

```bash
mkdir -p agents/channels/teams agents/channels/slack agents/channels/websocket
```

`agents/channels/README.md`:

```markdown
# Channel Adapters

One adapter per communication channel. Each adapter normalizes inbound messages
into the agent gateway's channel-agnostic format.

Adding a new channel = one new adapter class.
See: docs/architecture/agent-runtime.md — Channels section.
```

`agents/channels/teams/README.md`:

```markdown
# Microsoft Teams Adapter

TODO: implement Teams Bot Framework webhook handler.
Normalizes Teams activity payloads → AgentGateway.handleMessage()
```

`agents/channels/slack/README.md`:

```markdown
# Slack Adapter

TODO: implement Slack Events API handler.
Bot token stored in AWS Secrets Manager — never in the database.
See: docs/architecture/agent-runtime.md — Slack channel section.
```

`agents/channels/websocket/README.md`:

```markdown
# WebSocket Adapter

TODO: implement WebSocket adapter for web-agents zone real-time chat.
```

- [ ] **Step 8: Commit**

```bash
git add agents/
git commit -m "chore: scaffold agents/ folder with langfuse, mcp-tools, prompts, evals, channels"
```

---

## Task 15: `data-platform/`

Cube.js semantic layer (real config, stub cubes) and Glue ETL Python scripts.

**Files:**

- Create: `data-platform/cubejs/package.json`
- Create: `data-platform/cubejs/cube.js`
- Create: `data-platform/cubejs/Dockerfile`
- Create: `data-platform/cubejs/.env.example`
- Create: `data-platform/cubejs/model/cubes/` (7 stub cube files)
- Create: `data-platform/glue/jobs/etl_bronze.py`
- Create: `data-platform/glue/jobs/etl_gold.py`
- Create: `data-platform/glue/requirements.txt`
- Create: `data-platform/glue/deploy.sh`
- Create: `data-platform/glue/README.md`

- [ ] **Step 1: Create `data-platform/cubejs/package.json`**

```json
{
  "name": "@future/cubejs",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "cubejs-server",
    "build": "cubejs-server build"
  },
  "dependencies": {
    "@cubejs-backend/athena-driver": "^1.6",
    "@cubejs-backend/postgres-driver": "^1.6",
    "@cubejs-backend/server": "^1.6"
  }
}
```

- [ ] **Step 2: Create `data-platform/cubejs/cube.js`**

```js
const { FileRepository } = require('@cubejs-backend/server-core')

module.exports = {
  // Two data sources:
  // - operational: RDS read replica (last 30 days, low-latency OLAP)
  // - historical:  Amazon Athena (full history via S3 Gold Iceberg tables)
  dbType: ({ dataSource }) => {
    if (dataSource === 'historical') return 'athena'
    return 'postgres'
  },

  driverFactory: ({ dataSource }) => {
    if (dataSource === 'historical') {
      return new (require('@cubejs-backend/athena-driver'))({
        accessKeyId: process.env.CUBEJS_ATHENA_KEY_ID,
        secretAccessKey: process.env.CUBEJS_ATHENA_SECRET,
        region: process.env.CUBEJS_ATHENA_REGION ?? 'ap-southeast-1',
        S3OutputLocation: process.env.CUBEJS_ATHENA_S3_OUTPUT,
        database: 'future_gold',
      })
    }
    return new (require('@cubejs-backend/postgres-driver'))({
      host: process.env.CUBEJS_DB_HOST,
      database: process.env.CUBEJS_DB_NAME,
      user: process.env.CUBEJS_DB_USER,
      password: process.env.CUBEJS_DB_PASS,
      port: parseInt(process.env.CUBEJS_DB_PORT ?? '5432', 10),
    })
  },

  // Inject tenant_id filter on every query — multi-tenant isolation
  queryTransformer: (query, { securityContext }) => {
    const tenantId = securityContext?.tenantId
    if (!tenantId) throw new Error('tenantId required in Cube.js security context')
    return {
      ...query,
      filters: [
        ...(query.filters ?? []),
        {
          member: `${query.measures?.[0]?.split('.')[0]}.tenantId`,
          operator: 'equals',
          values: [tenantId],
        },
      ],
    }
  },

  apiSecret: process.env.CUBEJS_API_SECRET,
  schemaPath: 'model',
}
```

- [ ] **Step 3: Create `data-platform/cubejs/model/cubes/LeaveRequest.js`**

```js
cube('LeaveRequest', {
  dataSource: 'operational',
  sql: `SELECT * FROM time.leave_request`,

  dimensions: {
    tenantId: { sql: 'tenant_id', type: 'string' },
    id: { sql: 'id', type: 'string', primaryKey: true },
    status: { sql: 'status', type: 'string' },
    actorId: { sql: 'actor_id', type: 'string' },
  },

  measures: {
    count: { type: 'count' },
  },
})
```

- [ ] **Step 4: Create remaining cube stubs**

Create these files with the same structure — `dataSource: 'operational'` unless noted:

`model/cubes/LeaveRequestHistory.js` — `dataSource: 'historical'`, `sql: SELECT * FROM future_gold.time_leave_request`

`model/cubes/Employment.js` — `dataSource: 'operational'`, `sql: SELECT * FROM people.employment_contract`

`model/cubes/HiringFunnel.js` — `dataSource: 'operational'`, `sql: SELECT * FROM hiring.application`

`model/cubes/KpiScore.js` — `dataSource: 'operational'`, `sql: SELECT * FROM goals.kpi_score`

`model/cubes/Invoice.js` — `dataSource: 'operational'`, `sql: SELECT * FROM finance.invoice`

`model/cubes/TaskCompletion.js` — `dataSource: 'operational'`, `sql: SELECT * FROM planner.task`

Each follows the same pattern: `tenantId` dimension, `id` primaryKey, `count` measure, SQL points to the module schema.

- [ ] **Step 5: Create `data-platform/cubejs/.env.example`**

```
CUBEJS_DB_HOST=localhost
CUBEJS_DB_PORT=5432
CUBEJS_DB_NAME=future
CUBEJS_DB_USER=future
CUBEJS_DB_PASS=future
CUBEJS_ATHENA_KEY_ID=your-key
CUBEJS_ATHENA_SECRET=your-secret
CUBEJS_ATHENA_REGION=ap-southeast-1
CUBEJS_ATHENA_S3_OUTPUT=s3://future-athena-results/
CUBEJS_REDIS_URL=redis://localhost:6379
CUBEJS_API_SECRET=your-api-secret
```

- [ ] **Step 6: Create `data-platform/cubejs/Dockerfile`**

```dockerfile
FROM cubejs/cube:latest
WORKDIR /cube/conf
COPY . .
EXPOSE 4001
```

- [ ] **Step 7: Create `data-platform/glue/jobs/etl_bronze.py`**

```python
"""
Watermark-based extract from RDS → S3 Bronze (Parquet).
Reads all module schemas: people, time, hiring, performance, projects,
finance, goals, planner, kernel.audit_event

AWS Glue Python Shell job. Runtime provides awsglue, boto3, pyarrow.
"""
import sys
import boto3
from datetime import datetime, timezone

# Module schemas to extract
SCHEMAS = [
    'core', 'people', 'time', 'hiring', 'performance',
    'projects', 'finance', 'goals', 'planner', 'agents',
]

def get_watermark(s3, bucket: str, schema: str, table: str) -> str:
    """Read last extracted timestamp from S3 watermark file."""
    key = f'watermarks/{schema}/{table}.txt'
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj['Body'].read().decode().strip()
    except s3.exceptions.NoSuchKey:
        return '1970-01-01T00:00:00Z'

def write_watermark(s3, bucket: str, schema: str, table: str, ts: str) -> None:
    s3.put_object(Bucket=bucket, Key=f'watermarks/{schema}/{table}.txt', Body=ts.encode())

def extract_table(conn, schema: str, table: str, watermark: str):
    """Extract rows updated since watermark. Returns list of dicts."""
    # TODO: implement JDBC extract using Glue DynamicFrame
    # SELECT * FROM {schema}.{table} WHERE updated_at > '{watermark}'
    raise NotImplementedError(f'extract_table({schema}.{table}): implement JDBC connection')

def write_parquet(rows, s3_path: str) -> None:
    """Write rows to S3 Bronze as Parquet."""
    # TODO: implement using pyarrow + boto3
    raise NotImplementedError('write_parquet: implement pyarrow write')

if __name__ == '__main__':
    s3 = boto3.client('s3')
    bucket = sys.argv[1]  # S3 Bronze bucket name
    run_ts = datetime.now(timezone.utc).isoformat()
    print(f'ETL Bronze run started: {run_ts}')
    # TODO: iterate SCHEMAS, get watermarks, extract, write parquet, update watermarks
```

- [ ] **Step 8: Create `data-platform/glue/jobs/etl_gold.py`**

```python
"""
Iceberg MERGE from S3 Bronze → S3 Gold via AWS Glue Data Catalog.
Merge key: (tenant_id, id) — universal across all tables.

AWS Glue Python Shell job. Runtime provides awsglue, boto3.
"""
import sys
from datetime import datetime, timezone

def merge_bronze_to_gold(database: str, table: str) -> None:
    """
    MERGE INTO future_gold.{table}
    USING future_bronze.{table}
    ON gold.tenant_id = bronze.tenant_id AND gold.id = bronze.id
    WHEN MATCHED THEN UPDATE SET ...
    WHEN NOT MATCHED THEN INSERT ...
    """
    # TODO: implement via Athena query execution (boto3 athena client)
    raise NotImplementedError(f'merge_bronze_to_gold({database}.{table}): implement Athena MERGE')

if __name__ == '__main__':
    run_ts = datetime.now(timezone.utc).isoformat()
    print(f'ETL Gold run started: {run_ts}')
    # TODO: list Bronze tables from Glue Data Catalog and MERGE each into Gold
```

- [ ] **Step 9: Create `data-platform/glue/requirements.txt`**

```
# Glue runtime provides: awsglue, boto3, pyspark
# Additional deps must be uploaded as a .whl file alongside the script
pyarrow>=15.0
```

- [ ] **Step 10: Create `data-platform/glue/deploy.sh`**

```bash
#!/usr/bin/env bash
# Uploads Glue scripts to S3 and updates Glue job definitions.
# TODO: wire to GitHub Actions deploy-glue.yml
set -euo pipefail

BUCKET="${GLUE_SCRIPTS_BUCKET:?GLUE_SCRIPTS_BUCKET env var required}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"

echo "Uploading Glue scripts to s3://$BUCKET/scripts/"
aws s3 cp jobs/etl_bronze.py "s3://$BUCKET/scripts/etl_bronze.py" --region "$AWS_REGION"
aws s3 cp jobs/etl_gold.py   "s3://$BUCKET/scripts/etl_gold.py"   --region "$AWS_REGION"

echo "TODO: aws glue update-job for etl_bronze and etl_gold"
echo "See docs/architecture/data-platform.md for full Glue job config."
```

```bash
chmod +x data-platform/glue/deploy.sh
```

- [ ] **Step 11: Create `data-platform/glue/README.md`**

````markdown
# AWS Glue ETL

Hourly batch pipeline: RDS → S3 Bronze (Parquet) → S3 Gold (Iceberg) → Athena.

See `docs/architecture/data-platform.md` for full pipeline spec.

## Deploy

```bash
GLUE_SCRIPTS_BUCKET=your-bucket ./deploy.sh
```
````

````

- [ ] **Step 12: Commit**

```bash
git add data-platform/
git commit -m "chore: scaffold data-platform/ with Cube.js config and Glue ETL stubs"
````

---

## Task 16: CI/CD Workflows

`ci.yml` fully wired. 17 deploy stubs (one per ECS service + Glue).

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-api.yml` (and 16 more)

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.3'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint (affected)
        run: bun turbo lint --filter='[HEAD^1]'

      - name: Typecheck (affected)
        run: bun turbo typecheck --filter='[HEAD^1]'

      - name: Unit tests
        run: bun vitest run --project unit
        working-directory: apps/api

      - name: Integration tests
        run: bun vitest run --project integration
        working-directory: apps/api
        env:
          TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

- [ ] **Step 2: Create deploy stub template**

Create `.github/workflows/deploy-api.yml`:

```yaml
name: Deploy API

on:
  push:
    branches: [main]
    paths:
      - 'apps/api/**'
      - 'packages/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ap-southeast-1

      # TODO: bun turbo build --filter=api
      # TODO: docker build --platform linux/arm64 -t $ECR_REGISTRY/future-api:$SHA .
      # TODO: docker push $ECR_REGISTRY/future-api:$SHA
      # TODO: aws ecs update-service --cluster future --service api --force-new-deployment
      # See: docs/architecture/deployment.md for full pipeline spec
      - run: echo "Deploy not yet implemented. See docs/architecture/deployment.md."
```

- [ ] **Step 3: Create remaining 16 deploy stubs**

Create each file with the same structure, substituting `path`, service name, and port:

| File                         | `paths` filter            | Service                   |
| ---------------------------- | ------------------------- | ------------------------- |
| `deploy-web-shell.yml`       | `apps/web-shell/**`       | web-shell                 |
| `deploy-web-people.yml`      | `apps/web-people/**`      | web-people                |
| `deploy-web-time.yml`        | `apps/web-time/**`        | web-time                  |
| `deploy-web-hiring.yml`      | `apps/web-hiring/**`      | web-hiring                |
| `deploy-web-performance.yml` | `apps/web-performance/**` | web-performance           |
| `deploy-web-projects.yml`    | `apps/web-projects/**`    | web-projects              |
| `deploy-web-finance.yml`     | `apps/web-finance/**`     | web-finance               |
| `deploy-web-goals.yml`       | `apps/web-goals/**`       | web-goals                 |
| `deploy-web-insights.yml`    | `apps/web-insights/**`    | web-insights              |
| `deploy-web-agents.yml`      | `apps/web-agents/**`      | web-agents                |
| `deploy-web-planner.yml`     | `apps/web-planner/**`     | web-planner               |
| `deploy-web-admin.yml`       | `apps/web-admin/**`       | web-admin                 |
| `deploy-cubejs.yml`          | `data-platform/cubejs/**` | cubejs                    |
| `deploy-langfuse.yml`        | `agents/langfuse/**`      | langfuse                  |
| `deploy-glue.yml`            | `data-platform/glue/**`   | glue (S3 upload, not ECS) |

For `deploy-glue.yml`, replace the ECS TODO comment with:

```yaml
# TODO: GLUE_SCRIPTS_BUCKET=your-bucket bash data-platform/glue/deploy.sh
```

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "chore: add ci.yml and 17 deploy workflow stubs"
```

---

## Task 17: Terraform Stubs

Correct file structure with TODO markers. No real HCL resources.

**Files:** All under `infra/`

- [ ] **Step 1: Create `infra/bootstrap/main.tf`**

```hcl
# Bootstrap: create S3 state bucket and DynamoDB lock table.
# Run ONCE before any other Terraform operations.
# See docs/architecture/deployment.md — Terraform section.

# TODO: aws_s3_bucket "terraform_state"
# TODO: aws_s3_bucket_versioning "terraform_state"
# TODO: aws_dynamodb_table "terraform_lock"
```

- [ ] **Step 2: Create `infra/bootstrap/README.md`**

````markdown
# Terraform Bootstrap

Run once before any other Terraform ops to create the S3 state bucket and DynamoDB lock table.

```bash
cd infra/bootstrap
terraform init
terraform apply
```
````

````

- [ ] **Step 3: Create all module stubs**

Create each `infra/modules/{name}/main.tf` with a comment block:

`infra/modules/vpc/main.tf`:
```hcl
# VPC: 2 AZs, public + private subnets, NAT gateway, security groups
# See docs/architecture/deployment.md — Network section
# TODO: aws_vpc, aws_subnet, aws_internet_gateway, aws_nat_gateway, aws_security_group
````

`infra/modules/alb/main.tf`:

```hcl
# ALB: HTTPS listener, host-based routing to ECS services, ACM wildcard cert for *.seta-international.com
# See docs/architecture/deployment.md — ALB Routing section
# TODO: aws_lb, aws_lb_listener, aws_lb_listener_rule (per zone), aws_acm_certificate
```

`infra/modules/ecs-cluster/main.tf`:

```hcl
# ECS Cluster: Fargate + Spot capacity providers, Graviton ARM64
# See docs/architecture/deployment.md — ECS Cluster section
# TODO: aws_ecs_cluster, aws_ecs_cluster_capacity_providers
```

`infra/modules/ecs-service/main.tf`:

```hcl
# Parameterized ECS service module (name, image, cpu, memory, spot_weight)
# Used by: api, web-shell, all 11 zones, cubejs, langfuse
# See docs/architecture/deployment.md — ECS Services section
# TODO: aws_ecs_task_definition, aws_ecs_service, aws_cloudwatch_log_group
```

`infra/modules/rds/main.tf`:

```hcl
# RDS PostgreSQL 16 (db.t4g.medium), RDS Proxy, read replica (single-AZ)
# See docs/architecture/deployment.md — Database section
# TODO: aws_db_instance (primary), aws_db_instance (read replica), aws_db_proxy
```

`infra/modules/rds-langfuse/main.tf`:

```hcl
# Isolated RDS for Langfuse LLM trace storage (db.t4g.micro)
# Separate from the main application RDS — Langfuse owns its schema
# TODO: aws_db_instance "langfuse"
```

`infra/modules/redis/main.tf`:

```hcl
# ElastiCache Redis (cache.t4g.small) — Cube.js query cache only
# TODO: aws_elasticache_cluster, aws_elasticache_subnet_group
```

`infra/modules/ecr/main.tf`:

```hcl
# ECR repos: one per ECS service (15 total)
# api, web-shell, web-people, web-time, web-hiring, web-performance,
# web-projects, web-finance, web-goals, web-insights, web-agents,
# web-planner, web-admin, cubejs, langfuse
# (glue has no ECR repo — Python scripts uploaded directly to S3)
# TODO: aws_ecr_repository x15, aws_ecr_lifecycle_policy
```

`infra/modules/secrets/main.tf`:

```hcl
# Secrets Manager entries: DB creds, OPENAI_API_KEY, Slack/Teams bot tokens
# Key paths:
#   future/{env}/db-password
#   future/{env}/openai-api-key
#   future/{env}/tenant/{tenantId}/openai-api-key  (per-tenant BYO)
#   future/{env}/slack/bot-token
#   future/{env}/teams/bot-token
# TODO: aws_secretsmanager_secret x5+
```

`infra/modules/glue/main.tf`:

```hcl
# AWS Glue: ETL jobs, Data Catalog databases, crawlers
# Jobs: etl_bronze (hourly), etl_gold (hourly, after bronze)
# Catalogs: future_bronze, future_gold
# TODO: aws_glue_job x2, aws_glue_catalog_database x2, aws_glue_crawler
```

`infra/modules/eventbridge/main.tf`:

```hcl
# EventBridge: staging scale-to-zero rules (9am-8pm SGT weekdays)
# Scale up:   cron(0 1 ? * MON-FRI *)  → ECS desired count 1
# Scale down: cron(0 12 ? * MON-FRI *) → ECS desired count 0
# Production: no schedule rules
# TODO: aws_cloudwatch_event_rule, aws_cloudwatch_event_target x2
```

- [ ] **Step 4: Create root Terraform files**

`infra/main.tf`:

```hcl
# Root Terraform configuration
# Calls all modules. See each module's main.tf for what it provisions.
# See docs/architecture/deployment.md for full infrastructure spec.

module "vpc"         { source = "./modules/vpc" }
module "alb"         { source = "./modules/alb" }
module "ecs_cluster" { source = "./modules/ecs-cluster" }
module "rds"         { source = "./modules/rds" }
module "rds_langfuse" { source = "./modules/rds-langfuse" }
module "redis"       { source = "./modules/redis" }
module "ecr"         { source = "./modules/ecr" }
module "secrets"     { source = "./modules/secrets" }
module "glue"        { source = "./modules/glue" }
module "eventbridge" { source = "./modules/eventbridge" }
```

`infra/variables.tf`:

```hcl
variable "env"    { type = string }
variable "region" { type = string  default = "ap-southeast-1" }
```

`infra/backend.tf`:

```hcl
terraform {
  backend "s3" {
    # Bucket and table created by infra/bootstrap/main.tf
    bucket         = "future-terraform-state"
    key            = "future/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "future-terraform-lock"
    encrypt        = true
  }
}
```

`infra/environments/staging.tfvars`:

```hcl
env    = "staging"
region = "ap-southeast-1"
# ECS task sizes, min/max counts, schedule rules — fill in from deployment.md
```

`infra/environments/production.tfvars`:

```hcl
env    = "production"
region = "ap-southeast-1"
# Production sizes — no scale-to-zero schedule rules
```

- [ ] **Step 5: Commit**

```bash
git add infra/
git commit -m "chore: add Terraform module stubs for all infrastructure components"
```

---

## Task 18: Final Verification

End-to-end check that the complete scaffold compiles, typechecks, and lints clean.

- [ ] **Step 1: Install all dependencies from root**

```bash
bun install
```

Expected: no errors, all workspaces resolved.

- [ ] **Step 2: Typecheck all packages**

```bash
bun turbo typecheck
```

Expected: exit 0 across all packages and apps.

- [ ] **Step 3: Lint all packages**

```bash
bun turbo lint
```

Expected: exit 0. Fix any boundary violations or TS errors before proceeding.

- [ ] **Step 4: Smoke-test API startup**

```bash
cd apps/api && bun run dev &
sleep 3
curl -s http://localhost:4000/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Confirm workspace glob resolves all four roots**

```bash
bun pm ls --json | grep '"name"'
```

Expected: all packages from `apps/*`, `agents/*`, `data-platform/*`, `packages/*` listed.

- [ ] **Step 6: Tag the scaffold commit**

```bash
git tag -a scaffold/v1 -m "Complete monorepo scaffold — Phase 0 complete"
```

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final scaffold verification fixes"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement                                      | Covered by              |
| ----------------------------------------------------- | ----------------------- |
| Workspace root with 4 workspace globs                 | Task 1                  |
| 7 shared packages                                     | Tasks 2–7               |
| apps/api with 12 module hexagonal skeletons           | Tasks 8–10              |
| apps/web-shell                                        | Task 11                 |
| 11 domain web zones                                   | Task 12                 |
| apps/e2e Playwright                                   | Task 13                 |
| agents/ with langfuse + stubs                         | Task 14                 |
| data-platform/ with cubejs + glue                     | Task 15                 |
| ci.yml fully wired + 17 deploy stubs                  | Task 16                 |
| Terraform all stubs                                   | Task 17                 |
| kernel 15 table schema stubs                          | Task 9                  |
| event-contracts all 13 event classes                  | Task 3                  |
| `moduleResolution: nodenext` for API                  | Task 8                  |
| `moduleResolution: bundler` for web zones             | Task 11–12              |
| UUID v7 on all kernel tables                          | Task 9                  |
| No cross-schema FK constraints                        | Task 9 (soft refs only) |
| Graviton ARM64 Dockerfiles                            | Tasks 8, 11, 12         |
| Deploy path filters correct (data-platform/, agents/) | Task 16                 |
| Glue: no ECR repo, deploy.sh uploads to S3            | Tasks 15, 16            |
| ECR: 15 repos (no glue)                               | Task 17                 |

**Type consistency verified:**

- `AppRouter` defined in `apps/api/src/common/trpc/app-router.ts` → exported via `packages/api-client/src/index.ts` as `import type`
- `KernelQueryFacade` exported from `KernelModule` → only valid cross-module import from kernel
- `coreSchema` defined in `actor.schema.ts` → imported by all other kernel schema files
- Event class constructors use `string | null` (not optional/undefined) for Zod-compatible serialization
