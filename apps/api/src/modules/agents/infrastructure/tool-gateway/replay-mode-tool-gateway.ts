import type {
  ToolGatewayPort,
  ToolGatewayInvokeInput,
} from '../../application/services/tool-gateway-contracts'
import type { ToolGatewayResult } from '../guards/tripwire'
import { ok } from '../guards/tripwire'
import type { ToolCallRecord } from '../../domain/scorer-types'
import { ReplayToolOutputMissError } from '../../application/services/replay-harness'

/**
 * ToolGatewayPort implementation backed by captured ToolCallRecord[] from ReplayHarness.
 *
 * For each invoke(input), looks up a record matching (toolName, canonicalArgs).
 * On hit, returns an OK result wrapping the captured result (fromCache: false — replay
 * is not a cache hit, it's a deterministic replay).
 * On miss, throws ReplayToolOutputMissError so the GoldenTraceRunner can distinguish
 * "output not captured" from a genuine tool failure.
 *
 * Plan 17 PR 4 Task 13.
 */
export class ReplayModeToolGateway implements ToolGatewayPort {
  constructor(
    private readonly capturedOutputs: ReadonlyArray<ToolCallRecord>,
    private readonly canonicalize: (args: unknown) => string,
  ) {}

  async invoke(input: ToolGatewayInvokeInput): Promise<ToolGatewayResult> {
    const argsHash = this.canonicalize(input.args)
    const match = this.capturedOutputs.find(
      (r) => r.toolName === input.toolName && this.canonicalize(r.args) === argsHash,
    )
    if (!match) {
      throw new ReplayToolOutputMissError(input.toolName, input.requestContext.traceId)
    }
    return ok(match.result, /* fromCache */ false)
  }
}
