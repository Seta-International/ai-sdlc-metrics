/**
 * permission-narrative-builder.spec.ts — Plan 02 Task 6 unit tests
 *
 * All nine cases from the task spec are covered.
 * No real DB or NestJS DI container — facades and the narrative store are
 * fully mocked via vi.fn().
 *
 * OTel metrics are wired with InMemoryMetricExporter (one-time registration per
 * process — same pattern as gateway-metrics.spec.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics'
import { metrics } from '@opentelemetry/api'
import { PermissionNarrativeBuilder } from './permission-narrative-builder'
import { __INTERNAL_resetInstruments } from '../../infrastructure/observability/gateway-metrics'
import type { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'
import type { NarrativeStore, NarrativeStoreEntry } from '../../domain/ports/narrative-store.port'
import { ALL_PERMISSION_KEYS } from '../../../../common/auth/permissions'

// ─── OTel one-time setup ──────────────────────────────────────────────────────
const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
const meterProvider = new MeterProvider({
  readers: [new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 100_000 })],
})
metrics.setGlobalMeterProvider(meterProvider)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function flushPoints(
  metricName: string,
): Promise<Array<{ attributes: Record<string, unknown>; value: number }>> {
  await meterProvider.forceFlush()
  const points: Array<{ attributes: Record<string, unknown>; value: number }> = []
  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name === metricName) {
          for (const dp of metric.dataPoints) {
            const raw = dp.value
            const value = typeof raw === 'number' ? raw : 0
            points.push({ attributes: dp.attributes as Record<string, unknown>, value })
          }
        }
      }
    }
  }
  return points
}

function makeEntry(overrides?: Partial<NarrativeStoreEntry>): NarrativeStoreEntry {
  return {
    contentHash: 'abc123hash',
    tenantId: TENANT_ID,
    roleKey: 'employee',
    content: 'Acting as employee. You can read; you cannot manage.',
    firstSeenAt: new Date('2026-04-22T00:00:00.000Z'),
    ...overrides,
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const ROLE_KEY = 'employee'

const THREE_PERMISSIONS = [
  { permissionKey: 'planner:plan:create', isLocked: false, module: 'planner' },
  { permissionKey: 'planner:personal:read', isLocked: false, module: 'planner' },
  { permissionKey: 'people:profile:read', isLocked: false, module: 'people' },
]

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PermissionNarrativeBuilder', () => {
  let kernelQuery: KernelQueryFacade
  let narrativeStore: NarrativeStore
  let builder: PermissionNarrativeBuilder

  beforeEach(() => {
    exporter.reset()
    __INTERNAL_resetInstruments()

    kernelQuery = {
      getRolePermissions: vi.fn(),
    } as unknown as KernelQueryFacade

    narrativeStore = {
      appendIfMissing: vi.fn(),
      get: vi.fn(),
    }

    builder = new PermissionNarrativeBuilder(kernelQuery, narrativeStore)
  })

  // ── 1. Happy path — miss ──────────────────────────────────────────────────

  it('1. miss: returns fromCache:false, correct hash and text; miss metric incremented', async () => {
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: THREE_PERMISSIONS,
    })
    const entry = makeEntry()
    vi.mocked(narrativeStore.appendIfMissing).mockResolvedValue({ entry, wasAppended: true })

    const result = await builder.build({
      tenantId: TENANT_ID,
      roleKey: ROLE_KEY,
      actorId: ACTOR_ID,
    })

    expect(result.fromCache).toBe(false)
    expect(result.narrativeHash).toBe(entry.contentHash)
    expect(result.text).toBe(entry.content)

    // metric
    const points = await flushPoints('agent_narrative_cache_total')
    const miss = points.find(
      (p) => p.attributes['tenant_id'] === TENANT_ID && p.attributes['outcome'] === 'miss',
    )
    expect(miss).toBeDefined()
    expect(miss!.value).toBe(1)
  })

  // ── 2. Happy path — hit ───────────────────────────────────────────────────

  it('2. hit: returns fromCache:true; hit metric incremented', async () => {
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: THREE_PERMISSIONS,
    })
    const entry = makeEntry()
    vi.mocked(narrativeStore.appendIfMissing).mockResolvedValue({ entry, wasAppended: false })

    const result = await builder.build({
      tenantId: TENANT_ID,
      roleKey: ROLE_KEY,
      actorId: ACTOR_ID,
    })

    expect(result.fromCache).toBe(true)

    const points = await flushPoints('agent_narrative_cache_total')
    const hit = points.find(
      (p) => p.attributes['tenant_id'] === TENANT_ID && p.attributes['outcome'] === 'hit',
    )
    expect(hit).toBeDefined()
    expect(hit!.value).toBe(1)
  })

  // ── 3. Deterministic text ────────────────────────────────────────────────

  it('3. same inputs → same narrativeHash across two calls', async () => {
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: THREE_PERMISSIONS,
    })

    let capturedHash1 = ''
    let capturedHash2 = ''

    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      capturedHash1 = input.contentHash
      return { entry: makeEntry({ contentHash: input.contentHash }), wasAppended: true }
    })
    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      capturedHash2 = input.contentHash
      return { entry: makeEntry({ contentHash: input.contentHash }), wasAppended: false }
    })
    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    expect(capturedHash1).toBeTruthy()
    expect(capturedHash1).toBe(capturedHash2)
  })

  // ── 4. Permission set change → new hash ──────────────────────────────────

  it('4. different granted permission set → different hash', async () => {
    const firstPerms = [
      { permissionKey: 'planner:plan:create', isLocked: false, module: 'planner' },
    ]
    const secondPerms = [
      { permissionKey: 'planner:plan:create', isLocked: false, module: 'planner' },
      { permissionKey: 'admin:role:manage', isLocked: false, module: 'admin' },
    ]

    const hashes: string[] = []
    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      hashes.push(input.contentHash)
      return { entry: makeEntry({ contentHash: input.contentHash }), wasAppended: true }
    })

    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValueOnce({
      roleKey: ROLE_KEY,
      permissions: firstPerms,
    })
    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValueOnce({
      roleKey: ROLE_KEY,
      permissions: secondPerms,
    })
    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    expect(hashes).toHaveLength(2)
    expect(hashes[0]).not.toBe(hashes[1])
  })

  // ── 5. Top-N truncation ───────────────────────────────────────────────────

  it('5. 15 granted permissions → only top-10 verbs appear in the text', async () => {
    // Build 15 permissions with distinct verbs.
    const manyPerms = Array.from({ length: 15 }, (_, i) => ({
      permissionKey: `module${i}:resource${i}:action${i}`,
      isLocked: false,
      module: `module${i}`,
    }))

    let capturedText = ''
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: manyPerms,
    })
    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      capturedText = input.content
      return { entry: makeEntry({ content: input.content }), wasAppended: true }
    })

    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    // Extract the "you can …" portion and count comma-separated verbs.
    const canMatch = capturedText.match(/you can (.*?)(?:;|$|\.)/)
    expect(canMatch).not.toBeNull()
    const verbs = canMatch![1].split(',').map((v) => v.trim())
    expect(verbs.length).toBeLessThanOrEqual(10)
  })

  // ── 6. Denial extraction ─────────────────────────────────────────────────

  it('6. partial grant set → "you cannot" verbs from the global catalog minus granted', async () => {
    const grantedPerms = [
      { permissionKey: 'planner:plan:create', isLocked: false, module: 'planner' },
    ]

    let capturedText = ''
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: grantedPerms,
    })
    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      capturedText = input.content
      return { entry: makeEntry({ content: input.content }), wasAppended: true }
    })

    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    // Since the full catalog has many more permissions than "create", denial verbs must appear.
    expect(capturedText).toContain('you cannot')

    // Verify the granted verb "create" is in the "you can" section.
    expect(capturedText).toContain('you can')
    expect(capturedText).toContain('create')

    // We have far more than 1 global permission, so denials from catalog minus granted must
    // produce at least 1 "cannot" verb (capped at top-5).
    const cannotMatch = capturedText.match(/you cannot (.*?)\./)
    expect(cannotMatch).not.toBeNull()
    const deniedVerbs = cannotMatch![1].split(',').map((v) => v.trim())
    expect(deniedVerbs.length).toBeGreaterThanOrEqual(1)
    expect(deniedVerbs.length).toBeLessThanOrEqual(5)
  })

  it('6b. extracts verbs from dot-delimited planner ms_sync permission keys', async () => {
    const grantedPerms = [
      { permissionKey: 'planner.ms_sync.connect', isLocked: false, module: 'planner' },
      { permissionKey: 'planner.ms_sync.conflict.resolve', isLocked: false, module: 'planner' },
      { permissionKey: 'planner.ms_sync.force_resync', isLocked: false, module: 'planner' },
    ]

    let capturedText = ''
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: grantedPerms,
    })
    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      capturedText = input.content
      return { entry: makeEntry({ content: input.content }), wasAppended: true }
    })

    await builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID })

    expect(capturedText).toContain('connect')
    expect(capturedText).toContain('resolve')
    expect(capturedText).toContain('force resync')
    expect(capturedText).not.toContain('planner.ms_sync')
  })

  // ── 7. Empty grant set ────────────────────────────────────────────────────

  it('7. zero granted permissions → narrative renders without crashing', async () => {
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: [],
    })

    let capturedText = ''
    vi.mocked(narrativeStore.appendIfMissing).mockImplementation(async (input) => {
      capturedText = input.content
      return { entry: makeEntry({ content: input.content }), wasAppended: true }
    })

    const result = await builder.build({
      tenantId: TENANT_ID,
      roleKey: ROLE_KEY,
      actorId: ACTOR_ID,
    })

    expect(result.text).toContain(`Acting as ${ROLE_KEY}`)
    expect(capturedText).toContain('no granted actions')
    // Still references denials from the global catalog.
    expect(capturedText).toContain('you cannot')
    // Verify ALL_PERMISSION_KEYS are the full set (sanity check).
    expect(ALL_PERMISSION_KEYS.length).toBeGreaterThan(0)
  })

  // ── 8. KernelQueryFacade throws → error propagates ───────────────────────

  it('8. kernel facade throws → error propagates; store is never called', async () => {
    const dbError = new Error('DB connection lost')
    vi.mocked(kernelQuery.getRolePermissions).mockRejectedValue(dbError)

    await expect(
      builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID }),
    ).rejects.toThrow('DB connection lost')

    expect(narrativeStore.appendIfMissing).not.toHaveBeenCalled()
  })

  // ── 9. NarrativeStore write fails → error propagates ─────────────────────

  it('9. narrative store write fails → error propagates', async () => {
    vi.mocked(kernelQuery.getRolePermissions).mockResolvedValue({
      roleKey: ROLE_KEY,
      permissions: THREE_PERMISSIONS,
    })
    const storeError = new Error('write failed')
    vi.mocked(narrativeStore.appendIfMissing).mockRejectedValue(storeError)

    await expect(
      builder.build({ tenantId: TENANT_ID, roleKey: ROLE_KEY, actorId: ACTOR_ID }),
    ).rejects.toThrow('write failed')
  })
})
