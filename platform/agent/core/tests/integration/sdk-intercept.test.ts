import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupLLMRecording } from '../../src/testkit/recording'

const recordingsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__recordings__')

const recOpenai = setupLLMRecording({ name: 'sdk-intercept-openai', recordingsDir })

describe('OpenAI SDK is interceptable via MSW', () => {
  beforeAll(() => recOpenai.start())
  afterAll(() => recOpenai.stop())

  it('routes chat.completions.create through the testkit', { timeout: 30_000 }, async () => {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? 'sk-test-fake',
      maxRetries: 0,
    })
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    })
    expect(res.id).toBeTruthy()
    expect(res.choices[0]?.message.content).toBeTruthy()
  })
})
