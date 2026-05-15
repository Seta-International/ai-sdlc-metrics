import { createHash, randomUUID } from 'node:crypto'
import { createOpenAIEmbeddings, type EmbedResult } from '@seta/agent-embeddings'
import { createPool, withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenant'
import postgres from 'postgres'
import {
  findExistingHashes,
  insertChunks,
  type NewChunk,
  type SearchHit,
  searchChunks,
} from '../src/index.js'

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
  console.error('Usage: OPENAI_API_KEY=sk-... pnpm exec tsx platform/agent/vector/scripts/demo.ts')
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║         @seta/agent-vector  —  Live Demo                 ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')
console.log(`Database: ${databaseUrl.replace(/(:\/\/)([^:]+):[^@]+@/, '$1$2:***@')}`)
console.log()

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

function buildChunks(
  tenantId: string,
  sourceId: string,
  contents: string[],
  vectors: number[][],
  totalTokens: number,
): NewChunk[] {
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
    record(
      'migrations present',
      true,
      `tenants Acme=${ACME.slice(0, 8)}… Globex=${GLOBEX.slice(0, 8)}…`,
    )
  } catch (err) {
    record('migrations present', false, `run pnpm migrate; underlying: ${(err as Error).message}`)
    throw err
  }
  console.log()

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
    `${FAQ_ACME.length + FAQ_GLOBEX.length} vectors · ${acmeEmbed.embeddings[0]?.length}d · ${
      acmeEmbed.usage.totalTokens + globexEmbed.usage.totalTokens
    } tokens · ${elapsed} ms`,
  )
  console.log()

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

  // ── 5/10: dedup — re-ingest same rows; expect 0 new ───────────────────────
  printSection(5, TOTAL_STEPS, '🔁', 'Re-ingest Acme corpus — content_hash dedup')
  const acmeHashes = acmeRows.map((r) => r.contentHash)
  const existing = await runAs(ACME, () => findExistingHashes(sql, ACME_SOURCE, acmeHashes))
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

  // ── 6/10: search as Acme ─────────────────────────────────────────────────
  printSection(6, TOTAL_STEPS, '🔍', `Search as Acme: "${ACME_QUERY}"`)
  const acmeQueryEmbed = await embeddings.embed([ACME_QUERY])
  const acmeQueryVec = acmeQueryEmbed.embeddings[0]!
  const acmeHits: SearchHit[] = await runAs(ACME, () => searchChunks(sql, acmeQueryVec, { k: 3 }))
  for (let i = 0; i < acmeHits.length; i++) {
    const h = acmeHits[i]!
    console.log(
      `   ${i + 1}.  ${bar(h.similarity)}  "${truncate(h.content.replace(/\n/g, ' '), 60)}"`,
    )
  }
  const acmeIds = new Set(acmeHits.map((h) => h.id))
  record(
    'search Acme',
    acmeHits.length >= 1 && (acmeHits[0]?.similarity ?? 0) >= 0.3,
    `${acmeHits.length} hits · top similarity ${((acmeHits[0]?.similarity ?? 0) * 100).toFixed(1)}%`,
  )
  console.log()

  // ── 7/10: cross-tenant isolation ─────────────────────────────────────────
  printSection(7, TOTAL_STEPS, '🛡️ ', "Cross-tenant: Acme's question, but tenant = Globex")
  const crossHits = await runAs(GLOBEX, () => searchChunks(sql, acmeQueryVec, { k: 3, minSim: -1 }))
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
    console.log(
      `   ${i + 1}.  ${bar(h.similarity)}  "${truncate(h.content.replace(/\n/g, ' '), 60)}"`,
    )
  }
  const allGlobex = globexHits.every((h) => globexInsertIds.has(h.id))
  record(
    'search Globex',
    globexHits.length >= 1 && allGlobex,
    `${globexHits.length} hits · all owned by Globex: ${allGlobex}`,
  )
  console.log()
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
