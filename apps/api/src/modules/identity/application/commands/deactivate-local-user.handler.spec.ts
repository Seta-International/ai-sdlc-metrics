import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'
import { DeactivateLocalUserHandler } from './deactivate-local-user.handler'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TARGET_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('DeactivateLocalUserHandler', () => {
  let handler: DeactivateLocalUserHandler
  let auditFacade: KernelAuditFacade
  let actorFacade: KernelActorFacade
  let userIdentityFacade: KernelUserIdentityFacade

  beforeEach(() => {
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    actorFacade = {
      createActor: vi.fn(),
      deactivateActor: vi.fn(),
      grantRole: vi.fn(),
      revokeAllRoles: vi.fn(),
    } as unknown as KernelActorFacade
    userIdentityFacade = {
      createUserIdentity: vi.fn(),
      deprovisionUserIdentity: vi.fn(),
    } as unknown as KernelUserIdentityFacade
    handler = new DeactivateLocalUserHandler(auditFacade, actorFacade, userIdentityFacade)
  })

  it('deactivates user identity, revokes roles, and updates actor status', async () => {
    vi.mocked(userIdentityFacade.deprovisionUserIdentity).mockResolvedValue(undefined)
    vi.mocked(actorFacade.revokeAllRoles).mockResolvedValue(undefined)
    vi.mocked(actorFacade.deactivateActor).mockResolvedValue(undefined)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    await handler.execute(
      new DeactivateLocalUserCommand(TENANT_ID, TARGET_ACTOR_ID, ADMIN_ACTOR_ID),
    )

    expect(userIdentityFacade.deprovisionUserIdentity).toHaveBeenCalledWith(
      TENANT_ID,
      TARGET_ACTOR_ID,
    )
    expect(actorFacade.revokeAllRoles).toHaveBeenCalledWith(TARGET_ACTOR_ID, TENANT_ID)
    expect(actorFacade.deactivateActor).toHaveBeenCalledWith(TARGET_ACTOR_ID, TENANT_ID)
    expect(auditFacade.recordEvent).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'local_user.deactivated',
      module: 'identity',
      subjectId: TARGET_ACTOR_ID,
      payload: {},
    })
  })
})
