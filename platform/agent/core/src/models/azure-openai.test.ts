import { describe, expect, it } from 'vitest'
import { createAzureOpenAIAdapter } from './azure-openai'

describe('createAzureOpenAIAdapter', () => {
  it('returns a ModelAdapter with provider="azure-openai"', () => {
    const adapter = createAzureOpenAIAdapter({
      apiKey: 'test',
      endpoint: 'https://my-resource.openai.azure.com',
      apiVersion: '2024-10-21',
    })
    expect(adapter.provider).toBe('azure-openai')
    expect(typeof adapter.stream).toBe('function')
  })
})
