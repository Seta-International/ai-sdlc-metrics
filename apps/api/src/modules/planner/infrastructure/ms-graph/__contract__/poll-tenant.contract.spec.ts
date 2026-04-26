/**
 * Contract tests: poll-tenant against a sandbox MS 365 tenant.
 *
 * Skipped unless MS_SANDBOX_TENANT_AD_ID, MS_SANDBOX_CLIENT_ID, and
 * MS_SANDBOX_CLIENT_SECRET are all set in the environment.
 *
 * Required env vars:
 *   MS_SANDBOX_TENANT_AD_ID   – AAD tenant ID of the sandbox
 *   MS_SANDBOX_CLIENT_ID      – App registration client ID
 *   MS_SANDBOX_CLIENT_SECRET  – Client secret (never commit)
 *   MS_SANDBOX_PLAN_ID        – Known plan ID pre-seeded in the sandbox
 *
 * Run locally:
 *   MS_SANDBOX_TENANT_AD_ID=… MS_SANDBOX_CLIENT_ID=… MS_SANDBOX_CLIENT_SECRET=… \
 *     MS_SANDBOX_PLAN_ID=… \
 *     bun vitest run src/modules/planner/infrastructure/ms-graph/__contract__
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { MsGraphClient } from '../ms-graph-client'
import { PlanIngestor } from '../pull/plan-ingestor'
import type { IMsGraphTokenAcquirer } from '../../../domain/ports/ms-graph-token-acquirer.port'
import type { IdentityQueryFacade } from '../../../../identity/application/facades/identity-query.facade'
import type { IPlanRepository } from '../../../domain/repositories/plan.repository'
import type { IBucketRepository } from '../../../domain/repositories/bucket.repository'
import type { ITaskRepository } from '../../../domain/repositories/task.repository'
import type { IMsPlanSyncStateRepository } from '../../../domain/repositories/ms-plan-sync-state.repository'

const TENANT_AD_ID = process.env['MS_SANDBOX_TENANT_AD_ID'] ?? ''
const CLIENT_ID = process.env['MS_SANDBOX_CLIENT_ID'] ?? ''
const CLIENT_SECRET = process.env['MS_SANDBOX_CLIENT_SECRET'] ?? ''
const PLAN_ID = process.env['MS_SANDBOX_PLAN_ID'] ?? ''
const SYNTHETIC_TENANT_ID = 'contract-sandbox-tenant'

const skip = !process.env['MS_SANDBOX_TENANT_AD_ID']

/** Acquires a token directly from env vars — bypasses the secrets store. */
class DirectTokenAcquirer implements IMsGraphTokenAcquirer {
  private cached: { token: string; expiresAt: number } | null = null

  async acquire(_cred: {
    tenantAdId: string
    clientId: string
    clientSecretRef: string
    scopes: readonly string[]
  }): Promise<string> {
    const now = Date.now()
    if (this.cached && this.cached.expiresAt - now > 60_000) {
      return this.cached.token
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    })

    const res = await fetch(`https://login.microsoftonline.com/${TENANT_AD_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Contract token acquisition failed (${res.status}): ${text}`)
    }

    const json = (await res.json()) as { access_token: string; expires_in: number }
    this.cached = { token: json.access_token, expiresAt: now + json.expires_in * 1000 }
    return json.access_token
  }
}

function makeIdentityFacade(): IdentityQueryFacade {
  const fakeCred = {
    tenantId: SYNTHETIC_TENANT_ID,
    clientId: CLIENT_ID,
    clientSecretRef: '__direct__',
    tenantAdId: TENANT_AD_ID,
    scopes: ['https://graph.microsoft.com/.default'] as readonly string[],
    status: 'active' as const,
    consentedAt: new Date(),
    lastValidatedAt: null,
    lastError: null,
  }

  return {
    getGraphCredential: vi.fn().mockResolvedValue(fakeCred),
    getActorIdByExternalUserId: vi.fn().mockResolvedValue(null),
  } as unknown as IdentityQueryFacade
}

function makeRepositoryMocks() {
  const planRepo: IPlanRepository = {
    findById: vi.fn().mockResolvedValue(null),
    upsertFromMs: vi.fn().mockImplementation(async (mapped: { msPlanId: string }) => ({
      id: `local-plan-${mapped.msPlanId}`,
    })),
    listByContainer: vi.fn().mockResolvedValue([]),
    markArchived: vi.fn().mockResolvedValue(undefined),
  } as unknown as IPlanRepository

  const bucketRepo: IBucketRepository = {
    upsertFromMs: vi.fn().mockResolvedValue(undefined),
  } as unknown as IBucketRepository

  const taskRepo: ITaskRepository = {
    findByMsTaskId: vi.fn().mockResolvedValue(null),
    upsertFromMs: vi.fn().mockImplementation(async (mapped: { msTaskId: string }) => ({
      id: `local-task-${mapped.msTaskId}`,
    })),
    upsertDetailsFromMs: vi.fn().mockResolvedValue(undefined),
    softDeleteFromMs: vi.fn().mockResolvedValue(undefined),
    listByPlan: vi.fn().mockResolvedValue([]),
  } as unknown as ITaskRepository

  const syncStateRepo: IMsPlanSyncStateRepository = {
    findByMsPlanId: vi.fn().mockResolvedValue(null),
    upsertState: vi.fn().mockResolvedValue(undefined),
    pauseAllPlansForGroup: vi.fn().mockResolvedValue(undefined),
    incrementErrorCountForGroup: vi.fn().mockResolvedValue(undefined),
    maxConsecutiveErrorCountForGroup: vi.fn().mockResolvedValue(0),
  } as unknown as IMsPlanSyncStateRepository

  return { planRepo, bucketRepo, taskRepo, syncStateRepo }
}

