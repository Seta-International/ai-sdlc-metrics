import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@future/db'
import { RlsMiddleware } from './rls.middleware'
import type { TenantContextService } from '../cls/tenant-context.service'
import type { RequestDbContextService } from '../db/request-db-context.service'

vi.mock('@future/db', async () => {
  const actual = await vi.importActual<typeof import('@future/db')>('@future/db')

  return {
    ...actual,
    createDb: vi.fn(),
  }
})

const TENANT_ID = '01900000-0000-7fff-8000-000000000099'

class FakeResponse extends EventEmitter {}

describe('RlsMiddleware', () => {
  let tenantContext: Pick<TenantContextService, 'getTenantId'>
  let requestDbContext: Pick<RequestDbContextService, 'setDb' | 'clearDb'>

  beforeEach(() => {
    vi.mocked(createDb).mockReset()
    tenantContext = {
      getTenantId: vi.fn().mockReturnValue(TENANT_ID),
    }
    requestDbContext = {
      setDb: vi.fn(),
      clearDb: vi.fn(),
    }
  })

  it('binds a dedicated client to the request and resets it on response finish', async () => {
    const client = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    const connect = vi.fn().mockResolvedValue(client)
    const baseDb = {
      $client: {
        connect,
      },
    } as unknown as Db
    const requestDb = {
      execute: vi.fn(),
    } as unknown as Db
    const response = new FakeResponse()
    const next = vi.fn()

    vi.mocked(createDb).mockReturnValue(requestDb)

    const middleware = new RlsMiddleware(
      baseDb,
      tenantContext as TenantContextService,
      requestDbContext as RequestDbContextService,
    )

    await middleware.use({}, response, next)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(client.query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, false)", [
      TENANT_ID,
    ])
    expect(createDb).toHaveBeenCalledWith(client)
    expect(requestDbContext.setDb).toHaveBeenCalledWith(requestDb)
    expect(next).toHaveBeenCalledTimes(1)

    response.emit('finish')

    await Promise.resolve()
    await Promise.resolve()

    expect(client.query).toHaveBeenCalledWith('RESET app.tenant_id')
    expect(client.release).toHaveBeenCalledTimes(1)
    expect(requestDbContext.clearDb).toHaveBeenCalledTimes(1)
  })

  it('cleans up on response close instead of finish', async () => {
    const client = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    const baseDb = { $client: { connect: vi.fn().mockResolvedValue(client) } } as unknown as Db
    const requestDb = {} as Db
    vi.mocked(createDb).mockReturnValue(requestDb)

    const response = new FakeResponse()
    const next = vi.fn()
    const middleware = new RlsMiddleware(
      baseDb,
      tenantContext as TenantContextService,
      requestDbContext as RequestDbContextService,
    )

    await middleware.use({}, response, next)
    response.emit('close')

    await Promise.resolve()
    await Promise.resolve()

    expect(requestDbContext.clearDb).toHaveBeenCalledTimes(1)
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('does not clean up twice when both finish and close fire', async () => {
    const client = {
      query: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    const baseDb = { $client: { connect: vi.fn().mockResolvedValue(client) } } as unknown as Db
    vi.mocked(createDb).mockReturnValue({} as Db)

    const response = new FakeResponse()
    const middleware = new RlsMiddleware(
      baseDb,
      tenantContext as TenantContextService,
      requestDbContext as RequestDbContextService,
    )

    await middleware.use({}, response, vi.fn())
    response.emit('finish')
    response.emit('close')

    await Promise.resolve()
    await Promise.resolve()

    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('releases the client and rethrows when set_config fails', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('pg error')),
      release: vi.fn(),
    }
    const baseDb = { $client: { connect: vi.fn().mockResolvedValue(client) } } as unknown as Db

    const middleware = new RlsMiddleware(
      baseDb,
      tenantContext as TenantContextService,
      requestDbContext as RequestDbContextService,
    )

    await expect(middleware.use({}, new FakeResponse(), vi.fn())).rejects.toThrow('pg error')
    expect(client.release).toHaveBeenCalledTimes(1)
    expect(requestDbContext.setDb).not.toHaveBeenCalled()
  })

  it('skips request db binding when the tenant context is missing', async () => {
    const connect = vi.fn()
    const baseDb = {
      $client: {
        connect,
      },
    } as unknown as Db
    const next = vi.fn()

    vi.mocked(tenantContext.getTenantId).mockImplementation(() => {
      throw new Error('missing tenant')
    })

    const middleware = new RlsMiddleware(
      baseDb,
      tenantContext as TenantContextService,
      requestDbContext as RequestDbContextService,
    )

    await middleware.use({}, new FakeResponse(), next)

    expect(connect).not.toHaveBeenCalled()
    expect(requestDbContext.setDb).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
