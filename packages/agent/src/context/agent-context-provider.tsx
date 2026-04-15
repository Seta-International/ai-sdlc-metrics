'use client'

import type { ReactNode } from 'react'
import type { AgentContext, ModuleKey } from '../types'
import { AgentContextContext } from './use-agent-context'

export interface AgentContextProviderProps {
  module: ModuleKey
  entity: string
  id: string
  metadata?: Record<string, unknown>
  children: ReactNode
}

export function AgentContextProvider({
  module,
  entity,
  id,
  metadata,
  children,
}: AgentContextProviderProps) {
  const value: AgentContext = { module, entity, id, metadata }
  return <AgentContextContext.Provider value={value}>{children}</AgentContextContext.Provider>
}
