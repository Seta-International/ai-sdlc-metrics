/**
 * router-test-harness.ts — shared test-only infrastructure for the router integration
 * + property test suites (Plan 02 Task 12).
 *
 * DO NOT wire into DI. Import only from *.spec.ts files.
 *
 * Provides:
 *   - InMemoryAgentSessionStore  — Map-backed AgentSessionPort stub.
 *   - InMemoryNarrativeStore     — Map-backed NarrativeStore with correct wasAppended logic.
 *   - InMemoryAuditFacade        — array-backed KernelAuditFacade capture.
 *   - makeToolRegistry()         — builds a real ToolRegistry from a list of (name, permission) pairs.
 *   - makeSubAgentFixture()      — builds a ValidatedSubAgentConfig via defineSubAgent.
 *   - makeIntentFixture()        — builds an IntentDescriptor.
 *   - bootRegistries()           — boots SubAgentRegistry + IntentRegistry with fixtures.
 *   - buildRealOrchestrator()    — constructs a RouterSessionOrchestrator with REAL sub-components
 *                                  and caller-controlled LlmClient mock.
 */

import { vi } from 'vitest'
import * as z from 'zod'
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { metrics, trace, context } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { defineSubAgent } from '../../domain/services/sub-agent-factory'
import type { ValidatedSubAgentConfig } from '../../domain/services/sub-agent-factory'
import type { IntentDescriptor } from '../../domain/value-objects/intent-descriptor'
import type { AgentSessionEntry, AgentSessionPort } from '../../domain/ports/agent-session.port'
import type { NarrativeStore, NarrativeStoreEntry } from '../../domain/ports/narrative-store.port'
import { SubAgentRegistry } from '../../infrastructure/registry/sub-agent-registry'
import { IntentRegistry } from '../../infrastructure/registry/intents/intent-registry'
import { ToolRegistry } from '../../infrastructure/tool-registry/tool-registry'
import { PermissionNarrativeBuilder } from './permission-narrative-builder'
import { RouterPromptBuilder } from './router-prompt-builder'
import { SubAgentRetriever } from './sub-agent-retriever'
import { RouterDecisionParser } from './router-decision-parser'
import { RouterSessionOrchestrator } from './router-session-orchestrator'
import type { RouterPlan } from '../../domain/value-objects/router-plan-schema'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { __INTERNAL_resetInstruments } from '../../infrastructure/observability/gateway-metrics'

// ─── OTel providers ───────────────────────────────────────────────────────────
// These are created once at module load. Tests must call resetOtel() in beforeEach.

let _otelInitialised = false

export let spanExporter: InMemorySpanExporter
export let metricExporter: InMemoryMetricExporter
export let meterProvider: MeterProvider

/**
 * Initialise OTel providers. Call once at the top of the spec file (or in a
 * beforeAll). Safe to call multiple times — only runs the first time.
 */
export function initOtel(): void {
  if (_otelInitialised) return
  _otelInitialised = true

  spanExporter = new InMemorySpanExporter()
  const spanProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  })
  trace.setGlobalTracerProvider(spanProvider)

  const ctxMgr = new AsyncLocalStorageContextManager()
  ctxMgr.enable()
  context.setGlobalContextManager(ctxMgr)

  metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 100_000,
      }),
    ],
  })
  metrics.setGlobalMeterProvider(meterProvider)
}

/** Reset OTel span + metric exporters between tests. Also resets lazy instruments. */
export function resetOtel(): void {
  spanExporter?.reset()
  metricExporter?.reset()
  __INTERNAL_resetInstruments()
}

// ─── Metric helpers ────────────────────────────────────────────────────────────

export interface DataPoint {
  attributes: Record<string, unknown>
  value: number
}

