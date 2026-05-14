import { describe, expect, it } from 'vitest'
import { createToolRegistry } from './tool-registry'

const fakeTool = (id: string) => ({ id }) as never

describe('createToolRegistry', () => {
  it('register + resolve returns registered tools', () => {
    const reg = createToolRegistry()
    const tool = fakeTool('list_tasks')
    reg.register('list_tasks', tool)
    const resolved = reg.resolve(['list_tasks'])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toBe(tool)
  })

  it('resolve throws DomainError for unknown tool id', () => {
    const reg = createToolRegistry()
    expect(() => reg.resolve(['unknown_tool'])).toThrow()
  })

  it('resolve returns tools in the same order as the input ids', () => {
    const reg = createToolRegistry()
    const a = fakeTool('a')
    const b = fakeTool('b')
    reg.register('a', a)
    reg.register('b', b)
    expect(reg.resolve(['b', 'a'])).toEqual([b, a])
  })
})
