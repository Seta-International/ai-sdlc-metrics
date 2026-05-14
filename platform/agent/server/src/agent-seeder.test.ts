import { describe, expect, it, vi } from 'vitest'
import { seedAgentProfiles } from './agent-seeder'

const makeSql = () =>
  Object.assign(vi.fn().mockResolvedValue([]), {
    array: (a: unknown[]) => a,
  })

const SEED = {
  slug: 'planner',
  name: 'Planner Agent',
  description: 'Task management',
  instructions: 'You are a planner.',
  model: 'gpt-4o',
  toolIds: ['list_tasks'],
  workingMemoryTemplate: null,
}

describe('seedAgentProfiles', () => {
  it('inserts each seed with ON CONFLICT DO NOTHING', async () => {
    const sql = makeSql()
    await seedAgentProfiles(sql as never, [SEED])
    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — two calls produce 2 SQL executions total (one per seed per call)', async () => {
    const sql = makeSql()
    await seedAgentProfiles(sql as never, [SEED])
    await seedAgentProfiles(sql as never, [SEED])
    expect(sql).toHaveBeenCalledTimes(2)
  })
})
