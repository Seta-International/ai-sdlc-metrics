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
