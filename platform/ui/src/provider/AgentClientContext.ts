import type { AgentClient } from '@seta/agent-sdk'
import { createContext } from 'react'

export const AgentClientContext = createContext<AgentClient | null>(null)
