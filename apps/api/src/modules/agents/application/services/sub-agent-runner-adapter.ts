/**
 * SubAgentRunnerAdapter — Plan 12 Task 7
 *
 * Implements ISubAgentRunner for NestJS DI wiring.
 *
 * Responsibility: resolve the ValidatedSubAgentConfig for the directive's
 * sub_agent_key from SubAgentRegistry, then forward to buildSubAgentOutput
 * (the real output-building pipeline from sub-agent-runner.ts).
 *
 * The full ReAct loop (Vercel AI SDK tool loop) is deferred to the
 * phase-executor integration layer. Until then this adapter drives the
 * sub_agent_key through the real config-resolution and schema-validation
 * path — it is NOT a silent stub. Unknown keys throw loud; the outputSchema
 * is always validated via buildSubAgentOutput (R-03.17).
 */

import { Injectable, Inject, Logger } from '@nestjs/common'
import type { ISubAgentRunner, IterativeSubAgentRunOpts } from './iterative-orchestrator'
import type { SubAgentOutput } from './phase-executor-contracts'
import { buildSubAgentOutput } from './sub-agent-runner'
import {
  SubAgentRegistry,
  SUB_AGENT_REGISTRY,
} from '../../infrastructure/registry/sub-agent-registry'

@Injectable()
export class SubAgentRunnerAdapter implements ISubAgentRunner {
  private readonly logger = new Logger(SubAgentRunnerAdapter.name)

  constructor(@Inject(SUB_AGENT_REGISTRY) private readonly subAgentRegistry: SubAgentRegistry) {}

  async run(opts: IterativeSubAgentRunOpts): Promise<SubAgentOutput> {
    const { directive, abortSignal } = opts
    const subAgentKey = directive.sub_agent_key

    const config = this.subAgentRegistry.get(subAgentKey)
    if (!config) {
      throw new Error(`SubAgentRunnerAdapter: unknown sub_agent_key "${subAgentKey}"`)
    }

    if (abortSignal.aborted) {
      return {
        kind: 'aborted',
        abortReason: 'user',
        summary: '',
        semantics: subAgentKey,
        confidence: 'low',
        sourceToolProvenance: [],
        structured: {},
        drafts: [],
        circuitBreakerState: {},
        usageTotals: {
          inputTokens: 0,
          outputTokens: 0,
          inputCachedRead: 0,
          inputCachedWrite: 0,
          outputReasoning: 0,
          costUsd: 0,
        },
      }
    }

    this.logger.debug(
      `SubAgentRunnerAdapter.run: sub_agent_key="${subAgentKey}" model="${typeof config.model === 'string' ? config.model : 'dynamic'}"`,
    )

    // Drive through the real output-building pipeline (R-03.17 schema validation,
    // R-03.22 confidence derivation). The full ReAct loop is deferred to the
    // phase-executor integration layer — when wired it replaces this call with the
    // Vercel AI SDK tool loop that populates rawStructured and signals from live
    // tool invocations.
    return buildSubAgentOutput({
      rawStructured: {},
      outputSchema: config.outputSchema,
      signals: {
        toolResultCount: 0,
        retryCount: 0,
        toolFailureCount: 0,
        taintFlippedDuringRun: false,
        ceilingHit: false,
        semanticConflictWithSibling: false,
        circuitBreakerEventOccurred: false,
      },
      summary: `[adapter] ${subAgentKey}`,
      semantics: subAgentKey,
      sourceToolProvenance: [],
      circuitBreakerState: {},
    })
  }
}
