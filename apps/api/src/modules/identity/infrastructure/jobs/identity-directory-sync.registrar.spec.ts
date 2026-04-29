import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IdentityDirectorySyncRegistrar } from './identity-directory-sync.registrar'
import { IDENTITY_DIRECTORY_SYNC_JOB } from './pg-boss-job-scheduler'
import { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { CommandBus } from '@nestjs/cqrs'
import { RunDirectorySyncCommand } from '../../application/commands/run-directory-sync.command'
import { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import { ClsService } from 'nestjs-cls'
import type { Db } from '@future/db'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const PROVIDER_ID = '01900000-0000-7000-8000-000000000010'

vi.mock('../../../../common/jobs/run-with-tenant-context', () => ({
  runWithTenantContext: vi.fn((_opts, fn) => fn()),
}))

describe('IdentityDirectorySyncRegistrar', () => {
  let registrar: IdentityDirectorySyncRegistrar
  let pgBoss: PgBossService
  let commandBus: CommandBus

  beforeEach(() => {
    pgBoss = { registerWorker: vi.fn() } as unknown as PgBossService
    commandBus = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as CommandBus
    registrar = new IdentityDirectorySyncRegistrar(
      pgBoss,
      commandBus,
      {} as Db,
      { setDb: vi.fn(), getDb: vi.fn() } as unknown as RequestDbContextService,
      { run: vi.fn((_f) => _f()) } as unknown as ClsService,
    )
  })

  it('registers a worker for identity.directory-sync on bootstrap', () => {
    registrar.onApplicationBootstrap()
    expect(pgBoss.registerWorker).toHaveBeenCalledWith(
      IDENTITY_DIRECTORY_SYNC_JOB,
      expect.any(Function),
    )
  })

  it('executes RunDirectorySyncCommand when job runs', async () => {
    let capturedHandler:
      | ((jobs: { data: { tenantId: string; identityProviderId: string } }[]) => Promise<void>)
      | null = null
    vi.mocked(pgBoss.registerWorker).mockImplementation((_name, handler) => {
      capturedHandler = handler as typeof capturedHandler
    })

    registrar.onApplicationBootstrap()

    await capturedHandler!([{ data: { tenantId: TENANT_ID, identityProviderId: PROVIDER_ID } }])

    expect(commandBus.execute).toHaveBeenCalledWith(
      new RunDirectorySyncCommand(TENANT_ID, PROVIDER_ID),
    )
  })
})
