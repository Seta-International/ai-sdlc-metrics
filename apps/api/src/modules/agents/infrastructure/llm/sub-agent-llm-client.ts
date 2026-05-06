/**
 * SubAgentLlmClient — sub-agent ReAct loop.
 *
 * Wraps Vercel AI SDK `generateText` with `stopWhen: stepCountIs(maxIterations)`,
 * `maxRetries: 0` (retries live at gateway only), and structured output
 * extraction via `experimental_output: Output.object(...)`.
 *
 * Falls back to a follow-up `generateObject` call against `outputSchema` if
 * `experimental_output` is unavailable in the installed SDK version.
 */

// OPENAI_API_KEY sourcing contract:
//   - In production (ECS Fargate): Terraform defines a Secrets Manager secret;
//     the ECS task definition maps the secret value into the container's
//     environment as OPENAI_API_KEY. The value never touches a committed file,
//     .env, DB, or build artifact.
//   - In local development: developer's shell exports OPENAI_API_KEY from a
//     secure source (1Password, AWS CLI session). NEVER commit a .env file
//     containing this key.

import { Injectable, OnModuleInit } from '@nestjs/common'
import { generateText, generateObject, stepCountIs, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { ZodType } from 'zod'
import type { ModelChoice } from '../../domain/services/sub-agent-types'
import type { SubAgentUsage } from '../../application/services/phase-executor-contracts'
import { mapLanguageModelUsage, type LanguageModelUsageLike } from './usage'
import { withProviderRetry } from '../adapters/provider-retry'

export const SUB_AGENT_LLM_CLIENT = Symbol('SUB_AGENT_LLM_CLIENT')

/**
 * The Vercel AI SDK tool element type, derived from `generateText`'s `tools`
 * parameter. We expose this as `AiSdkTool` so callers (e.g. the
 * tool-gateway-bridge) can build a `Record<string, AiSdkTool>` to pass through.
 */
export type AiSdkTool = Parameters<typeof generateText>[0]['tools'] extends infer T
  ? T extends Record<string, infer U> | undefined
    ? U
    : never
  : never

export interface SubAgentLlmClientOpts {
  readonly model: ModelChoice
  readonly system: string
  readonly userMessage: string
  readonly tools: Record<string, AiSdkTool>
  readonly outputSchema: ZodType
  readonly maxIterations: number
  readonly abortSignal: AbortSignal
}

export interface SubAgentLlmClientResult {
  readonly rawStructured: unknown
  readonly text: string
  readonly steps: ReadonlyArray<unknown>
  readonly usage: SubAgentUsage
  readonly finishReason: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error' | 'other'
}

export interface SubAgentLlmClient {
  runWithTools(opts: SubAgentLlmClientOpts): Promise<SubAgentLlmClientResult>
}

function resolveModel(choice: ModelChoice) {
  switch (choice.provider) {
    case 'openai': {
      const client = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] })
      return client(choice.model)
    }
    case 'anthropic': {
      throw new Error(
        `SubAgentLlmClient: provider "anthropic" is not yet supported. ` +
          `Add @ai-sdk/anthropic and wire it here.`,
      )
    }
    default: {
      // Exhaustive check — TypeScript will catch this if ModelChoice gains a new provider.
      const _exhaustive: never = choice.provider
      throw new Error(`SubAgentLlmClient: unknown model provider "${String(_exhaustive)}"`)
    }
  }
}

@Injectable()
export class OpenAiSubAgentLlmClient implements SubAgentLlmClient, OnModuleInit {
  /**
   * Validates that OPENAI_API_KEY is present in the environment.
   * Called once at module init (NestJS lifecycle hook) so the failure is loud
   * and immediate at boot rather than silently failing on the first request.
   *
   * Per the sourcing contract above: the key originates in AWS Secrets Manager;
   * Terraform/ECS maps it into the container environment. It must never appear
   * in a committed file, .env, DB, or build artifact.
   */
  onModuleInit(): void {
    if (!process.env['OPENAI_API_KEY'] && !process.env['LOCAL_DEV']) {
      throw new Error(
        'OPENAI_API_KEY missing — required to be provided via ECS Secrets Manager mapping per CLAUDE.md secrets rule',
      )
    }
  }

  async runWithTools(opts: SubAgentLlmClientOpts): Promise<SubAgentLlmClientResult> {
    const model = resolveModel(opts.model)

    return withProviderRetry(
      async () => {
        // Cast is load-bearing: the SDK's `ToolSet` index signature is invariant
        // over the per-tool input/output generics, so a generic
        // `Record<string, AiSdkTool>` (where `AiSdkTool` widens to `unknown`-shaped
        // tools) is not assignable. `experimental_output` is also not yet on the
        // public input type. Both narrow once the SDK exposes a covariant ToolSet
        // helper and promotes experimental_output to GenerateTextOptions.
        const result = await generateText({
          model,
          system: opts.system,
          prompt: opts.userMessage,
          tools: opts.tools,
          stopWhen: stepCountIs(opts.maxIterations),
          maxRetries: 0,
          abortSignal: opts.abortSignal,
          experimental_output: Output.object({ schema: opts.outputSchema }),
        } as Parameters<typeof generateText>[0])

        let rawStructured: unknown = (result as unknown as { experimental_output?: unknown })
          .experimental_output
        if (rawStructured === undefined) {
          // Fallback: extract structured output from the final text via generateObject.
          const followup = await generateObject({
            model,
            schema: opts.outputSchema,
            prompt: result.text,
            maxRetries: 0,
            abortSignal: opts.abortSignal,
          })
          rawStructured = followup.object
        }

        return {
          rawStructured,
          text: result.text,
          steps: result.steps as unknown as ReadonlyArray<unknown>,
          usage: mapLanguageModelUsage(result.usage as LanguageModelUsageLike),
          finishReason: result.finishReason as SubAgentLlmClientResult['finishReason'],
        }
      },
      { maxAttempts: 2 },
    )
  }
}
