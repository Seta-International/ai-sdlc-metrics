import { createHash, randomUUID } from 'node:crypto'
import { createOpenAIEmbeddings, type EmbedResult } from '@seta/agent-embeddings'
import { insertChunks, type NewChunk } from '@seta/agent-vector'
import { createPool } from '@seta/db'
import { tenantContext } from '@seta/tenant'

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
} finally {
  await sql.end({ timeout: 2 })
}
