import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateActorStatusCommand } from './update-actor-status.command'
import { UpdateActorStatusHandler } from './update-actor-status.handler'
import {
  ActorArchivedException,
  ActorNotFoundException,
} from '../../domain/exceptions/actor.exceptions'
import type { Actor } from '../../domain/entities/actor.entity'
import type { IActorRepository } from '../../domain/repositories/actor.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const fakeActor: Actor = {
  id: ACTOR_ID,
  tenantId: TENANT_ID,
  type: 'person',
  displayName: 'Canh Ta',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('UpdateActorStatusHandler', () => {
  let handler: UpdateActorStatusHandler
  let actorRepo: IActorRepository

  beforeEach(() => {
    actorRepo = {
      findById: vi.fn(),
      insert: vi.fn(),
      updateStatus: vi.fn(),
    }
    handler = new UpdateActorStatusHandler(actorRepo)
  })

  it('updates actor status to inactive', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(actorRepo.updateStatus).mockResolvedValue(undefined)

    await handler.execute(new UpdateActorStatusCommand(TENANT_ID, ACTOR_ID, 'inactive'))

    expect(actorRepo.findById).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(actorRepo.updateStatus).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID, 'inactive')
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(null)

    await expect(
      handler.execute(new UpdateActorStatusCommand(TENANT_ID, ACTOR_ID, 'inactive')),
    ).rejects.toThrow(ActorNotFoundException)

    expect(actorRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('throws ActorArchivedException when actor is archived', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue({
      ...fakeActor,
      status: 'archived',
    })

    await expect(
      handler.execute(new UpdateActorStatusCommand(TENANT_ID, ACTOR_ID, 'active')),
    ).rejects.toThrow(ActorArchivedException)

    expect(actorRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('propagates repository errors', async () => {
    vi.mocked(actorRepo.findById).mockResolvedValue(fakeActor)
    vi.mocked(actorRepo.updateStatus).mockRejectedValue(new Error('DB error'))

    await expect(
      handler.execute(new UpdateActorStatusCommand(TENANT_ID, ACTOR_ID, 'inactive')),
    ).rejects.toThrow('DB error')
  })
})
