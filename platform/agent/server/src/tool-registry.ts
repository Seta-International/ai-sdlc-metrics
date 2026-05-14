import type { Tool } from '@seta/agent-core'
import { DomainError } from '@seta/middleware'

export interface ToolRegistry {
  register(toolId: string, tool: Tool): void
  resolve(toolIds: string[]): Tool[]
}

export function createToolRegistry(): ToolRegistry {
  const map = new Map<string, Tool>()
  return {
    register(toolId, tool) {
      map.set(toolId, tool)
    },
    resolve(toolIds) {
      return toolIds.map((id) => {
        const tool = map.get(id)
        if (!tool) throw new DomainError('unknown_tool_id', { toolId: id })
        return tool
      })
    },
  }
}
