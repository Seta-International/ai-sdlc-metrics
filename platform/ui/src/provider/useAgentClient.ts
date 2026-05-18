import type { AgentClient } from '@seta/agent-sdk'
import { useContext } from 'react'
import { AgentClientContext } from './AgentClientContext'

export function useAgentClient(): AgentClient {
  const client = useContext(AgentClientContext)
  if (!client) throw new Error('useAgentClient must be used inside <SetaProvider>')
  return client
}
