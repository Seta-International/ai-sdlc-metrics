/**
 * EI-5 — Tool Retrieval 12-sub-agent × ≥20 tools synthetic probe (Plan 02.5 R-02.5.10).
 *
 * Validates that ToolRetriever achieves 100% recall on a realistic-scale fixture:
 *   - 12 domain sub-agents, each with ≥ 20 tools in scope (240+ tools total)
 *   - 1 golden trace per domain (12 traces total)
 *   - Embedding provider is mocked — each tool has a seeded deterministic vector
 *   - Directives are designed so that expected tools have the highest cosine similarity
 *
 * Vector design:
 *   - 12-dimensional vectors (one dimension per domain)
 *   - Each domain's tools have a strong signal in their domain's dimension: 0.9
 *   - Non-domain tools have a weak signal: 0.1 / (12 - 1) ≈ 0.091
 *   - The directive for domain D has value 1.0 in dimension D and 0.0 elsewhere
 *   - This guarantees domain D's tools rank highest for domain D's directive
 *
 * CI contract (R-02.5.10):
 *   Hard-fail on recall < 1.0. The probe is intentionally strict — if embedding
 *   vector semantics are broken, this spec catches it immediately.
 *
 * IMPORTANT — test-only fixture:
 *   The 240 synthetic tools below do NOT appear in any production registry.
 *   They exist solely to stress the retrieval path at realistic scale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentToolDescriptor } from '../../../../common/trpc/agent-tool-meta'
import type { SubAgentKey } from '../../domain/services/sub-agent-types'
import { ToolRetriever } from './tool-retriever'
import {
  RetrievalQualityScorer,
  type GoldenTrace,
} from '../../application/services/retrieval-quality-scorer'

// ─── Mock AI SDK and OTel ─────────────────────────────────────────────────────

const { mockEmbed, mockCreateOpenAI } = vi.hoisted(() => {
  const mockEmbed = vi.fn()
  const mockCreateOpenAI = vi.fn(() => ({
    embedding: vi.fn(() => 'mock-embedding-model'),
  }))
  return { mockEmbed, mockCreateOpenAI }
})

vi.mock('ai', () => ({ embed: mockEmbed }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }))
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => ({ setAttributes: vi.fn(), end: vi.fn() })),
    })),
  },
}))

vi.stubEnv('OPENAI_API_KEY', 'test-key-ei5')

// ─── Domains ─────────────────────────────────────────────────────────────────

const DOMAINS = [
  'planner',
  'people',
  'time',
  'hiring',
  'performance',
  'projects',
  'finance',
  'goals',
  'identity',
  'admin',
  'insights',
  'kernel',
] as const

type Domain = (typeof DOMAINS)[number]

const DIM = DOMAINS.length // 12

// ─── Vector design ────────────────────────────────────────────────────────────
//
// Domain index D gets a unit vector with 0.9 in position D and 0.1/(DIM-1)
// spread equally across all other positions. Directive for domain D is a pure
// unit vector with 1.0 in position D.
//
// Result: cos(directive_D, tool_D) > cos(directive_D, tool_X) for any X ≠ D
// because dot(e_D, domain_D_vec) = 0.9 > 0.1/(DIM-1) ≈ 0.009.

function domainVec(domainIdx: number): number[] {
  const v = Array(DIM).fill(0.1 / (DIM - 1)) as number[]
  v[domainIdx] = 0.9
  return v
}

function directiveVec(domainIdx: number): number[] {
  const v = Array(DIM).fill(0) as number[]
  v[domainIdx] = 1.0
  return v
}

// ─── Fixture builder ─────────────────────────────────────────────────────────

/**
 * Generate 20 synthetic tool descriptors for a given domain.
 * Tool names follow the pattern `<domain>.<verb><n>` (e.g. `planner.list1`).
 */
