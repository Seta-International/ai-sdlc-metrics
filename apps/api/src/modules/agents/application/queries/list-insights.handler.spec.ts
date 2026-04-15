import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListInsightsQuery } from './list-insights.query'
import { ListInsightsHandler } from './list-insights.handler'
import type { AgentInsightRepository } from '../../domain/repositories/agent-insight.repository'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'

const mockInsights = [
  {
    id: '01900000-0000-7000-8000-000000000030',
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    module: 'people',
    entity: 'profile',
    entityId: 'prof-123',
    severity: 'info' as const,
    title: 'Profile incomplete',
    description: 'Missing emergency contact',
    actionLabel: 'Complete profile',
    actionHref: '/people/profile',
    isDismissed: false,
    createdAt: new Date(),
  },
]

describe('ListInsightsHandler', () => {
  let handler: ListInsightsHandler
  let insightRepo: AgentInsightRepository

  beforeEach(() => {
    insightRepo = {
      create: vi.fn(),
      findByActor: vi.fn().mockResolvedValue(mockInsights),
      dismiss: vi.fn(),
    }
    handler = new ListInsightsHandler(insightRepo)
  })

  it('returns insights for the actor', async () => {
    const query = new ListInsightsQuery(ACTOR_ID, TENANT_ID)

    const result = await handler.execute(query)

    expect(insightRepo.findByActor).toHaveBeenCalledWith(ACTOR_ID, TENANT_ID)
    expect(result).toEqual(mockInsights)
  })
})
