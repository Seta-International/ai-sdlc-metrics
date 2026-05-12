import {
  createAdapterRegistry,
  createAnthropicAdapter,
  createAzureOpenAIAdapter,
  createOpenAIAdapter,
} from '@seta/agent-core'
import { logger } from '@seta/observability'
import { env } from './env'

export const agentRegistry = createAdapterRegistry()

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