function buildDomainTools(domain: Domain, count = 20): AgentToolDescriptor[] {
  const verbs = [
    'list',
    'get',
    'create',
    'update',
    'delete',
    'search',
    'filter',
    'export',
    'import',
    'archive',
    'restore',
    'approve',
    'reject',
    'submit',
    'cancel',
    'assign',
    'unassign',
    'notify',
    'summarize',
    'validate',
  ]
  return verbs.slice(0, count).map((verb) => ({
    name: `${domain}.${verb}`,
    procedure: 'query' as const,
    permission: `${domain}:${verb}:read`,
    inputSchema: undefined,
    outputSchema: undefined,
    meta: {
      whenToUse: `Use when the user needs to ${verb} ${domain} data`,
      whenNotToUse: `Do not use for non-${domain} operations`,
      examples: [{ input: `${verb} ${domain} item`, callArgs: {} }],
    },
  }))
}

// Build all tools and record which domain each tool belongs to
const DOMAIN_TOOLS = new Map<Domain, AgentToolDescriptor[]>(
  DOMAINS.map((d) => [d, buildDomainTools(d, 20)]),
)

// Flat list of all 240 tools
const ALL_TOOLS: AgentToolDescriptor[] = DOMAINS.flatMap((d) => DOMAIN_TOOLS.get(d)!)

// In-memory embedding index: each tool gets its domain's vector
const EMBEDDING_INDEX = new Map<string, number[]>(
  DOMAINS.flatMap((domain, domainIdx) =>
    DOMAIN_TOOLS.get(domain)!.map((tool) => [tool.name, domainVec(domainIdx)]),
  ),
)

// ─── Golden trace set ─────────────────────────────────────────────────────────
//
// One trace per domain. The directive embedding (returned by mock embed) is the
// pure unit vector for that domain, which maximises cosine similarity with all
// 20 of that domain's tools over all other domains' tools.
//
// topK = 5 (< 20 per domain, < 240 total) — strict test; the top 5 must ALL
// be from the correct domain, proving selectivity at scale.

interface Ei5Trace extends GoldenTrace {
  readonly directiveEmbedding: number[]
}

