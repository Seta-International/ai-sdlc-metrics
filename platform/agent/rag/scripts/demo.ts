import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createOpenAIEmbeddings } from '@seta/agent-embeddings'
import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import postgres from 'postgres'
import { createAgentRag } from '../src/factory.js'

/**
 * Demo script — @seta/agent-rag
 *
 * Walks through the full `createAgentRag` surface: ingest, dedup,
 * retrieve (vector-only with RRF passthrough), and cross-tenant RLS
 * isolation. Self-cleaning.
 *
 * Prerequisites:
 *   pnpm db:up         (Postgres + pgvector running)
 *   pnpm migrate       (agent_vector schema applied)
 *   OPENAI_API_KEY=... in env or .env at repo root
 *
 * Run:
 *   pnpm exec tsx platform/agent/rag/scripts/demo.ts
 */

// Tiny .env loader — repo root only, KEY=VALUE per line, ignores blanks/comments.
try {
  const env = readFileSync(new URL('../../../../.env', import.meta.url), 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
} catch {
  // .env optional — fall through to process.env lookup
}

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('ERROR: OPENAI_API_KEY is not set (env or .env).')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'
const tenantUserUrl = databaseUrl.replace(
  /(postgres:\/\/)[^:]+:[^@]+@/,
  '$1tenant_user:dev_only_change_me@',
)

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║          @seta/agent-rag  —  Live Demo                   ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')
console.log(`Database: ${tenantUserUrl.replace(/(:\/\/)([^:]+):[^@]+@/, '$1$2:***@')}\n`)

interface FaqDoc {
  sourceId: string
  content: string
}

const ACME_DOCS: FaqDoc[] = [
  {
    sourceId: randomUUID(),
    content:
      'To reset your Acme password, visit acme.example.com/account, click "Forgot password", and follow the link sent to your registered email.',
  },
  {
    sourceId: randomUUID(),
    content:
      'Acme two-factor authentication is enabled from Settings → Security. We support TOTP apps and hardware security keys.',
  },
  {
    sourceId: randomUUID(),
    content:
      'Acme refunds are issued within 30 days of purchase. Open a ticket from your order history page and an agent will respond within 24 hours.',
  },
  {
    sourceId: randomUUID(),
    content:
      'Acme support is reachable at support@acme.example.com or via live chat during business hours.',
  },
]

const GLOBEX_DOCS: FaqDoc[] = [
  {
    sourceId: randomUUID(),
    content:
      'Globex offers three product lines: Globex Cloud (managed hosting), Globex Insights (analytics), and Globex Forge (developer tooling).',
  },
  {
    sourceId: randomUUID(),
    content:
      'Globex Cloud bills monthly based on metered compute and storage. Invoices are issued on the first of each month.',
  },
]

const ACME_QUERY = 'How do I reset my password?'
const GLOBEX_QUERY = 'What Globex products are available?'

function bar(score: number, width = 30): string {
  const clamped = Math.max(0, Math.min(1, score))
  const filled = Math.round(clamped * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${(clamped * 100).toFixed(1)}%`
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

function printSection(num: number, total: number, emoji: string, title: string): void {
  console.log(`${emoji} [${num}/${total}] ${title}`)
}

const results: Array<{ name: string; ok: boolean; detail: string }> = []
function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail })
  const mark = ok ? '✓' : '✗'
  console.log(`   ${mark} ${name}${detail ? ` — ${detail}` : ''}`)
}

const TOTAL = 9
const ACME = randomUUID()
const GLOBEX = randomUUID()

const sql = createPool(tenantUserUrl)
const embeddings = createOpenAIEmbeddings({ apiKey })
const rag = createAgentRag({ sql, embeddings })

async function runAs<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId }, fn)
}

async function countRows(tenantId: string): Promise<number> {
  return runAs(tenantId, () =>
    withTenant(sql, tenantId, async (tx) => {
      const rows = await tx<{ n: string }[]>`
        SELECT count(*)::text AS n FROM agent_vector.chunks WHERE tenant_id = ${tenantId}
      `
      return Number(rows[0]?.n ?? 0)
    }),
  )
}

try {
  // 1/9 — setup
  printSection(1, TOTAL, '⚙️ ', 'Setup — probe pgvector + migrations')
  try {
    await sql`SELECT 1 FROM agent_vector.chunks LIMIT 0`
    record('migrations present', true, `Acme=${ACME.slice(0, 8)}… Globex=${GLOBEX.slice(0, 8)}…`)
  } catch (err) {
    record('migrations present', false, `run pnpm migrate — ${(err as Error).message}`)
    throw err
  }
  console.log()

  // 2/9 — ingest Acme
  printSection(2, TOTAL, '📦', `Ingest ${ACME_DOCS.length} docs as tenant Acme`)
  const t0 = Date.now()
  for (const doc of ACME_DOCS) {
    await runAs(ACME, () => rag.ingest(doc.sourceId, doc.content))
  }
  const acmeCount = await countRows(ACME)
  record(
    'rag.ingest (Acme)',
    acmeCount >= ACME_DOCS.length,
    `${acmeCount} rows in agent_vector.chunks · ${Date.now() - t0} ms total`,
  )
  console.log()

  // 3/9 — re-ingest dedup
  printSection(3, TOTAL, '🔁', 'Re-ingest Acme corpus — content_hash dedup')
  const before = await countRows(ACME)
  for (const doc of ACME_DOCS) {
    await runAs(ACME, () => rag.ingest(doc.sourceId, doc.content))
  }
  const after = await countRows(ACME)
  record(
    'rag.ingest (dedup)',
    after === before,
    `${after - before} new rows · ${ACME_DOCS.length} embed calls skipped`,
  )
  console.log()

  // 4/9 — ingest Globex
  printSection(4, TOTAL, '📦', `Ingest ${GLOBEX_DOCS.length} docs as tenant Globex`)
  for (const doc of GLOBEX_DOCS) {
    await runAs(GLOBEX, () => rag.ingest(doc.sourceId, doc.content))
  }
  const globexCount = await countRows(GLOBEX)
  record('rag.ingest (Globex)', globexCount >= GLOBEX_DOCS.length, `${globexCount} rows`)
  console.log()

  // 5/9 — retrieve Acme
  printSection(5, TOTAL, '🔍', `rag.retrieve as Acme: "${ACME_QUERY}"`)
  const acmeHits = await runAs(ACME, () => rag.retrieve(ACME_QUERY, { k: 3 }))
  for (let i = 0; i < acmeHits.length; i++) {
    const h = acmeHits[i]!
    const sim = h.vectorSimilarity ?? 0
    const span = h.citation.span
      ? `[${h.citation.span.startChar}–${h.citation.span.endChar}]`
      : '[no span]'
    console.log(`   ${i + 1}. rank=${h.vectorRank} rrf=${h.rrfScore.toFixed(5)} ${span}`)
    console.log(`       ${bar(sim)}  "${truncate(h.content, 60)}"`)
  }
  record(
    'rag.retrieve (Acme)',
    acmeHits.length >= 1 &&
      (acmeHits[0]?.content.toLowerCase().includes('password') ?? false) &&
      acmeHits[0]?.citation.span !== null,
    `${acmeHits.length} hits · top-1 contains "password" · citation span present`,
  )
  console.log()

  // 6/9 — cross-tenant RLS isolation
  printSection(6, TOTAL, '🛡️ ', `Cross-tenant: Acme's query, but tenant = Globex`)
  const crossHits = await runAs(GLOBEX, () => rag.retrieve(ACME_QUERY, { k: 3, minSim: -1 }))
  const acmeIds = new Set(acmeHits.map((h) => h.chunkId))
  const leaked = crossHits.filter((h) => acmeIds.has(h.chunkId)).length
  record(
    'RLS isolation',
    leaked === 0,
    `${crossHits.length} hits returned; ${leaked} leaked from Acme`,
  )
  console.log()

  // 7/9 — retrieve Globex
  printSection(7, TOTAL, '🔍', `rag.retrieve as Globex: "${GLOBEX_QUERY}"`)
  const globexHits = await runAs(GLOBEX, () => rag.retrieve(GLOBEX_QUERY, { k: 3 }))
  for (let i = 0; i < globexHits.length; i++) {
    const h = globexHits[i]!
    const sim = h.vectorSimilarity ?? 0
    console.log(`   ${i + 1}. rank=${h.vectorRank} rrf=${h.rrfScore.toFixed(5)}`)
    console.log(`       ${bar(sim)}  "${truncate(h.content, 60)}"`)
  }
  const allOwned = globexHits.every((h) => !acmeIds.has(h.chunkId))
  record(
    'rag.retrieve (Globex)',
    globexHits.length >= 1 && allOwned,
    `${globexHits.length} hits · all owned by Globex`,
  )
  console.log()
} finally {
  // 8/9 — cleanup
  printSection(8, TOTAL, '🧹', 'Cleanup — delete demo rows as platform_admin')
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

  // 9/9 — summary
  printSection(9, TOTAL, '📊', 'Summary')
  const passed = results.filter((r) => r.ok).length
  for (const r of results) {
    console.log(`   ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  console.log()
  console.log(`   ${passed}/${results.length} checks passed\n`)
  if (passed !== results.length) process.exit(1)
}
