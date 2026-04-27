/**
 * Integration: GoldenTraceRunner against real ReplayHarness, real DB,
 * stub LLM clients (FakeSubAgentLlmClient + FakeSynthesizerLlmClient
 * configured to produce matching toolCallNames).
 */
import { describe, it } from 'vitest'

describe('GoldenTraceRunner integration', () => {
  it.todo('seeded golden trace passes the CI gate when pipeline reproduces fingerprint')
  it.todo('seeded golden trace fails the CI gate when expectedShape diverges from real')
  it.todo('replay miss yields MARKER_REPLAY_FAILED and a regression report')
})
