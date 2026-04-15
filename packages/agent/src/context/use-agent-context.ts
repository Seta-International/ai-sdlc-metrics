import { createContext, useContext } from 'react'
import type { AgentContext } from '../types'

export const AgentContextContext = createContext<AgentContext | null>(null)

export function useAgentContext(): AgentContext | null {
  return useContext(AgentContextContext)
}
