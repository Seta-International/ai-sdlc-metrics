import { AgentClient } from '@seta/agent-sdk'
import { env } from '../env'

const baseUrl =
  env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')

export const client = new AgentClient({
  baseUrl,
  credentials: 'include',
})
