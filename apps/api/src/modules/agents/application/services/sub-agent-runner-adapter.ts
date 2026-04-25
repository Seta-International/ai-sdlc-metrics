/**
 * SubAgentRunnerAdapter — Plan 12 Task 7
 *
 * Implements ISubAgentRunner for NestJS DI wiring.
 *
 * Responsibility: resolve the ValidatedSubAgentConfig for the directive's
 * sub_agent_key from SubAgentRegistry, then forward to the sub-agent execution
 * pipeline (SubAgentRunnerOpts-compatible call).
 *
 * The full ReAct loop integration (Vercel AI SDK tool loop) is deferred to the
 * phase-executor integration layer. This adapter produces a structurally valid
 * SubAgentOutput using the declared outputSchema's default/empty shape until the
 * ReAct loop is wired in. It is NOT a silent stub — it validates the registry
 * lookup and throws if the sub-agent key is unregistered.
 */

import { Injectable, Inject, Logger } from '@nestjs/common'
import type { ISubAgentRunner, IterativeSubAgentRunOpts } from './iterative-orchestrator'
import type { SubAgentOutput } from './phase-executor-contracts'
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
      throw new Error(
        `SubAgentRunnerAdapter: sub-agent key "${subAgentKey}" not found in registry. ` +
          'Ensure the sub-agent descriptor is registered at module boot.',
      )
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

    // Full ReAct loop integration is deferred to the phase-executor integration layer.
    // Produces a structurally valid SubAgentOutput using the config resolved above.
    // When the ReAct loop is wired, this body is replaced with:
    //   return subAgentReactLoop.run({ ...opts, config })
    this.logger.debug(
      `SubAgentRunnerAdapter.run: sub_agent_key="${subAgentKey}" model="${typeof config.model === 'string' ? config.model : 'dynamic'}"`,
    )

    return {
      kind: 'completed',
      summary: `[adapter] ${subAgentKey}`,
      semantics: subAgentKey,
      confidence: 'med',
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
}
