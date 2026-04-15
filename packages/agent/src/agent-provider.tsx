import type { ReactNode } from 'react'
import { AgentStateProvider } from './hooks/use-agent-state'

export interface AgentProviderProps {
  children: ReactNode
}

export function AgentProvider({ children }: AgentProviderProps) {
  return <AgentStateProvider>{children}</AgentStateProvider>
}
