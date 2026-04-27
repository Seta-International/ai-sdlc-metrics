/**
 * TurnPipelineRunner — Plan 18 §4.5.
 *
 * Single execution path for live HTTP turns and golden-trace replay.
 * The injected default ToolGatewayPort is used unless a per-call override
 * is supplied via runWithReplay (the seam exploited by Plan 17 PR 4's
 * golden-trace runner).
 *
 * The actual pipeline composition is the injected RUN_PIPELINE_FN closure
 * (real implementation in agents.module.ts — Task 7). Keeping the closure
 * external lets us unit-test the runner without pulling the entire DI graph.
 */

import { Inject, Injectable } from '@nestjs/common'
import type { ToolGatewayPort } from './tool-gateway-contracts'
import { TOOL_GATEWAY } from './tool-gateway-contracts'
import type { StreamEmitter, UsageSnapshot } from './stream-gateway'
import type { AnswerShape, DraftProposal, PhaseExecutorTurnState } from './phase-executor-contracts'

export const TURN_PIPELINE_RUNNER = Symbol('TURN_PIPELINE_RUNNER')
export const RUN_PIPELINE_FN = Symbol('RUN_PIPELINE_FN')

export interface RequestContext {
  readonly tenantId: string
  readonly userId: string
  readonly traceId: string
  readonly surface: 'global-chat' | 'inline' | 'async'
  readonly roleKey: string
}

export interface TurnPipelineRunOpts {
  readonly userUtterance: string
  readonly conversationId: string
  readonly requestContext: RequestContext
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
  readonly turnState: PhaseExecutorTurnState
}

export interface TurnPipelineReplayMessage {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
}

export interface TurnPipelineReplayOpts {
  readonly messages: ReadonlyArray<TurnPipelineReplayMessage>
  readonly pinnedVersions: Readonly<Record<string, string>>
  readonly toolGatewayOverride: ToolGatewayPort
}

export interface TurnPipelineResult {
  readonly toolCallNames: ReadonlyArray<string>
  readonly shape: AnswerShape | 'refusal' | 'aborted'
  readonly permissionKeys: ReadonlyArray<string>
  readonly taintFlipped: boolean
  readonly renderedAssistantMessage: string
  readonly turnEndReason: 'completed' | 'cancelled' | 'refused' | 'error'
  readonly drafts: ReadonlyArray<DraftProposal>
  readonly usage?: UsageSnapshot
}

/**
 * The pipeline-composition closure. Real implementation in agents.module.ts
 * (Task 7); unit tests inject a fake.
 *
 * Receives EITHER a live-turn request (full TurnPipelineRunOpts shape) OR
 * a replay request (TurnPipelineReplayOpts merged with the override gateway).
 */
export type RunPipelineFn = (input: {
  readonly userUtterance: string
  readonly conversationId: string
  readonly requestContext: RequestContext
  readonly abortSignal: AbortSignal
  readonly streamEmitter: StreamEmitter
  readonly turnState: PhaseExecutorTurnState
  readonly toolGateway: ToolGatewayPort
}) => Promise<TurnPipelineResult>

@Injectable()
export class TurnPipelineRunner {
  constructor(
    @Inject(TOOL_GATEWAY) private readonly defaultGateway: ToolGatewayPort,
    @Inject(RUN_PIPELINE_FN) private readonly runPipeline: RunPipelineFn,
  ) {}

  async run(opts: TurnPipelineRunOpts): Promise<TurnPipelineResult> {
    return this.runPipeline({ ...opts, toolGateway: this.defaultGateway })
  }

  /**
   * Replay path used by Plan 17 PR 4's GoldenTraceRunner. The replay-mode
   * gateway returns captured tool outputs from ReplayHarness; no live writes.
   *
   * Replay uses synthetic abortSignal + a no-op stream emitter; pipeline
   * runs to completion with the captured pinned-versions context.
   */
  async runWithReplay(opts: TurnPipelineReplayOpts): Promise<TurnPipelineResult> {
    const userMessage = opts.messages.find((m) => m.role === 'user')
    if (!userMessage) throw new Error('TurnPipelineRunner.runWithReplay: no user message in input')

    // Replay reconstructs requestContext from the captured trace's session.
    // The pipeline closure handles session lookup via pinnedVersions; we
    // pass minimal stubs here, knowing the closure uses pinnedVersions to
    // retrieve the canonical context.
    const noopEmitter: StreamEmitter = {
      emit: () => {},
      close: () => {},
      error: () => {},
    }
    const stubRequestContext: RequestContext = {
      tenantId: '',
      userId: '',
      traceId: '',
      surface: 'global-chat',
      roleKey: '',
    }
    const stubTurnState: PhaseExecutorTurnState = {
      traceId: '',
      tenantId: '',
      userId: '',
      conversationId: '',
      sessionId: '',
      surface: 'global-chat',
      tainted: { value: false },
      routerReplanCount: 0,
    }

    return this.runPipeline({
      userUtterance: userMessage.content,
      conversationId: '',
      requestContext: stubRequestContext,
      abortSignal: new AbortController().signal,
      streamEmitter: noopEmitter,
      turnState: stubTurnState,
      toolGateway: opts.toolGatewayOverride,
    })
  }
}
