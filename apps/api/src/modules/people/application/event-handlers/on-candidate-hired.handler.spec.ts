import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { OnCandidateHiredHandler } from './on-candidate-hired.handler'
import { CandidateHiredEvent } from '@future/event-contracts'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

describe('OnCandidateHiredHandler', () => {
  let handler: OnCandidateHiredHandler
  let commandBus: CommandBus

  beforeEach(() => {
    commandBus = { execute: vi.fn().mockResolvedValue('profile-1') } as unknown as CommandBus
    handler = new OnCandidateHiredHandler(commandBus)
  })

  it('dispatches CreateEmploymentProfileCommand when candidate is hired', async () => {
    await handler.handle(new CandidateHiredEvent(TENANT_ID, ACTOR_ID, 'candidate-1', '2026-04-01'))

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
      }),
    )
  })
})