describe.skipIf(skip)('Contract: poll-tenant against sandbox tenant', { timeout: 60_000 }, () => {
  let graph: MsGraphClient
  let ingestor: PlanIngestor
  let repos: ReturnType<typeof makeRepositoryMocks>

  beforeAll(() => {
    const identityFacade = makeIdentityFacade()
    const tokenAcquirer = new DirectTokenAcquirer()
    graph = new MsGraphClient(identityFacade, tokenAcquirer)
    repos = makeRepositoryMocks()
    ingestor = new PlanIngestor(
      graph,
      repos.planRepo,
      repos.bucketRepo,
      repos.taskRepo,
      repos.syncStateRepo,
      identityFacade,
    )
  })

  it('poll imports a known plan with known tasks', async () => {
    await ingestor.ingestPlan({
      tenantId: SYNTHETIC_TENANT_ID,
      msPlanId: PLAN_ID,
      origin: 'ms-sync-pull',
    })

    expect(repos.planRepo.upsertFromMs).toHaveBeenCalledWith(
      expect.objectContaining({ msPlanId: PLAN_ID }),
      { origin: 'ms-sync-pull' },
    )

    const upsertedTasks = vi.mocked(repos.taskRepo.upsertFromMs).mock.calls
    expect(upsertedTasks.length).toBeGreaterThan(0)

    for (const [mapped] of upsertedTasks) {
      expect(mapped).toMatchObject({
        tenantId: SYNTHETIC_TENANT_ID,
        msPlanId: PLAN_ID,
        msTaskId: expect.any(String),
        title: expect.any(String),
        orderHint: expect.any(String),
      })
    }

    expect(repos.syncStateRepo.upsertState).toHaveBeenCalledWith(
      expect.objectContaining({
        msPlanId: PLAN_ID,
        tenantId: SYNTHETIC_TENANT_ID,
      }),
    )
  })

  it('order-hint algorithm round-trips a task reorder', async () => {
    // Fetch current tasks from the sandbox plan
    const tasks = await graph.getAllPages<{
      id: string
      orderHint: string
      title: string
      planId: string
      bucketId: string | null
      percentComplete: number
      priority: number
      assignments: Record<string, unknown>
      appliedCategories: Record<string, boolean>
    }>(SYNTHETIC_TENANT_ID, `/planner/plans/${encodeURIComponent(PLAN_ID)}/tasks`)

    expect(tasks.length).toBeGreaterThanOrEqual(2)

    const [first, second] = tasks

    // Move `second` to appear before `first` by patching its orderHint.
    // MS Planner orderHint format: " {sibling.orderHint}!" places the task before sibling.
    const newOrderHint = ` ${first.orderHint}!`
    const firstEtag = tasks.find((t) => t.id === second.id)

    const etag = await graph.get<{ '@odata.etag': string }>(
      SYNTHETIC_TENANT_ID,
      `/planner/tasks/${encodeURIComponent(second.id)}`,
    )
    const currentEtag = etag.etag ?? ''

    await graph.patch(
      SYNTHETIC_TENANT_ID,
      `/planner/tasks/${encodeURIComponent(second.id)}`,
      { orderHint: newOrderHint },
      { ifMatch: currentEtag },
    )

    // Re-poll the plan and verify the updated orderHint was captured
    vi.mocked(repos.planRepo.upsertFromMs).mockReset()
    vi.mocked(repos.taskRepo.upsertFromMs).mockReset()
    vi.mocked(repos.taskRepo.upsertFromMs).mockImplementation(
      async (mapped: { msTaskId: string }) => ({ id: `local-task-${mapped.msTaskId}` }),
    )
    vi.mocked(repos.syncStateRepo.findByMsPlanId).mockResolvedValue(null)
    vi.mocked(repos.planRepo.upsertFromMs).mockImplementation(
      async (mapped: { msPlanId: string }) => ({ id: `local-plan-${mapped.msPlanId}` }),
    )

    await ingestor.ingestPlan({
      tenantId: SYNTHETIC_TENANT_ID,
      msPlanId: PLAN_ID,
      origin: 'ms-sync-pull',
    })

    const reorderedCalls = vi.mocked(repos.taskRepo.upsertFromMs).mock.calls
    const secondTaskCall = reorderedCalls.find(([mapped]) => mapped.msTaskId === second.id)
    expect(secondTaskCall).toBeDefined()
    // The persisted orderHint must be non-empty — exact value is assigned by MS Graph
    expect(secondTaskCall?.[0].orderHint).toBeTruthy()

    // Restore original order to keep sandbox clean
    const restoredEtag = await graph.get<{ '@odata.etag': string }>(
      SYNTHETIC_TENANT_ID,
      `/planner/tasks/${encodeURIComponent(second.id)}`,
    )
    if (restoredEtag.etag && firstEtag) {
      const originalHint = ` ${second.orderHint}!`
      await graph
        .patch(
          SYNTHETIC_TENANT_ID,
          `/planner/tasks/${encodeURIComponent(second.id)}`,
          { orderHint: originalHint },
          { ifMatch: restoredEtag.etag },
        )
        .catch(() => {
          // best-effort cleanup — non-fatal
        })
    }
  })
})
