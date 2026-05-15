# agent-vector Demo Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file, self-contained CLI demo for `@seta/agent-vector` that walks through two-tenant FAQ ingest, dedup, vector search, and RLS isolation against local Postgres + pgvector, with human-readable output suitable for screenshots.

**Architecture:** One new file `platform/agent/vector/scripts/demo.ts` invoked via `pnpm exec tsx`. Uses the same `tenant_user` pool pattern as integration tests, real OpenAI embeddings (no mocks), and `platform_admin` for one-shot cleanup. Self-cleaning via random per-run tenant UUIDs — no `TRUNCATE` of shared data.

**Tech Stack:** TypeScript (ESM, top-level await, Node ≥24), `tsx`, `@seta/db` (pool + `withTenant`), `@seta/tenant` (`tenantContext.run`), `@seta/agent-embeddings` (`createOpenAIEmbeddings`), `@seta/agent-vector` (`insertChunks`, `findExistingHashes`, `searchChunks`), `postgres` (one-shot admin connection), `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-05-15-agent-vector-demo-design.md`

**Prerequisite for manual verification:**
- `pnpm db:up` running
- `pnpm migrate` applied
- `OPENAI_API_KEY` exported

---

## File Structure

- Create: `platform/agent/vector/scripts/demo.ts` — single executable script. Sections in order: env preflight → constants → helpers → `main()` → finally cleanup.

No other files are created or modified. No `package.json` script entry is added (consistent with `platform/agent/embeddings/scripts/demo.ts`, which is also invoked via `pnpm exec tsx` directly).

**Note on TDD:** Per CLAUDE.md "Implementation flow" — one-off scripts are exempt from TDD. Verification is one manual end-to-end run of the script against a live local DB; expected output is documented in the spec's "Behavioural guarantees" section.

---

### Task 1: Script skeleton + env preflight

**Files:**
- Create: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Create the script with banner, env check, and graceful exit**

Create `platform/agent/vector/scripts/demo.ts`:

```ts
/**
 * Demo script — @seta/agent-vector
 *
 * Walks through two-tenant FAQ ingest, dedup, vector search, and RLS
 * isolation against a local Postgres + pgvector. Self-cleaning.
 *
 * Prerequisites:
 *   pnpm db:up         (Postgres + pgvector running)
 *   pnpm migrate       (agent_vector schema applied)
 *   OPENAI_API_KEY=... (real embeddings; no mocks)
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm exec tsx platform/agent/vector/scripts/demo.ts
 */

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('ERROR: OPENAI_API_KEY is not set.')
  console.error(
    'Usage: OPENAI_API_KEY=sk-... pnpm exec tsx platform/agent/vector/scripts/demo.ts',
  )
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║         @seta/agent-vector  —  Live Demo                 ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')
console.log(`Database: ${databaseUrl.replace(/(:\/\/)([^:]+):[^@]+@/, '$1$2:***@')}`)
console.log()
```

- [ ] **Step 2: Verify the script runs and exits cleanly without API key**

Run: `pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: exit code 1, prints "ERROR: OPENAI_API_KEY is not set."

- [ ] **Step 3: Verify banner prints with API key set**

Run: `$env:OPENAI_API_KEY = "sk-dummy"; pnpm exec tsx platform/agent/vector/scripts/demo.ts` (PowerShell) or `OPENAI_API_KEY=sk-dummy pnpm exec tsx platform/agent/vector/scripts/demo.ts` (bash)
Expected: prints the boxed banner and the redacted database URL, exits 0.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): scaffold demo script with env preflight"
```

---

### Task 2: FAQ corpora + helper functions

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Add FAQ constants, query strings, and presentation helpers**

Append below the banner block (before `process.exit` is reached — these are top-level constants and helper functions):

