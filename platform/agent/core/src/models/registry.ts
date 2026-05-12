import { AgentError } from '../errors'
import type { ModelAdapter } from './adapter'

export interface AdapterRegistry {
  register(provider: string, adapter: ModelAdapter): void
  get(provider: string): ModelAdapter | undefined
  select(modelId: string): { adapter: ModelAdapter; bareModel: string }
}

export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, ModelAdapter>()
  return {
    register(provider, adapter) {
      if (adapters.has(provider)) {
        throw new AgentError({
          code: 'ADAPTER_ALREADY_REGISTERED',
          category: 'SYSTEM',
          message: `adapter already registered for provider ${JSON.stringify(provider)}`,
          details: { provider },
        })
      }
      adapters.set(provider, adapter)
    },
    get(provider) {
      return adapters.get(provider)
    },
    select(modelId) {
      const slash = modelId.indexOf('/')
      if (slash <= 0 || slash === modelId.length - 1) {
        throw new AgentError({
          code: 'INVALID_MODEL_ID',
          category: 'USER',
          message: `expected <provider>/<model>, got ${JSON.stringify(modelId)}`,
          details: { modelId },
        })
      }
      const provider = modelId.slice(0, slash)
      const bareModel = modelId.slice(slash + 1)
      const adapter = adapters.get(provider)
      if (!adapter) {
        throw new AgentError({
          code: 'ADAPTER_NOT_REGISTERED',
          category: 'SYSTEM',
          message: `no adapter registered for provider ${JSON.stringify(provider)}`,
          details: { knownProviders: [...adapters.keys()] },
        })
      }
      return { adapter, bareModel }
    },
  }
}