export async function flushMetricPoints(metricName: string): Promise<DataPoint[]> {
  await meterProvider.forceFlush()
  const points: DataPoint[] = []
  for (const rm of metricExporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name === metricName) {
          for (const dp of metric.dataPoints) {
            points.push({
              attributes: dp.attributes as Record<string, unknown>,
              value:
                typeof dp.value === 'number' ? dp.value : ((dp.value as { sum?: number }).sum ?? 0),
            })
          }
        }
      }
    }
  }
  return points
}

// ─── InMemoryAgentSessionStore ────────────────────────────────────────────────

export class InMemoryAgentSessionStore implements AgentSessionPort {
  private readonly _sessions = new Map<string, AgentSessionEntry>()

  async findByConversation(opts: {
    tenantId: string
    userId: string
    conversationId: string
  }): Promise<AgentSessionEntry | null> {
    for (const session of this._sessions.values()) {
      if (
        session.tenantId === opts.tenantId &&
        session.userId === opts.userId &&
        session.conversationId === opts.conversationId &&
        session.endedAt === null
      ) {
        return session
      }
    }
    return null
  }

  async create(
    entry: Omit<AgentSessionEntry, 'startedAt' | 'endedAt'>,
  ): Promise<AgentSessionEntry> {
    const full: AgentSessionEntry = { ...entry, startedAt: new Date(), endedAt: null }
    this._sessions.set(entry.id, full)
    return full
  }

  async endSession(id: string): Promise<void> {
    const session = this._sessions.get(id)
    if (session) {
      this._sessions.set(id, { ...session, endedAt: new Date() })
    }
  }

  /** Test helper: returns all sessions as an array. */
  all(): AgentSessionEntry[] {
    return [...this._sessions.values()]
  }

  /** Test helper: clear all sessions. */
  clear(): void {
    this._sessions.clear()
  }
}

// ─── InMemoryNarrativeStore ────────────────────────────────────────────────────

/**
 * Map-backed NarrativeStore.
 * Primary key = contentHash (global, not per-tenant, matching production semantics).
 * First write: wasAppended=true. Subsequent writes with same hash: wasAppended=false.
 */
export class InMemoryNarrativeStore implements NarrativeStore {
  private readonly _entries = new Map<string, NarrativeStoreEntry>()

  async appendIfMissing(
    entry: Omit<NarrativeStoreEntry, 'firstSeenAt'> & { actorId: string },
  ): Promise<{ entry: NarrativeStoreEntry; wasAppended: boolean }> {
    const existing = this._entries.get(entry.contentHash)
    if (existing) {
      return { entry: existing, wasAppended: false }
    }
    const stored: NarrativeStoreEntry = {
      contentHash: entry.contentHash,
      tenantId: entry.tenantId,
      roleKey: entry.roleKey,
      content: entry.content,
      firstSeenAt: new Date(),
    }
    this._entries.set(entry.contentHash, stored)
    return { entry: stored, wasAppended: true }
  }

  async get(contentHash: string, tenantId: string): Promise<NarrativeStoreEntry | null> {
    const stored = this._entries.get(contentHash)
    if (!stored || stored.tenantId !== tenantId) return null
    return stored
  }

  /** Test helper: clear stored entries. */
  clear(): void {
    this._entries.clear()
  }
}

// ─── InMemoryAuditCapture ─────────────────────────────────────────────────────

export interface CapturedAuditEvent {
  tenantId: string
  actorId: string
  eventType: string
  module: string
  subjectId: string
  payload: unknown
}

/**
 * In-memory KernelAuditFacade that captures events for assertion.
 * Only implements `recordEvent` — the router only calls this method.
 */
export class InMemoryAuditCapture {
  private readonly _events: CapturedAuditEvent[] = []

  async recordEvent(data: CapturedAuditEvent): Promise<void> {
    this._events.push(data)
  }

  /** All captured events. */
  events(): readonly CapturedAuditEvent[] {
    return this._events
  }

  /** Filter by eventType. */
  ofType(eventType: string): CapturedAuditEvent[] {
    return this._events.filter((e) => e.eventType === eventType)
  }