```ts
// ─── FAQ corpora ─────────────────────────────────────────────────────────────

interface FaqItem {
  question: string
  answer: string
}

const FAQ_ACME: FaqItem[] = [
  {
    question: 'How do I reset my Acme password?',
    answer:
      'To reset your Acme password, visit acme.example.com/account, click "Forgot password", and follow the link sent to your registered email.',
  },
  {
    question: 'How do I enable two-factor authentication on Acme?',
    answer:
      'Acme two-factor authentication is enabled from Settings → Security. We support TOTP apps and hardware security keys.',
  },
  {
    question: 'What is the Acme refund policy?',
    answer:
      'Acme refunds are issued within 30 days of purchase. Open a ticket from your order history page and an agent will respond within 24 hours.',
  },
  {
    question: 'How do I contact Acme support?',
    answer:
      'Acme support is reachable at support@acme.example.com or via live chat during business hours.',
  },
]

const FAQ_GLOBEX: FaqItem[] = [
  {
    question: 'What Globex products are available?',
    answer:
      'Globex offers three product lines: Globex Cloud (managed hosting), Globex Insights (analytics), and Globex Forge (developer tooling).',
  },
  {
    question: 'How is Globex Cloud billed?',
    answer:
      'Globex Cloud bills monthly based on metered compute and storage. Invoices are issued on the first of each month.',
  },
  {
    question: 'Does Globex offer enterprise support?',
    answer:
      'Yes, Globex Enterprise plans include 24/7 phone support, a dedicated technical account manager, and a 99.95% uptime SLA.',
  },
  {
    question: 'Where are Globex data centers located?',
    answer:
      'Globex operates data centers in Frankfurt, Singapore, and Virginia. Customers can pin workloads to a specific region.',
  },
]

const ACME_QUERY = 'How do I reset my password?'
const GLOBEX_QUERY = 'What Globex products are available?'

// ─── presentation helpers ────────────────────────────────────────────────────

function bar(sim: number, width = 40): string {
  const clamped = Math.max(0, Math.min(1, sim))
  const filled = Math.round(clamped * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${(clamped * 100).toFixed(1)}%`
}

function printSection(num: number, total: number, emoji: string, title: string): void {
  console.log(`${emoji} [${num}/${total}] ${title}`)
}

