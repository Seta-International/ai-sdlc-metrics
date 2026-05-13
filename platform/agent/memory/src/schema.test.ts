import { describe, expect, it } from 'vitest'
import {
  agentMemorySchema,
  type MessageRow,
  messages,
  type NewMessage,
  type NewThread,
  type Resource,
  resources,
  type Thread,
  threads,
} from './schema'

describe('agent_memory schema', () => {
  it('declares the agent_memory pg schema', () => {
    expect(agentMemorySchema.schemaName).toBe('agent_memory')
  })

  it('exports three tables', () => {
    expect(threads).toBeDefined()
    expect(messages).toBeDefined()
    expect(resources).toBeDefined()
  })

  it('NewThread allows a tenantId-only insert', () => {
    const t: NewThread = { tenantId: '00000000-0000-0000-0000-000000000000' }
    expect(t.tenantId).toBeDefined()
  })

  it('NewMessage requires id, threadId, tenantId, role, content', () => {
    const m: NewMessage = {
      id: '00000000-0000-0000-0000-000000000000',
      threadId: '00000000-0000-0000-0000-000000000000',
      tenantId: '00000000-0000-0000-0000-000000000000',
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    }
    expect(m.role).toBe('user')
  })

  it('Thread and Resource selectable types compile', () => {
    const _t: Thread | undefined = undefined
    const _r: Resource | undefined = undefined
    const _m: MessageRow | undefined = undefined
    expect(_t).toBeUndefined()
    expect(_r).toBeUndefined()
    expect(_m).toBeUndefined()
  })
})
