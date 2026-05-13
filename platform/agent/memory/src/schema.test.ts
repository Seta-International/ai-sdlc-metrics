import { describe, expect, it } from 'vitest'
import {
  agentMemorySchema,
  type Conversation,
  conversations,
  type NewConversation,
  type NewTurn,
  type TurnRow,
  turns,
  type WorkingMemoryRow,
  workingMemory,
} from './schema'

describe('agent_memory schema', () => {
  it('declares the agent_memory pg schema', () => {
    expect(agentMemorySchema.schemaName).toBe('agent_memory')
  })

  it('exports three tables', () => {
    expect(conversations).toBeDefined()
    expect(turns).toBeDefined()
    expect(workingMemory).toBeDefined()
  })

  it('NewConversation allows a tenantId-only insert', () => {
    const c: NewConversation = { tenantId: '00000000-0000-0000-0000-000000000000' }
    expect(c.tenantId).toBeDefined()
  })

  it('NewTurn requires id, threadId, tenantId, role, content', () => {
    const t: NewTurn = {
      id: '00000000-0000-0000-0000-000000000000',
      threadId: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    }
    expect(t.role).toBe('user')
  })

  it('row types compile', () => {
    const _c: Conversation | undefined = undefined
    const _w: WorkingMemoryRow | undefined = undefined
    const _t: TurnRow | undefined = undefined
    expect(_c).toBeUndefined()
    expect(_w).toBeUndefined()
    expect(_t).toBeUndefined()
  })
})