function printResult(label: string, ok: boolean, detail: string): void {
  const mark = ok ? '✓' : '✗'
  console.log(`   ${mark} ${label}${detail ? ` — ${detail}` : ''}`)
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

function faqToContent(item: FaqItem): string {
  return `Q: ${item.question}\nA: ${item.answer}`
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke-run (helpers are unused so far but file still executes)**

Run: `$env:OPENAI_API_KEY = "sk-dummy"; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: banner prints, exits 0.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo FAQ corpora and presentation helpers"
```

---

### Task 3: Setup step — pool, tenant ids, migration probe

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Add imports for db / postgres / crypto, plus a `main()` entry that performs the setup step and reports it**

Replace the existing module body **below the banner print block** with the following additions (the banner stays, the helpers stay; we just wrap orchestration in a `main()` and add imports up top):

At the very top of the file, add the imports:

```ts
import { createHash, randomUUID } from 'node:crypto'
import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import { createOpenAIEmbeddings, type EmbedResult } from '@seta/agent-embeddings'
import {
  findExistingHashes,
  insertChunks,
  searchChunks,
  type NewChunk,
  type SearchHit,
} from '@seta/agent-vector'
import postgres from 'postgres'
```

Then **at the very bottom of the file** (after the helper functions), add:

```ts
// ─── main ────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 10
const ACME = randomUUID()
const GLOBEX = randomUUID()
const ACME_SOURCE = randomUUID()
const GLOBEX_SOURCE = randomUUID()

const results: Array<{ name: string; ok: boolean; detail: string }> = []
function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail })
  printResult(name, ok, detail)
}

function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function runAs<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId }, fn)
}

const sql = createPool(databaseUrl)

try {
  // ── 1/10: setup ───────────────────────────────────────────────────────────
  printSection(1, TOTAL_STEPS, '⚙️ ', 'Setup — connect to Postgres and probe migration')
  try {
    await sql`SELECT 1 FROM agent_vector.chunks LIMIT 0`
    record('migrations present', true, `tenants Acme=${ACME.slice(0, 8)}… Globex=${GLOBEX.slice(0, 8)}…`)
  } catch (err) {
    record('migrations present', false, `run pnpm migrate; underlying: ${(err as Error).message}`)
    throw err
  }
  console.log()
} finally {
  await sql.end({ timeout: 2 })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS. (Note: `EmbedResult`, `SearchHit`, `findExistingHashes`, `insertChunks`, `searchChunks`, `NewChunk`, `withTenant`, `EmbedResult` imports are not yet used; TypeScript flags unused imports only as warnings under the repo config — confirm via the run. If `verbatimModuleSyntax` errors fire on unused type imports, that's expected and resolved in later tasks where the symbols get used. If a hard error blocks compilation, temporarily mark unused names with `void` lines, e.g. `void insertChunks; void findExistingHashes;` and remove the voids as the symbols come into use in Tasks 4–8.)

- [ ] **Step 3: Manual run against local DB**

Prereqs: `pnpm db:up` and `pnpm migrate` already ran.
Run: `$env:OPENAI_API_KEY = "sk-dummy"; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: banner prints, `⚙️  [1/10] Setup — connect to Postgres and probe migration` and `✓ migrations present — tenants Acme=xxxxxxxx… Globex=xxxxxxxx…`, exits 0.

- [ ] **Step 4: Negative migration probe**

Stop Postgres or rename schema to confirm error path: skip in normal flow, but document.
Optional sanity: change the probe query to `SELECT 1 FROM agent_vector.does_not_exist LIMIT 0` temporarily, re-run, observe the `✗ migrations present — run pnpm migrate; underlying: relation "agent_vector.does_not_exist" does not exist` message, then revert.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo setup step (pool + tenant ids + migration probe)"
```

---

### Task 4: Embed step

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Add the embed step inside `main()` after step 1**

Inside the existing `try { ... }` block, immediately after the `console.log()` that follows step 1, append:

```ts
  // ── 2/10: embed FAQ corpora ───────────────────────────────────────────────
  printSection(2, TOTAL_STEPS, '📥', 'Embed FAQ corpora via OpenAI text-embedding-3-small')
  const embeddings = createOpenAIEmbeddings({ apiKey })

  const acmeContents = FAQ_ACME.map(faqToContent)
  const globexContents = FAQ_GLOBEX.map(faqToContent)

  const t0 = Date.now()
  const [acmeEmbed, globexEmbed]: [EmbedResult, EmbedResult] = await Promise.all([
    embeddings.embed(acmeContents),
    embeddings.embed(globexContents),
  ])
  const elapsed = Date.now() - t0

  record(
    'embedded',
    acmeEmbed.embeddings.length === FAQ_ACME.length &&
      globexEmbed.embeddings.length === FAQ_GLOBEX.length,
    `${FAQ_ACME.length + FAQ_GLOBEX.length} vectors · ${acmeEmbed.embeddings[0]?.length}d · ` +
      `${acmeEmbed.usage.totalTokens + globexEmbed.usage.totalTokens} tokens · ${elapsed} ms`,
  )
  console.log()
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Manual run with real API key**

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts` (real key)
Expected: step 1 passes; step 2 prints `✓ embedded — 8 vectors · 1536d · NNN tokens · NNN ms`.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo embed step (OpenAI text-embedding-3-small)"
```

---

### Task 5: Ingest steps (Acme + Globex)

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Add a helper that builds `NewChunk[]` rows from a corpus, then add steps 3 and 4**

After the existing helpers section (above `// ─── main ───`), add:

```ts
function buildChunks(
  tenantId: string,
  sourceId: string,
  contents: string[],
  vectors: number[][],
  totalTokens: number,
): NewChunk[] {
  // OpenAI's embeddings API returns one totalTokens count for the whole
  // batch, not per-row. Distribute roughly so each row has a non-zero
  // token_count for the demo (the field is metadata; search ignores it).
  const perRow = Math.max(1, Math.round(totalTokens / contents.length))
  return contents.map((content, i) => ({
    tenantId,
    sourceId,
    content,
    contentHash: hashContent(content),
    tokenCount: perRow,
    embedding: vectors[i]!,
  }))
}
```

Then inside `main()`, append after step 2:

```ts
  // ── 3/10: ingest as Acme ──────────────────────────────────────────────────
  printSection(3, TOTAL_STEPS, '📦', 'Ingest 4 FAQ chunks as tenant Acme')
  const acmeRows = buildChunks(
    ACME,
    ACME_SOURCE,
    acmeContents,
    acmeEmbed.embeddings,
    acmeEmbed.usage.totalTokens,
  )
  await runAs(ACME, () => insertChunks(sql, acmeRows))
  record('inserted Acme', true, `${acmeRows.length} rows`)
  console.log()

  // ── 4/10: ingest as Globex ────────────────────────────────────────────────
  printSection(4, TOTAL_STEPS, '📦', 'Ingest 4 FAQ chunks as tenant Globex')
  const globexRows = buildChunks(
    GLOBEX,
    GLOBEX_SOURCE,
    globexContents,
    globexEmbed.embeddings,
    globexEmbed.usage.totalTokens,
  )
  await runAs(GLOBEX, () => insertChunks(sql, globexRows))
  record('inserted Globex', true, `${globexRows.length} rows`)
  console.log()
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Manual run**

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: steps 1–4 all print `✓`, the script exits 0 after step 4 (cleanup not yet implemented — rows will remain in DB for this test only).

- [ ] **Step 4: Verify rows exist via psql (sanity check)**

Run: `psql "$databaseUrl" -c "SELECT tenant_id, count(*) FROM agent_vector.chunks GROUP BY tenant_id"` (or equivalent through your DB tool).
Expected: two rows, each with `count = 4`.
Manual cleanup before next iteration: `psql "$databaseUrl" -c "DELETE FROM agent_vector.chunks WHERE tenant_id IN ('$ACME', '$GLOBEX')"` — OR just let Task 9 handle it once cleanup is wired.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo ingest steps for Acme and Globex"
```

---

### Task 6: Dedup step

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Append the dedup step after step 4 inside `main()`**

```ts
  // ── 5/10: dedup — re-ingest same rows; expect 0 new ───────────────────────
  printSection(5, TOTAL_STEPS, '🔁', 'Re-ingest Acme corpus — content_hash dedup')
  const acmeHashes = acmeRows.map((r) => r.contentHash)
  const existing = await runAs(ACME, () =>
    findExistingHashes(sql, ACME_SOURCE, acmeHashes),
  )
  record(
    'findExistingHashes',
    existing.size === acmeHashes.length,
    `${existing.size}/${acmeHashes.length} hashes found`,
  )

  const countBefore = await runAs(ACME, () =>
    withTenant(sql, ACME, async (tx) => {
      const rows = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM agent_vector.chunks WHERE tenant_id = ${ACME}
      `
      return Number(rows[0]?.n ?? 0)
    }),
  )
  await runAs(ACME, () => insertChunks(sql, acmeRows))
  const countAfter = await runAs(ACME, () =>
    withTenant(sql, ACME, async (tx) => {
      const rows = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM agent_vector.chunks WHERE tenant_id = ${ACME}
      `
      return Number(rows[0]?.n ?? 0)
    }),
  )
  record(
    'insertChunks (retry)',
    countAfter === countBefore,
    `${countAfter - countBefore} new rows (ON CONFLICT DO NOTHING)`,
  )
  console.log()
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Manual run**

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: step 5 prints `✓ findExistingHashes — 4/4 hashes found` and `✓ insertChunks (retry) — 0 new rows (ON CONFLICT DO NOTHING)`.

- [ ] **Step 4: Cleanup leftover rows from this iteration**

The random per-run tenant UUIDs mean each iteration leaves 4+4 rows behind until Task 9 cleanup is wired. After this iteration, the test rows are orphaned with no app referencing them. Verify they do not accumulate problematically; cleanup will land in Task 9.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo dedup step (findExistingHashes + retry insert)"
```

---

### Task 7: Search as Acme

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Append the Acme search step**

```ts
  // ── 6/10: search as Acme ─────────────────────────────────────────────────
  printSection(6, TOTAL_STEPS, '🔍', `Search as Acme: "${ACME_QUERY}"`)
  const acmeQueryEmbed = await embeddings.embed([ACME_QUERY])
  const acmeQueryVec = acmeQueryEmbed.embeddings[0]!
  const acmeHits: SearchHit[] = await runAs(ACME, () =>
    searchChunks(sql, acmeQueryVec, { k: 3 }),
  )
  for (let i = 0; i < acmeHits.length; i++) {
    const h = acmeHits[i]!
    console.log(`   ${i + 1}.  ${bar(h.similarity)}  "${truncate(h.content.replace(/\n/g, ' '), 60)}"`)
  }
  const acmeIds = new Set(acmeHits.map((h) => h.id))
  record(
    'search Acme',
    acmeHits.length >= 1 && (acmeHits[0]?.similarity ?? 0) >= 0.3,
    `${acmeHits.length} hits · top similarity ${((acmeHits[0]?.similarity ?? 0) * 100).toFixed(1)}%`,
  )
  console.log()
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Manual run**

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: step 6 prints three numbered bars with descending similarity, top hit should be the Acme password-reset FAQ at >50% similarity, and `✓ search Acme — 3 hits · top similarity XX.X%`.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo Acme search step with similarity bars"
```

---

### Task 8: Cross-tenant isolation + Globex search

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Append steps 7 and 8**

```ts
  // ── 7/10: cross-tenant isolation ─────────────────────────────────────────
  printSection(7, TOTAL_STEPS, '🛡️ ', "Cross-tenant: Acme's question, but tenant = Globex")
  const crossHits = await runAs(GLOBEX, () =>
    searchChunks(sql, acmeQueryVec, { k: 3, minSim: -1 }),
  )
  const leakedFromAcme = crossHits.filter((h) => acmeIds.has(h.id)).length
  record(
    'RLS isolation',
    leakedFromAcme === 0,
    `${crossHits.length} hits returned; ${leakedFromAcme} leaked from Acme`,
  )
  console.log()

  // ── 8/10: search as Globex ───────────────────────────────────────────────
  printSection(8, TOTAL_STEPS, '🔍', `Search as Globex: "${GLOBEX_QUERY}"`)
  const globexQueryEmbed = await embeddings.embed([GLOBEX_QUERY])
  const globexHits = await runAs(GLOBEX, () =>
    searchChunks(sql, globexQueryEmbed.embeddings[0]!, { k: 3 }),
  )
  const globexInsertIds = new Set(
    await runAs(GLOBEX, () =>
      withTenant(sql, GLOBEX, async (tx) => {
        const rows = await tx<{ id: string }[]>`
          SELECT id FROM agent_vector.chunks WHERE tenant_id = ${GLOBEX}
        `
        return rows.map((r) => r.id)
      }),
    ),
  )
  for (let i = 0; i < globexHits.length; i++) {
    const h = globexHits[i]!
    console.log(`   ${i + 1}.  ${bar(h.similarity)}  "${truncate(h.content.replace(/\n/g, ' '), 60)}"`)
  }
  const allGlobex = globexHits.every((h) => globexInsertIds.has(h.id))
  record(
    'search Globex',
    globexHits.length >= 1 && allGlobex,
    `${globexHits.length} hits · all owned by Globex: ${allGlobex}`,
  )
  console.log()
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Manual run**

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: step 7 prints `✓ RLS isolation — N hits returned; 0 leaked from Acme`. Step 8 prints three Globex hits and `✓ search Globex — 3 hits · all owned by Globex: true`.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo cross-tenant RLS isolation + Globex search"
```

---

### Task 9: Cleanup + summary

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts`

- [ ] **Step 1: Add cleanup and summary in the `finally` block, replacing the existing one**

Replace the existing `} finally { await sql.end({ timeout: 2 }) }` block at the bottom of the file with:

```ts
} finally {
  // ── 9/10: cleanup ────────────────────────────────────────────────────────
  printSection(9, TOTAL_STEPS, '🧹', 'Cleanup — delete demo rows as platform_admin')
  const adminUrl = databaseUrl.replace(
    /(postgres:\/\/)[^:]+:[^@]+@/,
    '$1platform_admin:dev_only_change_me@',
  )
  const admin = postgres(adminUrl, { max: 1, prepare: false })
  try {
    const deleted = await admin<{ count: string }[]>`
      WITH d AS (
        DELETE FROM agent_vector.chunks
        WHERE tenant_id = ANY(${[ACME, GLOBEX]}::uuid[])
        RETURNING 1
      )
      SELECT count(*)::text AS count FROM d
    `
    record('cleanup', true, `${deleted[0]?.count ?? 0} rows deleted`)
  } catch (err) {
    record('cleanup', false, (err as Error).message)
  } finally {
    await admin.end({ timeout: 2 })
  }
  await sql.end({ timeout: 2 })
  console.log()

  // ── 10/10: summary ───────────────────────────────────────────────────────
  printSection(10, TOTAL_STEPS, '📊', 'Summary')
  const passed = results.filter((r) => r.ok).length
  for (const r of results) {
    console.log(`   ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  console.log()
  console.log(`   ${passed}/${results.length} checks passed`)
  console.log()
  if (passed !== results.length) {
    process.exit(1)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 3: Final end-to-end run**

The `platform_admin` role with password `dev_only_change_me` is the local-dev convention (see `infra/postgres/init.sql:16` — `CREATE ROLE platform_admin WITH LOGIN BYPASSRLS PASSWORD 'dev_only_change_me'`).

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected:
- All 10 steps print
- Step 9 prints `✓ cleanup — 8 rows deleted`
- Step 10 prints a PASS/FAIL table with all 7 PASSes:
  - migrations present
  - embedded
  - inserted Acme
  - inserted Globex
  - findExistingHashes
  - insertChunks (retry)
  - search Acme
  - RLS isolation
  - search Globex
  - cleanup
- Final line: `10/10 checks passed`
- Exit code: 0

- [ ] **Step 4: Verify DB is clean after the run**

Run a count query: `psql "$databaseUrl" -c "SELECT count(*) FROM agent_vector.chunks WHERE tenant_id IN ('$ACME','$GLOBEX')"` (using the UUIDs printed in step 1).
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "feat(agent-vector): demo cleanup + PASS/FAIL summary"
```

---

### Task 10: Idempotency check + documentation

**Files:**
- Modify: `platform/agent/vector/scripts/demo.ts` (only if a re-run fails)

- [ ] **Step 1: Re-run the demo a second time**

Run: `$env:OPENAI_API_KEY = "sk-..."; pnpm exec tsx platform/agent/vector/scripts/demo.ts`
Expected: identical PASS/FAIL output to the first run, exit 0. Tenant UUIDs differ each run; this proves idempotency under random-UUID isolation.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS for the new file.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @seta/agent-vector typecheck`
Expected: PASS.

- [ ] **Step 4: Confirm no test or package.json changes leaked**

Run: `git status` and `git diff main -- platform/agent/vector/package.json`
Expected: only `scripts/demo.ts` (and the docs files from earlier brainstorming/plan tasks) appear; no `package.json` diff.

- [ ] **Step 5: Final commit if anything trailed (e.g. lint autofix)**

```bash
git add platform/agent/vector/scripts/demo.ts
git commit -m "chore(agent-vector): demo lint cleanup"
```

(Skip if `git status` is clean after step 4.)

---

## Verification checklist (end of plan)

- [ ] `pnpm --filter @seta/agent-vector typecheck` passes
- [ ] `pnpm lint` passes for the new file
- [ ] Manual run prints all 10 steps with 10/10 PASS, exit code 0
- [ ] Re-run produces a clean PASS again (idempotency)
- [ ] `SELECT count(*) FROM agent_vector.chunks WHERE tenant_id IN (<demo ids>)` returns 0 after each run
- [ ] No edits to `package.json`, source code under `src/`, migrations, or tests
