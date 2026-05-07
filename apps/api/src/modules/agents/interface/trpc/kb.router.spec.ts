import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setKbHandlers, kbRouter } from './kb.router'
import type { KbRetriever } from '../../infrastructure/retrieval/kb-retriever'
import type { S3StorageClient } from '@future/storage'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { Db } from '@future/db'

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makePgBossService(): PgBossService {
  return {
    enqueue: vi.fn().mockResolvedValue('job-id-abc'),
    registerWorker: vi.fn(),
    registerScheduledWorker: vi.fn(),
    schedule: vi.fn(),
    onApplicationBootstrap: vi.fn(),
    onApplicationShutdown: vi.fn(),
  } as unknown as PgBossService
}

function makeDb(): Db {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Db
}

const DOCUMENT_ID = '01900000-0000-7000-8000-000000000099'
const TENANT_ID = '01900000-0000-7000-8000-000000000001'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('kbRouter.confirmUpload', () => {
  let pgBoss: PgBossService
  let db: Db

  beforeEach(() => {
    pgBoss = makePgBossService()
    db = makeDb()
    setKbHandlers({} as KbRetriever, {} as S3StorageClient, db, pgBoss)
  })

  it('returns { ok: true } and enqueues a kb-ingestion job', async () => {
    const caller = kbRouter.createCaller({
      tenantId: TENANT_ID,
      actorId: 'user-1',
    } as never)

    const result = await caller.confirmUpload({ documentId: DOCUMENT_ID })

    expect(result).toEqual({ ok: true })
    expect(pgBoss.enqueue).toHaveBeenCalledOnce()
    expect(pgBoss.enqueue).toHaveBeenCalledWith('kb-ingestion', {
      documentId: DOCUMENT_ID,
      tenantId: TENANT_ID,
    })
  })

  it('updates document status to processing before enqueueing', async () => {
    const whereStub = vi.fn().mockResolvedValue(undefined)
    const setStub = vi.fn().mockReturnValue({ where: whereStub })
    const updateStub = vi.fn().mockReturnValue({ set: setStub })
    setKbHandlers(
      {} as KbRetriever,
      {} as S3StorageClient,
      { update: updateStub } as unknown as Db,
      pgBoss,
    )

    const caller = kbRouter.createCaller({ tenantId: TENANT_ID, actorId: 'user-1' } as never)
    await caller.confirmUpload({ documentId: DOCUMENT_ID })

    expect(setStub).toHaveBeenCalledWith({ status: 'processing' })
    expect(pgBoss.enqueue).toHaveBeenCalledOnce()
  })
})
