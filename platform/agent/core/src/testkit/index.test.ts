import { describe, expect, it } from 'vitest'
import * as testkit from './index'

describe('@seta/agent-core/testkit export contract', () => {
  it('exposes the recording API', () => {
    expect(typeof testkit.setupLLMRecording).toBe('function')
    expect(typeof testkit.hashRequest).toBe('function')
    expect(typeof testkit.serializeRequestContent).toBe('function')
  })
  it('exposes FakeAdapter', () => {
    expect(typeof testkit.FakeAdapter).toBe('function')
  })
})
