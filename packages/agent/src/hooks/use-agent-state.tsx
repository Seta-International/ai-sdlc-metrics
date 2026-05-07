'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AgentInsight } from '../types'

export type ExecutionMode = 'default' | 'bypass'

export interface AgentStateContextValue {
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  insights: AgentInsight[]
  setInsights: (insights: AgentInsight[]) => void
  addInsight: (insight: AgentInsight) => void
  dismissInsight: (id: string) => void
  executionMode: ExecutionMode
  setExecutionMode: (mode: ExecutionMode) => void
}

const AgentStateContext = createContext<AgentStateContextValue | null>(null)

export function AgentStateProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [insights, setInsights] = useState<AgentInsight[]>([])
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('default')

  const togglePanel = useCallback(() => setPanelOpen((prev) => !prev), [])
  const addInsight = useCallback(
    (insight: AgentInsight) => setInsights((prev) => [insight, ...prev]),
    [],
  )
  const dismissInsight = useCallback(
    (id: string) => setInsights((prev) => prev.filter((i) => i.id !== id)),
    [],
  )

  return (
    <AgentStateContext.Provider
      value={{
        panelOpen,
        setPanelOpen,
        togglePanel,
        activeSessionId,
        setActiveSessionId,
        insights,
        setInsights,
        addInsight,
        dismissInsight,
        executionMode,
        setExecutionMode,
      }}
    >
      {children}
    </AgentStateContext.Provider>
  )
}

export function useAgentState(): AgentStateContextValue {
  const ctx = useContext(AgentStateContext)
  if (!ctx) throw new Error('useAgentState must be used within AgentStateProvider')
  return ctx
}

export function useOptionalAgentState(): AgentStateContextValue | null {
  return useContext(AgentStateContext)
}
