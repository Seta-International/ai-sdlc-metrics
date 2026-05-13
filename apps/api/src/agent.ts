import {
  createAdapterRegistry,
  createAnthropicAdapter,
  createAzureOpenAIAdapter,
  createOpenAIAdapter,
} from '@seta/agent-core'
import { AgentMemoryProvider } from '@seta/agent-memory'
import { logger } from '@seta/observability'
import { sql } from './db'
import { env } from './env'

export const agentRegistry = createAdapterRegistry()

export const agentMemory = new AgentMemoryProvider({ sql })
logger.info('agent memory provider bound')

agentRegistry.register('anthropic', createAnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY }))
logger.info({ provider: 'anthropic' }, 'adapter registered')

agentRegistry.register('openai', createOpenAIAdapter({ apiKey: env.OPENAI_API_KEY }))
logger.info({ provider: 'openai' }, 'adapter registered')

if (env.AZURE_OPENAI_ENDPOINT !== undefined && env.AZURE_OPENAI_API_KEY !== undefined) {
  agentRegistry.register(
    'azure-openai',
    createAzureOpenAIAdapter({
      apiKey: env.AZURE_OPENAI_API_KEY,
      endpoint: env.AZURE_OPENAI_ENDPOINT,
      apiVersion: env.AZURE_OPENAI_API_VERSION,
    }),
  )
  logger.info({ provider: 'azure-openai' }, 'adapter registered')
}
