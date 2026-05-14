import { describe, expect, it, vi } from 'vitest'
import { hydrateAgent, interpolateInstructions, resolveAgentProfile } from './profile-registry'

type SqlFn = (strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>
const makeSql = (rows: unknown[]) => vi.fn<SqlFn>().mockResolvedValue(rows)

const PROFILE_ROW = {
  agentId: 'agt-1',
  tenantId: null,
  slug: 'planner',
  name: 'Planner Agent',
  instructions: 'Hello {{timezone}} {{convType}}',
  model: 'gpt-4o',
  toolIds: ['list_tasks'],
  workingMemoryTemplate: null,
  temperature: null,
  metadata: {},
  status: 'published',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('resolveAgentProfile', () => {
  it('returns a matching row', async () => {
    const sql = makeSql([PROFILE_ROW])
    const row = await resolveAgentProfile(sql as never, 'tenant-1', 'planner')
    expect(row.slug).toBe('planner')
  })

  it('throws when no row matches', async () => {
    const sql = makeSql([])
    await expect(resolveAgentProfile(sql as never, 'tenant-1', 'missing')).rejects.toThrow()
  })
})

describe('interpolateInstructions', () => {
  it('replaces {{timezone}} and {{convType}}', () => {
    const result = interpolateInstructions('Tz: {{timezone}} Conv: {{convType}}', {
      timezone: 'Asia/Ho_Chi_Minh',
      convType: 'personal',
    })
    expect(result).toBe('Tz: Asia/Ho_Chi_Minh Conv: personal')
  })

  it('leaves unknown placeholders intact', () => {
    const result = interpolateInstructions('{{unknown}}', { timezone: 'UTC', convType: 'personal' })
    expect(result).toBe('{{unknown}}')
  })
})

describe('hydrateAgent', () => {
  it('builds AgentConfig with resolved tools and interpolated instructions', () => {
    const mockTool = { id: 'list_tasks' } as never
    const registry = { resolve: vi.fn().mockReturnValue([mockTool]), register: vi.fn() }
    const config = hydrateAgent(
      PROFILE_ROW as never,
      [],
      { timezone: 'UTC', convType: 'groupChat' },
      registry,
    )
    expect(config.systemPrompt).toBe('Hello UTC groupChat')
    expect(config.tools).toEqual([mockTool])
    expect(config.model).toBe('gpt-4o')
  })
})
