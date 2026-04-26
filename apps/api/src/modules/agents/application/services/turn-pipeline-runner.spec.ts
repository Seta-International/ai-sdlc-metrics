import { describe, expect, it, vi } from 'vitest'
import {
  TurnPipelineRunner,
  type RunPipelineFn,
  type TurnPipelineRunOpts,
  type TurnPipelineReplayOpts,
  type TurnPipelineResult,
} from './turn-pipeline-runner'
import type { ToolGatewayPort } from './tool-gateway-contracts'

const fakeGateway: ToolGatewayPort = { invoke: vi.fn() }
const overrideGateway: ToolGatewayPort = { invoke: vi.fn() }

const baseLiveOpts: TurnPipelineRunOpts = {
  userUtterance: 'hello',
  conversationId: 'conv-1',
  requestContext: {
    tenantId: 'T1',
    userId: 'U1',
    traceId: 'tr-1',
    surface: 'global-chat',
    roleKey: 'admin',
  },
  abortSignal: new AbortController().signal,
  streamEmitter: { emit: vi.fn(), close: vi.fn(), error: vi.fn() },
  turnState: {
    traceId: 'tr-1',
    tenantId: 'T1',
    userId: 'U1',
    conversationId: 'conv-1',
    sessionId: '',
    surface: 'global-chat',
    tainted: { value: false },
    routerReplanCount: 0,
  },
}

function makeRun(): RunPipelineFn {
  const result: TurnPipelineResult = {
    toolCallNames: ['t'],
    shape: 'narrative',
    permissionKeys: [],
    taintFlipped: false,
    renderedAssistantMessage: 'ok',
    turnEndReason: 'completed',
    drafts: [],
  }
  return vi.fn().mockResolvedValue(result)
}

describe('TurnPipelineRunner', () => {
  it('run() invokes the closure with the default gateway when no override given', async () => {
    const run = makeRun()
    const runner = new TurnPipelineRunner(fakeGateway, run)
    const result = await runner.run(baseLiveOpts)

    expect(run).toHaveBeenCalledTimes(1)
    const call = (run as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.toolGateway).toBe(fakeGateway)
    expect(result.shape).toBe('narrative')
  })

  it('runWithReplay() invokes the closure with the override gateway', async () => {
    const run = makeRun()
    const runner = new TurnPipelineRunner(fakeGateway, run)

    const replayOpts: TurnPipelineReplayOpts = {
      messages: [{ role: 'user', content: 'replay me' }],
      pinnedVersions: { routerPrompt: 'rp1' },
      toolGatewayOverride: overrideGateway,
    }
    await runner.runWithReplay(replayOpts)

    const call = (run as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.toolGateway).toBe(overrideGateway)
    expect(call.userUtterance).toBe('replay me')
  })

  it('forwards abortSignal, streamEmitter, turnState, requestContext through to the closure on run()', async () => {
    const run = makeRun()
    const runner = new TurnPipelineRunner(fakeGateway, run)
    await runner.run(baseLiveOpts)

    const arg = (run as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.abortSignal).toBe(baseLiveOpts.abortSignal)
    expect(arg.streamEmitter).toBe(baseLiveOpts.streamEmitter)
    expect(arg.turnState).toBe(baseLiveOpts.turnState)
    expect(arg.requestContext).toBe(baseLiveOpts.requestContext)
  })

  it('runWithReplay() throws when no user message is present in the replay input', async () => {
    const run = makeRun()
    const runner = new TurnPipelineRunner(fakeGateway, run)

    const replayOpts: TurnPipelineReplayOpts = {
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'assistant', content: 'a prior assistant turn' },
      ],
      pinnedVersions: {},
      toolGatewayOverride: overrideGateway,
    }

    await expect(runner.runWithReplay(replayOpts)).rejects.toThrow(/no user message/)
    expect(run).not.toHaveBeenCalled()
  })
})
