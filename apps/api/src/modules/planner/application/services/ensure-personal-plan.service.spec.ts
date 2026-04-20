import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uuidv7 } from 'uuidv7'
import { CommandBus } from '@nestjs/cqrs'
import { EnsurePersonalPlanService } from './ensure-personal-plan.service'
import { CreatePersonalPlanCommand } from '../commands/plans/create-personal-plan.command'

const TENANT_ID = uuidv7()
const ACTOR_ID = uuidv7()
const PLAN_ID = uuidv7()

describe('EnsurePersonalPlanService', () => {
  let commandBus: { execute: ReturnType<typeof vi.fn> }
  let svc: EnsurePersonalPlanService

  beforeEach(() => {
    commandBus = { execute: vi.fn() }
    svc = new EnsurePersonalPlanService(commandBus as unknown as CommandBus)
  })

  it('dispatches CreatePersonalPlanCommand with actorId + tenantId and returns the planId', async () => {
    commandBus.execute.mockResolvedValue({ planId: PLAN_ID, created: true })
    const result = await svc.ensure(ACTOR_ID, TENANT_ID)
    expect(result).toBe(PLAN_ID)
    expect(commandBus.execute).toHaveBeenCalledOnce()
    const cmd = commandBus.execute.mock.calls[0][0] as CreatePersonalPlanCommand
    expect(cmd).toBeInstanceOf(CreatePersonalPlanCommand)
    expect(cmd.actorId).toBe(ACTOR_ID)
    expect(cmd.tenantId).toBe(TENANT_ID)
  })

  it('returns the same planId when created=false (idempotency passthrough)', async () => {
    commandBus.execute.mockResolvedValue({ planId: PLAN_ID, created: false })
    const result = await svc.ensure(ACTOR_ID, TENANT_ID)
    expect(result).toBe(PLAN_ID)
  })
})
