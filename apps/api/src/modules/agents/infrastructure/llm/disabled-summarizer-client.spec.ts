import { describe, it, expect } from 'vitest'
import { DisabledSummarizerAiClient } from './disabled-summarizer-client'

describe('DisabledSummarizerAiClient', () => {
  it('rejects with an error matching /disabled in Phase 1/', async () => {
    const client = new DisabledSummarizerAiClient()
    await expect(client.generateText('any prompt')).rejects.toThrow(/disabled in Phase 1/)
  })
})
