import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DevLoginCommand } from './dev-login.command'
import { DevLoginHandler } from './dev-login.handler'
import type { IUserIdentityRepository } from '../../domain/repositories/user-identity.repository.port'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'
import type { IRoleGrantRepository } from '../../domain/repositories/role-grant.repository.port'
import type { IAuditEventRepository } from '../../domain/repositories/audit-event.repository.port'
import { AccountSuspendedException } from '../../domain/exceptions/actor.exceptions'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const IDENTITY_ID = '01900000-0000-7000-8000-000000000003'

describe('DevLoginHandler', () => {
  let handler: DevLoginHandler
  let userIdentityRepo: IUserIdentityRepository
  let actorRepo: IActorRepository
  let roleGrantRepo: IRoleGrantRepository
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      findByEmail: vi.fn(),
      insert: vi.fn(),
      deprovisionByActorId: vi.fn(),
      updateLastLogin: vi.fn(),
    }
    actorRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    roleGrantRepo = {
      findByActorId: vi.fn(),
      insert: vi.fn(),
      revokeAllForActor: vi.fn(),
      revokeBySource: vi.fn(),
    }
    auditRepo = { insert: vi.fn() }
    handler = new DevLoginHandler(userIdentityRepo, actorRepo, roleGrantRepo, auditRepo)
  })

  it('returns session data for existing active user', async () => {
    vi.mocked(userIdentityRepo.findByEmail).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'alice@seta.vn',
      ssoSubject: 'local-alice',
      provider: 'local',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Alice',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.mocked(roleGrantRepo.findByActorId).mockResolvedValue([
      {
        id: '01900000-0000-7000-8000-000000000010',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        roleKey: 'employee',
        scopeType: 'global',
        scopeId: null,
        grantedBy: ACTOR_ID,
        validFrom: new Date(),
        validUntil: null,
        source: 'manual',
      },
    ])

    const result = await handler.execute(new DevLoginCommand('alice@seta.vn'))

    expect(result.actorId).toBe(ACTOR_ID)
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.roles).toEqual(['employee'])
    expect(result.provider).toBe('dev')
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'login',
        module: 'kernel',
        subjectId: IDENTITY_ID,
        payload: { provider: 'dev', email: 'alice@seta.vn' },
      }),
    )
  })

  it('throws when user not found', async () => {
    vi.mocked(userIdentityRepo.findByEmail).mockResolvedValue(null)
    await expect(handler.execute(new DevLoginCommand('ghost@seta.vn'))).rejects.toThrow(
      'User not found',
    )
  })

  it('throws for suspended identity', async () => {
    vi.mocked(userIdentityRepo.findByEmail).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'charlie@seta.vn',
      ssoSubject: 'local-charlie',
      provider: 'local',
      status: 'suspended',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    await expect(handler.execute(new DevLoginCommand('charlie@seta.vn'))).rejects.toThrow(
      AccountSuspendedException,
    )
  })

  it('throws for suspended actor', async () => {
    vi.mocked(userIdentityRepo.findByEmail).mockResolvedValue({
      id: IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      email: 'dana@seta.vn',
      ssoSubject: 'local-dana',
      provider: 'local',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(actorRepo.findById).mockResolvedValue({
      id: ACTOR_ID,
      tenantId: TENANT_ID,
      type: 'person',
      displayName: 'Dana',
      status: 'suspended',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await expect(handler.execute(new DevLoginCommand('dana@seta.vn'))).rejects.toThrow(
      AccountSuspendedException,
    )
  })
})