  /** Clear all captured events. */
  clear(): void {
    this._events.splice(0, this._events.length)
  }
}

// ─── Tool registry helper ─────────────────────────────────────────────────────

/**
 * Builds a pre-loaded ToolRegistry from a list of (name, permission) pairs.
 * Uses ToolRegistry.loadFromRouter with a synthetic tRPC-like router shape.
 *
 * The minimal tRPC procedure shape needed by ToolRegistry.loadFromRouter:
 *   { _def: { type, meta: { permission, agent }, inputs } }
 */
export function makeToolRegistry(
  tools: ReadonlyArray<{ name: string; permission: string }>,
): ToolRegistry {
  const procedures: Record<string, unknown> = {}
  for (const t of tools) {
    procedures[t.name] = {
      _def: {
        type: 'query',
        meta: {
          permission: t.permission,
          agent: {
            whenToUse: 'When user needs this tool.',
            whenNotToUse: 'Do not use unnecessarily.',
            examples: [{ input: 'example input', callArgs: {} }],
          },
        },
        inputs: [z.object({})],
      },
    }
  }

  const fakeRouter = { _def: { procedures } }
  const registry = new ToolRegistry()
  registry.loadFromRouter(fakeRouter)
  return registry
}

// ─── Sub-agent fixture ────────────────────────────────────────────────────────

export function makeSubAgentFixture(opts: {
  key: string
  toolScope: string[]
  domain?: string
}): ValidatedSubAgentConfig {
  const domain = opts.domain ?? opts.key.split('.')[0]!
  return defineSubAgent({
    key: opts.key,
    domain,
    description: `Test sub-agent for ${opts.key}`,
    whenToUse: `Use when testing ${opts.key}`,
    promptTemplate: {
      body: `You are the ${opts.key} sub-agent.`,
      variables: z.object({}),
    },
    inputSchema: z.object({ utterance: z.string() }),
    outputSchema: z.object({ result: z.string() }),
    toolScope: opts.toolScope,
    budgets: { maxIterations: 4, wallclockMs: 15_000, costUsd: 0.02 },
    memoryScope: { reads: ['L1'], writes: ['L1'] },
    model: { provider: 'openai', model: 'gpt-4o' },
    source: 'code',
  })
}

// ─── Intent fixture ───────────────────────────────────────────────────────────

export function makeIntentFixture(
  slug: string,
  domain?: string,
  description?: string,
): IntentDescriptor {
  const d = domain ?? slug.split('.')[0]!
  return { slug, domain: d, description: description ?? `Test intent ${slug}` }
}

// ─── Registry boot helper ─────────────────────────────────────────────────────

export interface BootedRegistries {
  subAgentRegistry: SubAgentRegistry
  intentRegistry: IntentRegistry
  toolRegistry: ToolRegistry
}

/**
 * Boots SubAgentRegistry + IntentRegistry with fixture descriptors and a
 * minimal tool set derived from the sub-agents' toolScopes.
 */
export function bootRegistries(opts: {
  subAgents: ValidatedSubAgentConfig[]
  intents: IntentDescriptor[]
  extraTools?: ReadonlyArray<{ name: string; permission: string }>
}): BootedRegistries {
  const { subAgents, intents, extraTools = [] } = opts

  // Derive tool names from sub-agent toolScopes, mapping name → permission
  const toolMap = new Map<string, string>()
  for (const sa of subAgents) {
    for (const toolName of sa.toolScope) {
      // Convert 'planner.personal.listTasks' → 'planner:personal:listTasks' as permission
      if (!toolMap.has(toolName)) {
        toolMap.set(toolName, toolName.replace(/\./g, ':'))
      }
    }
  }
  for (const t of extraTools) {
    toolMap.set(t.name, t.permission)
  }

  const toolRegistry = makeToolRegistry(
    [...toolMap.entries()].map(([name, permission]) => ({ name, permission })),
  )

  const subAgentRegistry = new SubAgentRegistry()
  subAgentRegistry.boot(subAgents, toolRegistry)

  const intentRegistry = new IntentRegistry()
  intentRegistry.boot(intents)

  return { subAgentRegistry, intentRegistry, toolRegistry }
}

