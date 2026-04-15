import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DismissInsightCommand } from './dismiss-insight.command'
import { DismissInsightHandler } from './dismiss-insight.handler'
import type { AgentInsightRepository } from '../../domain/repositories/agent-insight.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const INSIGHT_ID = '01900000-0000-7000-8000-000000000030'

describe('DismissInsightHandler', () => {
  let handler: DismissInsightHandler
  let insightRepo: AgentInsightRepository

  beforeEach(() => {
    insightRepo = {
      create: vi.fn(),
      findByActor: vi.fn(),
      dismiss: vi.fn().mockResolvedValue(undefined),
    }
    handler = new DismissInsightHandler(insightRepo)
  })

  it('dismisses the insight by id and tenantId', async () => {
    const command = new DismissInsightCommand(TENANT_ID, INSIGHT_ID)

    await handler.execute(command)

    expect(insightRepo.dismiss).toHaveBeenCalledWith(INSIGHT_ID, TENANT_ID)
  })
})
