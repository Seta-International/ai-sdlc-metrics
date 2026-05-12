import { AzureOpenAI } from 'openai'
import type { ModelAdapter } from './adapter'
import { makeOpenAICompatibleAdapter } from './openai'

export interface AzureOpenAIAdapterConfig {
  apiKey: string
  endpoint: string
  apiVersion: string
  defaultHeaders?: Record<string, string>
  maxRetries?: number
  timeoutMs?: number
}

export function createAzureOpenAIAdapter(cfg: AzureOpenAIAdapterConfig): ModelAdapter {
  const client = new AzureOpenAI({
    apiKey: cfg.apiKey,
    endpoint: cfg.endpoint,
    apiVersion: cfg.apiVersion,
    ...(cfg.defaultHeaders !== undefined ? { defaultHeaders: cfg.defaultHeaders } : {}),
    maxRetries: cfg.maxRetries ?? 2,
    timeout: cfg.timeoutMs ?? 60_000,
  })
  return makeOpenAICompatibleAdapter(client, 'azure-openai')
}