// ─── KernelQueryFacade stub ───────────────────────────────────────────────────

export function makeKernelQueryFacade(opts: {
  permissionsByRole: Record<string, string[]>
}): KernelQueryFacade {
  return {
    getRolePermissions: vi.fn().mockImplementation(async (roleKey: string) => {
      const perms = opts.permissionsByRole[roleKey] ?? []
      return { permissions: perms.map((p) => ({ permissionKey: p, isLocked: false, module: '' })) }
    }),
  } as unknown as KernelQueryFacade
}

// ─── Orchestrator builder ─────────────────────────────────────────────────────

export type RouterLlmResult =
  | {
      kind: 'ok'
      plan: RouterPlan
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    }
  | { kind: 'malformed'; error: Error; rawText: null }

const DEFAULT_TEST_USAGE = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }

/**
 * Constructs a RouterSessionOrchestrator with REAL sub-components:
 *   - REAL SubAgentRegistry (already booted)
 *   - REAL IntentRegistry (already booted)
 *   - REAL RouterPromptBuilder
 *   - REAL RouterDecisionParser (with both registries)
 *   - REAL SubAgentRetriever
 *   - REAL PermissionNarrativeBuilder (with mocked KernelQueryFacade + in-memory NarrativeStore)
 *
 * Mocked:
 *   - RouterLlmClient (caller supplies scripted results)
 *   - AgentSessionPort (InMemoryAgentSessionStore)
 *   - KernelAuditFacade (InMemoryAuditCapture)
 */
export function buildRealOrchestrator(opts: {
  registries: BootedRegistries
  llmResults: RouterLlmResult[]
  sessionStore?: InMemoryAgentSessionStore
  auditCapture?: InMemoryAuditCapture
  narrativeStore?: InMemoryNarrativeStore
  permissionsByRole?: Record<string, string[]>
}): {
  orchestrator: RouterSessionOrchestrator
  sessionStore: InMemoryAgentSessionStore
  auditCapture: InMemoryAuditCapture
  narrativeStore: InMemoryNarrativeStore
} {
  const {
    registries,
    llmResults,
    sessionStore = new InMemoryAgentSessionStore(),
    auditCapture = new InMemoryAuditCapture(),
    narrativeStore = new InMemoryNarrativeStore(),
    permissionsByRole = {},
  } = opts

  const kernelQuery = makeKernelQueryFacade({ permissionsByRole })
  const permissionNarrativeBuilder = new PermissionNarrativeBuilder(kernelQuery, narrativeStore)

  const routerPromptBuilder = new RouterPromptBuilder()
  const subAgentRetriever = new SubAgentRetriever()
  const parser = new RouterDecisionParser(registries.intentRegistry, registries.subAgentRegistry)

  let callCount = 0
  const llmClient = {
    generate: vi.fn().mockImplementation(async () => {
      const result = llmResults[callCount] ?? llmResults[llmResults.length - 1]!
      callCount++
      // Ensure ok results always carry a usage object (RouterLlmClient contract)
      if (result.kind === 'ok' && !('usage' in result)) {
        return { ...result, usage: DEFAULT_TEST_USAGE }
      }
      return result
    }),
  }

  const orchestrator = new RouterSessionOrchestrator(
    sessionStore as AgentSessionPort,
    permissionNarrativeBuilder,
    registries.subAgentRegistry,
    routerPromptBuilder,
    subAgentRetriever,
    parser,
    llmClient as never,
    registries.toolRegistry,
    auditCapture as unknown as KernelAuditFacade,
  )

  return { orchestrator, sessionStore, auditCapture, narrativeStore }
}
