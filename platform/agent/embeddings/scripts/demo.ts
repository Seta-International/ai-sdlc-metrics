/**
 * Demo script — @seta/agent-embeddings
 * Run: OPENAI_API_KEY=<key> pnpm exec tsx platform/agent/embeddings/scripts/demo.ts
 */
import { createOpenAIEmbeddings } from '../src/index.js'

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('ERROR: OPENAI_API_KEY is not set.')
  console.error(
    'Usage: OPENAI_API_KEY=sk-... pnpm exec tsx platform/agent/embeddings/scripts/demo.ts',
  )
  process.exit(1)
}

// ─── sample inputs ───────────────────────────────────────────────────────────

const INPUTS = [
  'The cat sat on the mat.',
  'A feline rested on the rug.', // semantically similar to above
  'The stock market crashed yesterday.', // unrelated
]

// ─── cosine similarity helper ────────────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function fmt(n: number): string {
  return n.toFixed(6).padStart(10)
}

function bar(sim: number, width = 40): string {
  const filled = Math.round(sim * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${(sim * 100).toFixed(1)}%`
}

// ─── main ────────────────────────────────────────────────────────────────────

const client = createOpenAIEmbeddings({ apiKey })

console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║         @seta/agent-embeddings  —  Live Demo             ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')

console.log('📥 Input texts:')
for (let i = 0; i < INPUTS.length; i++) {
  console.log(`   [${i}] "${INPUTS[i]}"`)
}
console.log()

const start = Date.now()
const result = await client.embed(INPUTS)
const elapsed = Date.now() - start

// ─── dimensions ──────────────────────────────────────────────────────────────

console.log('📐 Embedding dimensions:')
console.log(`   Model       : text-embedding-3-small`)
console.log(`   Vectors     : ${result.embeddings.length}  (one per input)`)
console.log(`   Dimensions  : ${result.embeddings[0]?.length ?? 0}  floats per vector`)
console.log(`   Latency     : ${elapsed} ms`)
console.log()

// ─── sample values ───────────────────────────────────────────────────────────

console.log('🔢 First 8 float values of each vector:')
for (let i = 0; i < result.embeddings.length; i++) {
  const vec = result.embeddings[i] ?? []
  const preview = vec.slice(0, 8).map(fmt).join('  ')
  console.log(`   [${i}]  ${preview}  …`)
}
console.log()

// ─── usage ───────────────────────────────────────────────────────────────────

console.log('📊 Token usage:')
console.log(`   Prompt tokens : ${result.usage.promptTokens}`)
console.log(`   Total tokens  : ${result.usage.totalTokens}`)
console.log()

// ─── cosine similarity matrix ────────────────────────────────────────────────

console.log('🔍 Cosine similarity (semantic closeness):')
console.log('   1.0 = identical meaning   0.0 = unrelated\n')

for (let i = 0; i < INPUTS.length; i++) {
  for (let j = i + 1; j < INPUTS.length; j++) {
    const vi = result.embeddings[i] ?? []
    const vj = result.embeddings[j] ?? []
    const sim = cosineSim(vi, vj)
    console.log(`   [${i}] vs [${j}]  ${bar(sim)}`)
    console.log(`         "${(INPUTS[i] ?? '').slice(0, 45)}"`)
    console.log(`         "${(INPUTS[j] ?? '').slice(0, 45)}"`)
    console.log()
  }
}

console.log('✅ Done.\n')
