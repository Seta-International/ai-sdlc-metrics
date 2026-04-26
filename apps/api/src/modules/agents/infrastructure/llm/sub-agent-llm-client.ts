/**
 * SubAgentLlmClient — Plan 17 §4.2 (sub-agent ReAct loop).
 *
 * Wraps Vercel AI SDK `generateText` with `stopWhen: stepCountIs(maxIterations)`,
 * `maxRetries: 0` (Plan 03 R-03.16 — retries live at gateway only), and
 * structured output extraction via `experimental_output: Output.object(...)`.
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

import { Injectable } from '@nestjs/common'
import { generateText, generateObject, stepCountIs, Output } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { ZodType } from 'zod'
import type { ModelChoice } from '../../domain/services/sub-agent-types'
import type { SubAgentUsage } from '../../application/services/phase-executor-contracts'

// ─── DI token ─────────────────────────────────────────────────────────────────

export const SUB_AGENT_LLM_CLIENT = Symbol('SUB_AGENT_LLM_CLIENT')

// ─── Tool type ────────────────────────────────────────────────────────────────

/**
 * The Vercel AI SDK tool element type, derived from `generateText`'s `tools`
 * parameter. We expose this as `AiSdkTool` so callers (e.g. the
 * tool-gateway-bridge in Task 4) can build a `Record<string, AiSdkTool>` to
 * pass through.
 */
export type AiSdkTool = Parameters<typeof generateText>[0]['tools'] extends infer T
  ? T extends Record<string, infer U> | undefined
    ? U
    : never
  : never

// ─── Input + Result types ─────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveModel(choice: ModelChoice) {
  switch (choice.provider) {
    case 'openai': {
      const client = createOpenAI({ apiKey: process.env['OPENAI_API_KEY'] })
      return client(choice.model)
    }
    default:
      throw new Error(`Unsupported provider "${choice.provider}" in SubAgentLlmClient`)
  }
}

function mapUsage(u: {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}): SubAgentUsage {
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    inputCachedRead: 0,
    inputCachedWrite: 0,
    outputReasoning: 0,
    costUsd: 0, // populated downstream by cost-recorder
  }
}

// ─── OpenAiSubAgentLlmClient ─────────────────────────────────────────────────

@Injectable()
export class OpenAiSubAgentLlmClient implements SubAgentLlmClient {
  async runWithTools(opts: SubAgentLlmClientOpts): Promise<SubAgentLlmClientResult> {
    const model = resolveModel(opts.model)

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
      usage: mapUsage(
        result.usage as { inputTokens?: number; outputTokens?: number; totalTokens?: number },
      ),
      finishReason: result.finishReason as SubAgentLlmClientResult['finishReason'],
    }
  }
}