const GOLDEN_TRACES: ReadonlyArray<Ei5Trace> = DOMAINS.map((domain, domainIdx) => {
  const tools = DOMAIN_TOOLS.get(domain)!
  // Expected: first 5 tools of the domain (arbitrary; cosine is equal for all domain tools)
  const expectedToolNames = tools.slice(0, 5).map((t) => t.name)

  return {
    traceId: `ei5.${domain}`,
    directive: {
      goal: `Perform ${domain} operations`,
      constraints: [`${domain}-only`],
    },
    toolScope: ALL_TOOLS, // all 240 tools in scope — realistic wide scope
    coreTools: [],
    topK: 5,
    expectedToolNames,
    directiveEmbedding: directiveVec(domainIdx),
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSubAgentKey(key: string): SubAgentKey {
  return key as SubAgentKey
}

function makeEmbedderMock() {
  return {
    getEmbedding: (toolName: string) => EMBEDDING_INDEX.get(toolName),
  }
}

// ─── EI-5 probe tests ─────────────────────────────────────────────────────────

describe('EI-5 tool retrieval probe — 12-domain × 20 tools (R-02.5.10)', () => {
  let retriever: ToolRetriever

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateOpenAI.mockReturnValue({
      embedding: vi.fn(() => 'mock-embedding-model'),
    })
    retriever = new ToolRetriever(makeEmbedderMock() as never)
    retriever.onModuleInit()
  })

  // ── Fixture integrity checks ───────────────────────────────────────────────

  it('fixture: 12 domains registered', () => {
    expect(DOMAINS).toHaveLength(12)
  })

  it('fixture: each domain has exactly 20 tools', () => {
    for (const domain of DOMAINS) {
      expect(DOMAIN_TOOLS.get(domain)!).toHaveLength(20)
    }
  })

  it('fixture: total tool count is 240', () => {
    expect(ALL_TOOLS).toHaveLength(240)
  })

  it('fixture: all tool names are unique', () => {
    const names = ALL_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(240)
  })

  it('fixture: 12 golden traces — one per domain', () => {
    expect(GOLDEN_TRACES).toHaveLength(12)
  })

  it('fixture: each golden trace expects 5 tools', () => {
    for (const trace of GOLDEN_TRACES) {
      expect(trace.expectedToolNames).toHaveLength(5)
    }
  })

  // ── Per-domain retrieval tests ────────────────────────────────────────────
  //
  // One test per domain. CI hard-fails if any selected tool does not belong
  // to the correct domain. Asserts domain membership rather than a fixed slice
  // because all 20 domain tools have equal cosine similarity to the directive
  // and any 5 of them are a valid top-5 result.

  for (const trace of GOLDEN_TRACES) {
    it(`top-5 all belong to domain — ${trace.traceId} over 240 tools`, async () => {
      mockEmbed.mockResolvedValueOnce({ embedding: trace.directiveEmbedding })

      const result = await retriever.retrieve({
        subAgentKey: makeSubAgentKey(`${trace.traceId}.agent`),
        directive: trace.directive,
        toolScope: trace.toolScope,
        coreTools: trace.coreTools,
        topK: trace.topK,
      })

      const domain = trace.traceId.replace('ei5.', '')
      expect(result.fallbackFired).toBe(false)
      expect(result.selected).toHaveLength(trace.topK)
      for (const tool of result.selected) {
        expect(
          tool.name.startsWith(`${domain}.`),
          `expected tool "${tool.name}" to belong to domain "${domain}"`,
        ).toBe(true)
      }
    })
  }

  // ── RetrievalQualityScorer integration check ───────────────────────────────
  //
  // Runs all 12 traces through the scorer; asserts aggregate recall = 1.0.
  // This validates the scorer↔retriever integration at EI-5 scale.

  it('RetrievalQualityScorer: aggregate recall = 1.0 across all 12 EI-5 traces', async () => {
    // Queue all 12 directive embeddings in order
    for (const trace of GOLDEN_TRACES) {
      mockEmbed.mockResolvedValueOnce({ embedding: trace.directiveEmbedding })
    }

    const scorer = new RetrievalQualityScorer(retriever)
    const result = await scorer.score(makeSubAgentKey('ei5.aggregate'), GOLDEN_TRACES)

    expect(result.recall).toBe(1.0)
    expect(Object.keys(result.perTraceRecall)).toHaveLength(12)

    for (const [traceId, traceRecall] of Object.entries(result.perTraceRecall)) {
      expect(traceRecall, `recall for ${traceId}`).toBe(1.0)
    }
  })

  // ── Selectivity check ─────────────────────────────────────────────────────
  //
  // All 5 selected tools for each domain must belong to that domain.
  // This proves the retriever is selective — it doesn't bleed across domains.

  it('selectivity: all top-5 tools selected for each domain belong to that domain', async () => {
    for (const trace of GOLDEN_TRACES) {
      mockEmbed.mockResolvedValueOnce({ embedding: trace.directiveEmbedding })

      const result = await retriever.retrieve({
        subAgentKey: makeSubAgentKey(`${trace.traceId}.selectivity`),
        directive: trace.directive,
        toolScope: trace.toolScope,
        coreTools: trace.coreTools,
        topK: trace.topK,
      })

      const domain = trace.traceId.replace('ei5.', '')
      for (const tool of result.selected) {
        expect(
          tool.name.startsWith(`${domain}.`),
          `tool ${tool.name} should be in domain ${domain}`,
        ).toBe(true)
      }
    }
  })

  // ── Determinism check ────────────────────────────────────────────────────

  it('determinism: same domain directive produces identical top-5 across 3 runs', async () => {
    const trace = GOLDEN_TRACES[0]! // planner domain

    for (let i = 0; i < 3; i++) {
      mockEmbed.mockResolvedValueOnce({ embedding: trace.directiveEmbedding })
    }

    const results = await Promise.all([
      retriever.retrieve({
        subAgentKey: makeSubAgentKey('ei5.determinism.1'),
        directive: trace.directive,
        toolScope: trace.toolScope,
        coreTools: [],
        topK: 5,
      }),
      retriever.retrieve({
        subAgentKey: makeSubAgentKey('ei5.determinism.2'),
        directive: trace.directive,
        toolScope: trace.toolScope,
        coreTools: [],
        topK: 5,
      }),
      retriever.retrieve({
        subAgentKey: makeSubAgentKey('ei5.determinism.3'),
        directive: trace.directive,
        toolScope: trace.toolScope,
        coreTools: [],
        topK: 5,
      }),
    ])

    const firstNames = results[0]!.selected.map((t) => t.name)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.selected.map((t) => t.name)).toEqual(firstNames)
    }
  })
})
